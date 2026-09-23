import assert from "node:assert/strict"
import { generateKeyPairSync, sign } from "node:crypto"
import http, { type Server } from "node:http"
import test from "node:test"
import {
  AccessTokenError,
  createAthenzAccessTokenVerifier,
  createRemoteJwksKeyResolver,
  type AccessTokenDiagnostics,
} from "../src/auth.ts"

const NOW = 1_800_000_000_000
const AUDIENCE = "mcp-hub.mcps.k8s-docs-server"
const REQUIRED_SCOPE = `${AUDIENCE}:role.accessor`
const signingKeys = generateKeyPairSync("rsa", { modulusLength: 2048 })
const publicJwk = {
  ...signingKeys.publicKey.export({ format: "jwk" }),
  alg: "RS256",
  kid: "zts-test-key",
  use: "sig",
}

test("accepts a signed, unexpired Athenz access token for the required audience and scope", async () => {
  const verifier = verifierForTest()

  const verification = await verifier.verify(`Bearer ${accessToken({
    aud: AUDIENCE,
    client_id: "mcp-hub.mcp-gateway",
    exp: NOW / 1000 + 300,
    scp: ["accessor"],
    sub: "mcp-hub.mcp-gateway",
    uid: "idjag-learner",
  })}`)

  assert.deepEqual(verification, {
    audiences: [AUDIENCE],
    clientId: "mcp-hub.mcp-gateway",
    expiresAt: new Date(NOW + 300_000).toISOString(),
    expiresInSeconds: 300,
    keyId: "zts-test-key",
    scopes: ["accessor"],
    subject: "mcp-hub.mcp-gateway",
    userId: "idjag-learner",
  })
})

test("accepts a fully-qualified managed scope in a multi-audience token", async () => {
  const verifier = verifierForTest()

  await verifier.verify(`Bearer ${accessToken({
    aud: ["api", AUDIENCE],
    exp: NOW / 1000 + 300,
    scp: ["api:role.docs-getter", REQUIRED_SCOPE],
  })}`)
})

test("accepts the tutorial's two-domain scopes only with the MCP audience", async () => {
  const verifier = createAthenzAccessTokenVerifier({
    expectedAudience: "mcp",
    requiredScope: "mcp:role.mcp-accessor",
    now: () => NOW,
    resolveSigningKey: async () => signingKeys.publicKey,
  })
  const claims = {
    aud: "mcp",
    exp: NOW / 1000 + 300,
    scp: ["mcp-accessor", "api:role.docs-getter"],
  }
  await verifier.verify(`Bearer ${accessToken(claims)}`)
  await assertAccessError(() => verifier.verify(`Bearer ${accessToken({
    ...claims, aud: "api", scp: ["mcp:role.mcp-accessor", "docs-getter"],
  })}`), 401, "invalid_access_token", {
    reason: "audience_mismatch",
    expectedAudience: "mcp",
    requiredScope: "mcp:role.mcp-accessor",
    audiences: ["api"],
    signatureVerified: true,
    keyId: "zts-test-key",
    expiresAt: new Date(NOW + 300_000).toISOString(),
    expiresInSeconds: 300,
  })
  await assertAccessError(() => verifier.verify(`Bearer ${accessToken({
    ...claims, scp: ["api:role.docs-getter"],
  })}`), 403, "insufficient_scope")
})

test("rejects missing, expired, incorrectly signed, and wrong-audience tokens", async () => {
  const verifier = verifierForTest()
  const otherKeys = generateKeyPairSync("rsa", { modulusLength: 2048 })

  await assertAccessError(() => verifier.verify(undefined), 401, "missing_access_token", {
    reason: "missing_authorization",
    expectedAudience: AUDIENCE,
    requiredScope: REQUIRED_SCOPE,
  })
  await assertAccessError(() => verifier.verify(`Bearer ${accessToken({
    aud: AUDIENCE,
    exp: NOW / 1000,
    scp: ["accessor"],
  })}`), 401, "invalid_access_token", {
    reason: "token_expired",
    signatureVerified: true,
    expiresAt: new Date(NOW).toISOString(),
    expiresInSeconds: 0,
  })
  await assertAccessError(() => verifier.verify(`Bearer ${accessToken({
    aud: AUDIENCE,
    exp: NOW / 1000 + 300,
    scp: ["accessor"],
  }, otherKeys.privateKey)}`), 401, "invalid_access_token", {
    reason: "invalid_signature",
    signatureVerified: false,
    audiences: undefined,
    scopes: undefined,
    expiresAt: undefined,
    expiresInSeconds: undefined,
  })
  await assertAccessError(() => verifier.verify(`Bearer ${accessToken({
    aud: "other-domain",
    exp: NOW / 1000 + 300,
    scp: ["accessor"],
  })}`), 401, "invalid_access_token", { reason: "audience_mismatch", audiences: ["other-domain"] })
})

test("rejects a valid token without the required scope", async () => {
  const verifier = verifierForTest()

  await assertAccessError(() => verifier.verify(`Bearer ${accessToken({
    aud: AUDIENCE,
    exp: NOW / 1000 + 300,
    scp: ["reader"],
  })}`), 403, "insufficient_scope", {
    reason: "missing_required_scope",
    requiredScope: REQUIRED_SCOPE,
    scopes: ["reader"],
    signatureVerified: true,
  })
})

test("distinguishes malformed tokens and invalid claims from expiry and audience failures", async () => {
  const verifier = verifierForTest()
  const claims = { aud: AUDIENCE, exp: NOW / 1000 + 300, scp: ["accessor"] }
  for (const [authorization, reason] of [
    ["Basic not-a-bearer-token", "malformed_authorization"],
    [`Bearer ${"a".repeat(32 * 1024)}.e30.c2ln`, "token_too_large"],
    ["Bearer e30.bm90LWpzb24.c2ln", "malformed_jwt"],
    [`Bearer ${accessToken(claims, signingKeys.privateKey, { alg: "HS256" })}`, "unsupported_algorithm"],
    [`Bearer ${accessToken(claims, signingKeys.privateKey, { typ: "JWT" })}`, "invalid_token_type"],
    [`Bearer ${accessToken(claims, signingKeys.privateKey, { kid: "" })}`, "missing_key_id"],
    [`Bearer ${accessToken({ ...claims, exp: undefined })}`, "invalid_expiration"],
    [`Bearer ${accessToken({ ...claims, exp: "tomorrow" })}`, "invalid_expiration"],
    [`Bearer ${accessToken({ ...claims, exp: 1e100 })}`, "invalid_expiration"],
    [`Bearer ${accessToken({ ...claims, nbf: "tomorrow" })}`, "invalid_not_before"],
    [`Bearer ${accessToken({ ...claims, nbf: 1e100 })}`, "invalid_not_before"],
    [`Bearer ${accessToken({ ...claims, aud: [] })}`, "invalid_audience"],
    [`Bearer ${accessToken({ ...claims, scp: [123] })}`, "invalid_scope"],
  ]) {
    await assertAccessError(() => verifier.verify(authorization), 401, "invalid_access_token", {
      reason,
      expectedAudience: AUDIENCE,
      requiredScope: REQUIRED_SCOPE,
    })
  }

  await assertAccessError(() => verifier.verify(`Bearer ${accessToken({
    ...claims, nbf: NOW / 1000 + 60,
  })}`), 401, "invalid_access_token", {
    reason: "token_not_yet_valid",
    signatureVerified: true,
    notBefore: new Date(NOW + 60_000).toISOString(),
    validInSeconds: 60,
  })
  await assertAccessError(() => verifier.verify(`Bearer ${accessToken({
    ...claims, exp: NOW / 1000 - 60, aud: "api",
  })}`), 401, "invalid_access_token", {
    reason: "token_expired",
    expiresInSeconds: -60,
    audiences: undefined,
  })
})

test("loads RSA signing keys from the configured JWKS URI", async (t) => {
  let requestedUrl = ""
  const jwks = http.createServer((request, response) => {
    requestedUrl = request.url ?? ""
    response.setHeader("content-type", "application/json")
    response.end(JSON.stringify({ keys: [publicJwk] }))
  })
  const port = await listen(jwks)
  t.after(() => close(jwks))
  const resolveSigningKey = createRemoteJwksKeyResolver({
    allowInsecureHttp: true,
    jwksUrl: new URL(`http://127.0.0.1:${port}/zts/v1/oauth2/keys?rfc=true`),
  })
  const verifier = createAthenzAccessTokenVerifier({
    expectedAudience: AUDIENCE,
    now: () => NOW,
    requiredScope: REQUIRED_SCOPE,
    resolveSigningKey,
  })

  await verifier.verify(`Bearer ${accessToken({
    aud: AUDIENCE,
    exp: NOW / 1000 + 300,
    scope: "accessor",
  })}`)
  assert.equal(requestedUrl, "/zts/v1/oauth2/keys?rfc=true")

  await assertAccessError(() => verifier.verify(`Bearer ${accessToken({
    aud: AUDIENCE, exp: NOW / 1000 + 300, scope: "accessor",
  }, signingKeys.privateKey, { kid: "unknown-key" })}`), 401, "invalid_access_token", {
    reason: "unknown_signing_key",
    keyId: "unknown-key",
    signatureVerified: false,
    audiences: undefined,
    expiresAt: undefined,
  })
  assert.equal(requestedUrl, "/zts/v1/oauth2/keys?rfc=true&r=1")
})

test("refreshes JWKS after ZTS rotates a signing key", async (t) => {
  const rotatedKeys = generateKeyPairSync("rsa", { modulusLength: 2048 })
  const rotatedPublicJwk = {
    ...rotatedKeys.publicKey.export({ format: "jwk" }),
    alg: "RS256",
    kid: "zts-test-key",
    use: "sig",
  }
  let requests = 0
  const jwks = http.createServer((_request, response) => {
    requests += 1
    response.setHeader("content-type", "application/json")
    response.end(JSON.stringify({ keys: [requests === 1 ? publicJwk : rotatedPublicJwk] }))
  })
  const port = await listen(jwks)
  t.after(() => close(jwks))
  const verifier = createAthenzAccessTokenVerifier({
    expectedAudience: AUDIENCE,
    now: () => NOW,
    requiredScope: REQUIRED_SCOPE,
    resolveSigningKey: createRemoteJwksKeyResolver({
      allowInsecureHttp: true,
      jwksUrl: new URL(`http://127.0.0.1:${port}/zts/v1/oauth2/keys?rfc=true`),
    }),
  })
  const claims = {
    aud: AUDIENCE,
    exp: NOW / 1000 + 300,
    scp: ["accessor"],
  }

  await verifier.verify(`Bearer ${accessToken(claims)}`)
  await verifier.verify(`Bearer ${accessToken(claims, rotatedKeys.privateKey)}`)

  assert.equal(requests, 2)
})

function verifierForTest() {
  return createAthenzAccessTokenVerifier({
    expectedAudience: AUDIENCE,
    now: () => NOW,
    requiredScope: REQUIRED_SCOPE,
    resolveSigningKey: async () => signingKeys.publicKey,
  })
}

function accessToken(
  claims: Record<string, unknown>,
  privateKey = signingKeys.privateKey,
  headerOverrides: Record<string, unknown> = {},
) {
  const header = encode({ alg: "RS256", kid: "zts-test-key", typ: "at+jwt", ...headerOverrides })
  const payload = encode(claims)
  const signingInput = `${header}.${payload}`
  const signature = sign("RSA-SHA256", Buffer.from(signingInput, "ascii"), privateKey).toString("base64url")
  return `${signingInput}.${signature}`
}

function encode(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url")
}

async function assertAccessError(
  operation: () => Promise<unknown>,
  status: number,
  code: string,
  diagnostics?: Partial<AccessTokenDiagnostics>,
) {
  await assert.rejects(operation, (error) => {
    assert.ok(error instanceof AccessTokenError)
    assert.equal(error.status, status)
    assert.equal(error.code, code)
    for (const [key, value] of Object.entries(diagnostics ?? {})) {
      assert.deepEqual(error.diagnostics?.[key as keyof AccessTokenDiagnostics], value, key)
    }
    return true
  })
}

function listen(server: Server) {
  return new Promise<number>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      if (!address || typeof address === "string") {
        reject(new Error("Test server did not receive a TCP port"))
        return
      }
      resolve(address.port)
    })
  })
}

function close(server: Server) {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  })
}
