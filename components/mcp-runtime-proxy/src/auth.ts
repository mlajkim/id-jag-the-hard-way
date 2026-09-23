import { createPublicKey, verify, type KeyObject } from "node:crypto"
import http from "node:http"
import https from "node:https"

const MAX_JWKS_BYTES = 1024 * 1024
const MAX_TOKEN_BYTES = 32 * 1024

type JwtRecord = Record<string, unknown>

export type SigningKeyResolver = (kid: string, forceRefresh?: boolean) => Promise<KeyObject>

export type VerifiedAthenzAccessToken = {
  audiences: string[]
  clientId?: string
  expiresAt: string
  expiresInSeconds: number
  keyId: string
  scopes: string[]
  subject?: string
  userId?: string
}

export type AthenzAccessTokenVerifier = {
  verify(authorization: string | undefined): Promise<VerifiedAthenzAccessToken | void>
}

export type AccessTokenDiagnostics = {
  reason: string
  expectedAudience?: string
  requiredScope?: string
  keyId?: string
  signatureVerified?: boolean
  audiences?: string[]
  scopes?: string[]
  expiresAt?: string
  expiresInSeconds?: number
  notBefore?: string
  validInSeconds?: number
}

export class AccessTokenError extends Error {
  readonly status: 401 | 403
  readonly code: "missing_access_token" | "invalid_access_token" | "insufficient_scope"
  readonly diagnostics?: AccessTokenDiagnostics

  constructor(
    status: 401 | 403,
    code: "missing_access_token" | "invalid_access_token" | "insufficient_scope",
    message: string,
    diagnostics?: AccessTokenDiagnostics,
  ) {
    super(message)
    this.status = status
    this.code = code
    this.diagnostics = diagnostics
  }
}

export class JwksUnavailableError extends Error {}

export function createAthenzAccessTokenVerifier({
  expectedAudience,
  now = Date.now,
  requiredScope,
  resolveSigningKey,
}: {
  expectedAudience: string
  now?: () => number
  requiredScope: string
  resolveSigningKey: SigningKeyResolver
}): AthenzAccessTokenVerifier {
  if (!validAthenzName(expectedAudience)) throw new Error("ATHENZ_EXPECTED_AUDIENCE is invalid")
  const rolePrefix = `${expectedAudience}:role.`
  if (!requiredScope.startsWith(rolePrefix) || !validAthenzName(requiredScope.slice(rolePrefix.length))) {
    throw new Error("ATHENZ_REQUIRED_SCOPE must be a role in ATHENZ_EXPECTED_AUDIENCE")
  }
  const shortScope = requiredScope.slice(rolePrefix.length)

  return {
    async verify(authorization) {
      const diagnostics: Omit<AccessTokenDiagnostics, "reason"> = { expectedAudience, requiredScope }
      try {
        const token = bearerToken(authorization, expectedAudience, requiredScope)
        const parsed = parseJwt(token)
        diagnostics.keyId = parsed.header.kid
        diagnostics.signatureVerified = false
        let signingKey = await resolveSigningKey(parsed.header.kid)
        let signatureValid = verifySignature(parsed, signingKey)
        if (!signatureValid) {
          signingKey = await resolveSigningKey(parsed.header.kid, true)
          signatureValid = verifySignature(parsed, signingKey)
        }
        if (!signatureValid) throw invalidToken("invalid_signature")
        diagnostics.signatureVerified = true

        // Only include claim values in denial logs after verifying the signature.
        const currentTime = Math.floor(now() / 1000)
        if (!validNumericDate(parsed.claims.exp)) throw invalidToken("invalid_expiration")
        diagnostics.expiresAt = new Date(parsed.claims.exp * 1000).toISOString()
        diagnostics.expiresInSeconds = parsed.claims.exp - currentTime
        if (parsed.claims.exp <= currentTime) throw invalidToken("token_expired")

        if (parsed.claims.nbf !== undefined) {
          if (!validNumericDate(parsed.claims.nbf)) throw invalidToken("invalid_not_before")
          diagnostics.notBefore = new Date(parsed.claims.nbf * 1000).toISOString()
          diagnostics.validInSeconds = parsed.claims.nbf - currentTime
          if (parsed.claims.nbf > currentTime) throw invalidToken("token_not_yet_valid")
        }

        const audiences = tokenAudiences(parsed.claims.aud)
        diagnostics.audiences = [...audiences].sort()
        if (!audiences.includes(expectedAudience)) throw invalidToken("audience_mismatch")

        const scopes = tokenScopes(parsed.claims)
        diagnostics.scopes = [...scopes].sort()
        const hasRequiredScope = scopes.has(requiredScope)
          || (audiences.length === 1 && scopes.has(shortScope))
        if (!hasRequiredScope) {
          throw new AccessTokenError(
            403,
            "insufficient_scope",
            `The Athenz access token must grant ${requiredScope}.`,
            { reason: "missing_required_scope" },
          )
        }

        return {
          audiences: diagnostics.audiences,
          clientId: stringClaim(parsed.claims.client_id),
          expiresAt: diagnostics.expiresAt,
          expiresInSeconds: diagnostics.expiresInSeconds,
          keyId: parsed.header.kid,
          scopes: diagnostics.scopes,
          subject: stringClaim(parsed.claims.sub),
          userId: stringClaim(parsed.claims.uid),
        }
      } catch (error) {
        if (error instanceof AccessTokenError) {
          throw new AccessTokenError(error.status, error.code, error.message, {
            ...diagnostics,
            reason: error.code,
            ...error.diagnostics,
          })
        }
        throw error
      }
    },
  }
}

export function createRemoteJwksKeyResolver({
  allowInsecureHttp = false,
  ca,
  cacheTtlMs = 5 * 60 * 1000,
  jwksUrl,
  timeoutMs = 5000,
}: {
  allowInsecureHttp?: boolean
  ca?: Buffer
  cacheTtlMs?: number
  jwksUrl: URL
  timeoutMs?: number
}): SigningKeyResolver {
  if (jwksUrl.username || jwksUrl.password) throw new Error("ATHENZ_JWKS_URL must not contain credentials")
  if (jwksUrl.protocol !== "https:" && !(allowInsecureHttp && jwksUrl.protocol === "http:")) {
    throw new Error("ATHENZ_JWKS_URL must use https")
  }
  if (!Number.isFinite(cacheTtlMs) || cacheTtlMs <= 0) throw new Error("JWKS cache TTL must be positive")
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("JWKS timeout must be positive")

  let cache: { expiresAt: number; keys: Map<string, KeyObject> } | undefined
  let pending: Promise<Map<string, KeyObject>> | undefined

  async function load(forceRefresh: boolean) {
    if (!forceRefresh && cache && cache.expiresAt > Date.now()) return cache.keys
    if (!pending) {
      const endpoint = new URL(jwksUrl)
      if (forceRefresh) endpoint.searchParams.set("r", "1")
      pending = fetchJwks(endpoint, { ca, timeoutMs })
        .then((keys) => {
          cache = { expiresAt: Date.now() + cacheTtlMs, keys }
          return keys
        })
        .finally(() => { pending = undefined })
    }
    return pending
  }

  return async (kid, forceRefresh = false) => {
    let keys = await load(forceRefresh)
    let key = keys.get(kid)
    if (!key && !forceRefresh) {
      keys = await load(true)
      key = keys.get(kid)
    }
    if (!key) throw invalidToken("unknown_signing_key")
    return key
  }
}

function bearerToken(authorization: string | undefined, expectedAudience: string, requiredScope: string) {
  if (!authorization) {
    throw new AccessTokenError(
      401,
      "missing_access_token",
      `Pass an Athenz access token with aud=${expectedAudience} and scope=${requiredScope} as Authorization: Bearer <token>.`,
      { reason: "missing_authorization" },
    )
  }
  const match = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(authorization)
  if (!match) throw invalidToken("malformed_authorization")
  if (Buffer.byteLength(match[1]) > MAX_TOKEN_BYTES) throw invalidToken("token_too_large")
  return match[1]
}

function parseJwt(token: string) {
  const [encodedHeader, encodedClaims, encodedSignature] = token.split(".")
  const header = decodeRecord(encodedHeader)
  const claims = decodeRecord(encodedClaims)
  if (header.alg !== "RS256") throw invalidToken("unsupported_algorithm")
  if (header.typ !== "at+jwt") throw invalidToken("invalid_token_type")
  if (typeof header.kid !== "string" || !header.kid) throw invalidToken("missing_key_id")

  let signature: Buffer
  try {
    signature = Buffer.from(encodedSignature, "base64url")
  } catch {
    throw invalidToken("malformed_jwt")
  }
  if (signature.length === 0) throw invalidToken("malformed_jwt")

  return {
    claims,
    header: { kid: header.kid },
    signature,
    signingInput: Buffer.from(`${encodedHeader}.${encodedClaims}`, "ascii"),
  }
}

function verifySignature(
  token: ReturnType<typeof parseJwt>,
  signingKey: KeyObject,
) {
  try {
    return verify("RSA-SHA256", token.signingInput, signingKey, token.signature)
  } catch {
    return false
  }
}

function decodeRecord(value: string) {
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown
    if (decoded && typeof decoded === "object" && !Array.isArray(decoded)) return decoded as JwtRecord
  } catch {
    // Return the stable token error below.
  }
  throw invalidToken("malformed_jwt")
}

function tokenAudiences(value: unknown) {
  const audiences = typeof value === "string"
    ? [value]
    : Array.isArray(value) && value.every((audience) => typeof audience === "string")
      ? value
      : []
  const normalized = [...new Set(audiences.map((audience) => audience.trim()).filter(Boolean))]
  if (normalized.length === 0) throw invalidToken("invalid_audience")
  return normalized
}

function tokenScopes(claims: JwtRecord) {
  const scopes = new Set<string>()
  for (const value of [claims.scp, claims.scope]) {
    if (value === undefined) continue
    if (typeof value === "string") {
      for (const scope of value.split(/\s+/)) if (scope) scopes.add(scope)
      continue
    }
    if (Array.isArray(value) && value.every((scope) => typeof scope === "string")) {
      for (const scope of value) if (scope) scopes.add(scope)
      continue
    }
    throw invalidToken("invalid_scope")
  }
  return scopes
}

async function fetchJwks(endpoint: URL, { ca, timeoutMs }: { ca?: Buffer; timeoutMs: number }) {
  let payload: unknown
  try {
    payload = await requestJson(endpoint, ca, timeoutMs)
  } catch (error) {
    throw new JwksUnavailableError(
      `Unable to load ZTS JWKS: ${error instanceof Error ? error.message : "request failed"}`,
    )
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new JwksUnavailableError("ZTS returned an invalid JWKS document")
  }
  const configuredKeys = (payload as { keys?: unknown }).keys
  if (!Array.isArray(configuredKeys)) throw new JwksUnavailableError("ZTS returned an invalid JWKS document")

  const keys = new Map<string, KeyObject>()
  for (const value of configuredKeys) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue
    const jwk = value as JsonWebKey
    if (
      typeof jwk.kid !== "string"
      || !jwk.kid
      || jwk.kty !== "RSA"
      || (jwk.use !== undefined && jwk.use !== "sig")
      || (jwk.alg !== undefined && jwk.alg !== "RS256")
      || typeof jwk.n !== "string"
      || typeof jwk.e !== "string"
    ) continue
    if (keys.has(jwk.kid)) throw new JwksUnavailableError("ZTS JWKS contains duplicate signing key IDs")
    try {
      keys.set(jwk.kid, createPublicKey({ key: jwk, format: "jwk" }))
    } catch {
      throw new JwksUnavailableError("ZTS JWKS contains an invalid RSA signing key")
    }
  }
  if (keys.size === 0) throw new JwksUnavailableError("ZTS JWKS contains no supported signing keys")
  return keys
}

function requestJson(endpoint: URL, ca: Buffer | undefined, timeoutMs: number) {
  return new Promise<unknown>((resolve, reject) => {
    const transport = endpoint.protocol === "https:" ? https : http
    const request = transport.request(endpoint, {
      method: "GET",
      ...(endpoint.protocol === "https:" ? { ca } : {}),
      headers: { Accept: "application/json" },
      timeout: timeoutMs,
    }, (response) => {
      let body = ""
      let bytes = 0
      response.setEncoding("utf8")
      response.on("data", (chunk: string) => {
        bytes += Buffer.byteLength(chunk)
        if (bytes > MAX_JWKS_BYTES) {
          response.destroy(new Error("JWKS response exceeded the size limit"))
          return
        }
        body += chunk
      })
      response.on("end", () => {
        if (response.statusCode !== 200) {
          reject(new Error(`ZTS returned HTTP ${response.statusCode ?? "unknown"}`))
          return
        }
        try {
          resolve(JSON.parse(body) as unknown)
        } catch {
          reject(new Error("ZTS returned invalid JWKS JSON"))
        }
      })
      response.on("error", reject)
    })
    request.on("timeout", () => request.destroy(new Error("ZTS JWKS request timed out")))
    request.on("error", reject)
    request.end()
  })
}

function invalidToken(reason: string) {
  return new AccessTokenError(
    401,
    "invalid_access_token",
    "The Athenz access token is invalid or expired.",
    { reason },
  )
}

function validNumericDate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
    && Number.isFinite(new Date(value * 1000).getTime())
}

function validAthenzName(value: string) {
  return /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/.test(value)
}

function stringClaim(value: unknown) {
  return typeof value === "string" && value ? value : undefined
}
