import { createRemoteJWKSet, errors, jwtVerify, type JWTPayload } from "jose"

export class AccessTokenError extends Error {
  readonly status: 401 | 403 | 503
  readonly code: string

  constructor(status: 401 | 403 | 503, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export type AccessTokenVerifier = (authorization: string | undefined, requiredScope: string) => Promise<void>

const untrustedCertificateCodes = new Set([
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "UNABLE_TO_GET_ISSUER_CERT",
  "CERT_UNTRUSTED",
])

export function createAccessTokenVerifier({
  jwksUrl,
  expectedIssuer,
  allowInsecureHttp = false,
}: {
  jwksUrl: URL
  expectedIssuer?: string
  allowInsecureHttp?: boolean
}): AccessTokenVerifier {
  if (jwksUrl.username || jwksUrl.password) throw new Error("ATHENZ_JWKS_URL must not contain credentials")
  if (jwksUrl.protocol !== "https:" && !(allowInsecureHttp && jwksUrl.protocol === "http:")) {
    throw new Error("ATHENZ_JWKS_URL must use HTTPS")
  }
  // jose owns signature verification, key selection, caching, and key refresh.
  // HTTPS uses Node's trust store, including NODE_EXTRA_CA_CERTS when configured.
  const keys = createRemoteJWKSet(jwksUrl, { timeoutDuration: 5000, cacheMaxAge: 300_000 })

  return async (authorization, requiredScope) => {
    if (!authorization) {
      throw new AccessTokenError(401, "missing_access_token", "Pass an Athenz access token as Authorization: Bearer <token>.")
    }
    if (authorization.length > 32 * 1024) throw invalidToken()
    const match = /^Bearer (\S+)$/i.exec(authorization)
    if (!match) throw invalidToken()

    let claims: JWTPayload
    try {
      const verified = await jwtVerify(match[1], async (header, token) => {
        try {
          return await keys(header, token)
        } catch (error) {
          if (error instanceof errors.JWKSNoMatchingKey || error instanceof errors.JWKSMultipleMatchingKeys) throw error
          if (isUntrustedCertificate(error)) {
            throw new AccessTokenError(503, "zts_ca_untrusted",
              "Cannot verify the ZTS HTTPS certificate. Mount the CA certificate that signed it, set NODE_EXTRA_CA_CERTS to its path, and restart the API.")
          }
          throw new AccessTokenError(503, "authentication_unavailable", "Unable to load ZTS signing keys.")
        }
      }, {
        algorithms: ["RS256"],
        typ: "at+jwt",
        audience: "api",
        issuer: expectedIssuer,
        requiredClaims: ["iss", "sub", "aud", "exp"],
      })
      claims = verified.payload
      if (typeof verified.protectedHeader.kid !== "string" || !verified.protectedHeader.kid
        || typeof claims.iss !== "string" || !claims.iss.trim()
        || typeof claims.sub !== "string" || !claims.sub.trim()) throw invalidToken()
    } catch (error) {
      if (error instanceof AccessTokenError) throw error
      // Library errors may contain caller-supplied claims. Return a fixed message.
      throw invalidToken()
    }

    const scopes = new Set([...scopeValues(claims.scope), ...scopeValues(claims.scp)])
    const audiences = new Set(Array.isArray(claims.aud) ? claims.aud : [claims.aud])
    const shortScope = requiredScope.replace(/^api:role\./, "")
    if (!scopes.has(requiredScope) && !(audiences.size === 1 && scopes.has(shortScope))) {
      throw new AccessTokenError(403, "insufficient_scope", `Access token must grant ${requiredScope}.`)
    }
  }
}

function isUntrustedCertificate(error: unknown): boolean {
  const seen = new Set<Error>()
  while (error instanceof Error && !seen.has(error)) {
    seen.add(error)
    if ("code" in error && typeof error.code === "string" && untrustedCertificateCodes.has(error.code)) return true
    error = error.cause
  }
  return false
}

function scopeValues(value: unknown): string[] {
  if (value === undefined) return []
  if (typeof value === "string") return value.split(/\s+/).filter(Boolean)
  if (Array.isArray(value) && value.every((scope) => typeof scope === "string")) return value
  throw invalidToken()
}

function invalidToken() {
  return new AccessTokenError(401, "invalid_access_token", "Access token is invalid or expired.")
}
