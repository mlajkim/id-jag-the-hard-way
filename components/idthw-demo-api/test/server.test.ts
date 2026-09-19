import assert from "node:assert/strict"
import http, { type Server } from "node:http"
import test, { type TestContext } from "node:test"
import { exportJWK, generateKeyPair, SignJWT, type JWTPayload } from "jose"
import { createAccessTokenVerifier, type AccessTokenVerifier } from "../src/auth.ts"
import { createConfiguredAccessTokenVerifier } from "../src/config.ts"
import { createDemoApiServer } from "../src/server.ts"

// Test-only keys and tokens are generated in memory; no deployed credentials are used.
const keys = await generateKeyPair("RS256")
const publicJwk = { ...await exportJWK(keys.publicKey), kid: "test-zts", alg: "RS256", use: "sig" }
const issuer = "test-zts-issuer"

async function token(claims: JWTPayload = {}, header = { alg: "RS256", typ: "at+jwt", kid: "test-zts" }) {
  return new SignJWT({
    iss: issuer, sub: "human.learner", aud: "api",
    exp: Math.floor(Date.now() / 1000) + 300, scope: "docs-getter", ...claims,
  }).setProtectedHeader(header).sign(keys.privateKey)
}

async function listen(server: Server) {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  assert.ok(address && typeof address !== "string")
  return `http://127.0.0.1:${address.port}`
}

async function close(server: Server) {
  server.closeAllConnections()
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
}

async function fixture(t: TestContext, jwksStatus = 200, accessTokenEnabled: "true" | "false" | null = "true") {
  let keyRequests = 0
  const jwks = http.createServer((_request, response) => {
    keyRequests++
    response.writeHead(jwksStatus, { "content-type": "application/json" })
    response.end(JSON.stringify({ keys: [publicJwk] }))
  })
  const jwksUrl = new URL(await listen(jwks))
  t.after(() => close(jwks))
  const verify = createConfiguredAccessTokenVerifier({
    ACCESS_TOKEN_ENABLED: accessTokenEnabled ?? undefined,
    ATHENZ_JWKS_URL: jwksUrl.href,
    ATHENZ_JWKS_ALLOW_INSECURE_HTTP: "true",
    ATHENZ_EXPECTED_ISSUER: issuer,
  })
  return { ...await apiFixture(t, verify), keyRequests: () => keyRequests }
}

async function apiFixture(t: TestContext, verify?: AccessTokenVerifier) {
  const logs: string[] = []
  const server = createDemoApiServer(verify, (line) => logs.push(line))
  const baseUrl = await listen(server)
  t.after(() => close(server))
  return {
    logs,
    async request(method = "GET", path = "/api/docs", accessToken?: string, body?: string) {
      const headers: Record<string, string> = { "content-type": "application/json" }
      if (accessToken !== undefined) headers.authorization = `Bearer ${accessToken}`
      const response = await fetch(baseUrl + path, { method, headers, body })
      return { status: response.status, headers: response.headers, body: await response.json() as { docs?: unknown[]; error?: string; message?: string } }
    },
  }
}

for (const mode of [null, "false"] as const) {
  test(`serves documents without tokens when ACCESS_TOKEN_ENABLED is ${mode ?? "unset"}`, async (t) => {
    const api = await fixture(t, 503, mode)
    assert.deepEqual((await api.request("GET", "/healthz")).body, { ok: true, accessTokenEnabled: false })
    const read = await api.request()
    assert.equal(read.status, 200)
    assert.equal(read.body.docs?.length, 2)
    assert.equal(read.headers.has("www-authenticate"), false)
    const created = await api.request("POST", "/api/docs", undefined, JSON.stringify({ name: "Guide", content: "Hello" }))
    assert.equal(created.status, 201)
    assert.equal((await api.request()).body.docs?.length, 3)
    assert.equal((await api.request("DELETE", "/api/docs/3")).status, 200)
    assert.equal((await api.request()).body.docs?.length, 2)
    assert.equal((await api.request("POST", "/api/docs", undefined, "{}")).status, 400)
    assert.equal(api.keyRequests(), 0, "open mode must not contact ZTS")
  })
}

test("validates the mode and initializes ZTS verification only when enabled", () => {
  assert.equal(createConfiguredAccessTokenVerifier({ ATHENZ_JWKS_URL: "not a URL" }), undefined)
  assert.equal(createConfiguredAccessTokenVerifier({ ACCESS_TOKEN_ENABLED: "false", ATHENZ_JWKS_URL: "not a URL" }), undefined)
  assert.throws(() => createConfiguredAccessTokenVerifier({ ACCESS_TOKEN_ENABLED: "true", ATHENZ_JWKS_URL: "not a URL" }))
  for (const mode of ["", "TRUE", "1", "yes", "flase"]) {
    assert.throws(() => createConfiguredAccessTokenVerifier({ ACCESS_TOKEN_ENABLED: mode }), /ACCESS_TOKEN_ENABLED must be true or false/)
  }
})

test("enabled mode exposes health and requires a bearer token before fetching signing keys", async (t) => {
  const api = await fixture(t)
  const health = await api.request("GET", "/healthz")
  assert.equal(health.status, 200)
  assert.deepEqual(health.body, { ok: true, accessTokenEnabled: true })
  const denied = await api.request()
  assert.equal(denied.status, 401)
  assert.match(denied.headers.get("www-authenticate") ?? "", /^Bearer /)
  assert.equal(api.keyRequests(), 0)
})

test("preserves the MCP document API contract across scoped create, read, and delete", async (t) => {
  const api = await fixture(t)
  const read = await token()
  const write = await token({ scope: "api:role.docs-poster" })
  const remove = await token({ scope: "api:role.docs-deleter" })
  assert.deepEqual((await api.request("GET", "/api/docs", read)).body, { docs: [
    { id: 1, name: "first default doc", content: "hello world" },
    { id: 2, name: "second default doc", content: "how are you?" },
  ] })
  const created = await api.request("POST", "/api/docs", write, JSON.stringify({ name: "Guide", content: "Hello" }))
  assert.equal(created.status, 201)
  assert.deepEqual(created.body, { success: true, doc: { id: 3, name: "Guide", content: "Hello" } })
  assert.equal((await api.request("GET", "/api/docs", read)).body.docs?.length, 3)
  const deleted = await api.request("DELETE", "/api/docs/3", remove)
  assert.equal(deleted.status, 200)
  assert.deepEqual(deleted.body, { success: true, message: "Document 3 deleted successfully." })
  assert.equal((await api.request("GET", "/api/docs", read)).body.docs?.length, 2)
  assert.equal((await api.request("DELETE", "/api/docs/3", remove)).status, 404)
  assert.equal(api.keyRequests(), 1, "jose should cache the signing keys")
  assert.equal(api.logs.join("").includes(read), false)
})

test("each operation requires its own scope, with no unauthorized mutation", async (t) => {
  const api = await fixture(t)
  const operations = [
    { method: "GET", path: "/api/docs", scope: "docs-getter" },
    { method: "POST", path: "/api/docs", scope: "docs-poster" },
    { method: "DELETE", path: "/api/docs/1", scope: "docs-deleter" },
  ]
  for (const grant of operations) {
    for (const operation of operations.filter((entry) => entry !== grant)) {
      const response = await api.request(operation.method, operation.path, await token({ scope: grant.scope }),
        operation.method === "POST" ? JSON.stringify({ name: "Denied", content: "Denied" }) : undefined)
      assert.equal(response.status, 403)
    }
  }
  assert.equal((await api.request("GET", "/api/docs", await token())).body.docs?.length, 2)
})

test("accepts scope/scp strings and arrays, and disambiguates multi-domain tokens", async (t) => {
  const api = await fixture(t)
  for (const name of ["scope", "scp"]) {
    for (const value of ["docs-getter", "api:role.docs-getter", ["mcp-accessor", "docs-getter"]]) {
      assert.equal((await api.request("GET", "/api/docs", await token({ scope: undefined, [name]: value }))).status, 200)
    }
  }
  assert.equal((await api.request("GET", "/api/docs", await token({ aud: ["api", "other"] }))).status, 403)
  assert.equal((await api.request("GET", "/api/docs", await token({ aud: ["other", "api"], scope: "api:role.docs-getter" }))).status, 200)
  for (const scope of [undefined, "", "docs-getter-extra", "other:role.docs-getter"]) {
    assert.equal((await api.request("GET", "/api/docs", await token({ scope }))).status, 403)
  }
})

test("requires exchange before accepting the tutorial's MCP-bound token", async (t) => {
  const api = await fixture(t)
  const incoming = await token({ aud: "mcp", scope: undefined, scp: ["mcp-accessor", "api:role.docs-getter"] })
  assert.equal((await api.request("GET", "/api/docs", incoming)).status, 401)
  const downstream = await token({ aud: "api", scope: undefined, scp: ["docs-getter"] })
  assert.equal((await api.request("GET", "/api/docs", downstream)).status, 200)
})

test("rejects expired, premature, wrong-audience, and invalid-identity tokens", async (t) => {
  const api = await fixture(t)
  for (const claims of [
    { exp: 1 }, { exp: undefined }, { nbf: Math.floor(Date.now() / 1000) + 300 },
    { aud: "other" }, { aud: undefined }, { iss: "other" }, { iss: undefined }, { sub: "" }, { sub: undefined },
    { scope: 123 }, { scp: [123] },
  ]) {
    assert.equal((await api.request("GET", "/api/docs", await token(claims))).status, 401)
  }
})

test("rejects forged signatures, wrong token types, unknown keys, and malformed tokens", async (t) => {
  const api = await fixture(t)
  const forgedKeys = await generateKeyPair("RS256")
  const forged = await new SignJWT({ iss: issuer, sub: "human.learner", aud: "api", scope: "docs-getter" })
    .setExpirationTime("5m").setProtectedHeader({ alg: "RS256", typ: "at+jwt", kid: "test-zts" }).sign(forgedKeys.privateKey)
  const wrongType = await token({}, { alg: "RS256", typ: "oauth-id-jag+jwt", kid: "test-zts" })
  const unknownKey = await token({}, { alg: "RS256", typ: "at+jwt", kid: "unknown" })
  for (const value of [forged, wrongType, unknownKey, "malformed"]) {
    const response = await api.request("GET", "/api/docs", value)
    assert.equal(response.status, 401)
  }
})

test("fails closed when the JWKS endpoint is unavailable", async (t) => {
  const api = await fixture(t, 503)
  const response = await api.request("GET", "/api/docs", await token())
  assert.equal(response.status, 503)
  assert.equal(response.body.error, "authentication_unavailable")
})

for (const code of [
  "DEPTH_ZERO_SELF_SIGNED_CERT", "SELF_SIGNED_CERT_IN_CHAIN", "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY", "UNABLE_TO_GET_ISSUER_CERT", "CERT_UNTRUSTED",
]) {
  test(`explains ZTS CA trust failure ${code} and keeps the API healthy`, async (t) => {
    const jwksUrl = "https://zts.example.test/keys"
    const originalFetch = globalThis.fetch
    let keyRequests = 0
    t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input) === jwksUrl) {
        keyRequests++
        const cause = Object.assign(new Error("untrusted certificate"), { code })
        throw new TypeError("fetch failed", { cause })
      }
      return originalFetch(input, init)
    })
    const api = await apiFixture(t, createConfiguredAccessTokenVerifier({
      ACCESS_TOKEN_ENABLED: "true", ATHENZ_JWKS_URL: jwksUrl,
    }))
    assert.equal(keyRequests, 0, "startup must not require a connection to ZTS")
    assert.equal((await api.request()).status, 401)
    assert.equal(keyRequests, 0, "missing tokens must not contact ZTS")

    const response = await api.request("GET", "/api/docs", await token())
    assert.equal(response.status, 503)
    assert.deepEqual(response.body, {
      error: "zts_ca_untrusted",
      message: "Cannot verify the ZTS HTTPS certificate. Mount the CA certificate that signed it, set NODE_EXTRA_CA_CERTS to its path, and restart the API.",
    })
    assert.equal(response.headers.has("www-authenticate"), false)
    assert.equal(keyRequests, 1)
    const health = await api.request("GET", "/healthz")
    assert.equal(health.status, 200)
    assert.deepEqual(health.body, { ok: true, accessTokenEnabled: true })
    assert.equal(keyRequests, 1, "health checks must not contact ZTS")
  })
}

for (const code of ["ECONNREFUSED", "CERT_HAS_EXPIRED", "ERR_TLS_CERT_ALTNAME_INVALID"]) {
  test(`does not describe ${code} as a missing CA`, async (t) => {
    const jwksUrl = "https://zts.example.test/keys"
    const originalFetch = globalThis.fetch
    t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input) === jwksUrl) {
        throw new TypeError("fetch failed", { cause: Object.assign(new Error("connection failed"), { code }) })
      }
      return originalFetch(input, init)
    })
    const api = await apiFixture(t, createConfiguredAccessTokenVerifier({
      ACCESS_TOKEN_ENABLED: "true", ATHENZ_JWKS_URL: jwksUrl,
    }))
    const response = await api.request("GET", "/api/docs", await token())
    assert.equal(response.status, 503)
    assert.deepEqual(response.body, { error: "authentication_unavailable", message: "Unable to load ZTS signing keys." })
  })
}

test("rejects invalid documents and routes without changing stored data", async (t) => {
  const api = await fixture(t)
  const write = await token({ scope: "docs-poster" })
  for (const body of ["not json", "{}", JSON.stringify({ name: "", content: "text" })]) {
    assert.equal((await api.request("POST", "/api/docs", write, body)).status, 400)
  }
  assert.equal((await api.request("POST", "/api/docs", write, JSON.stringify({ name: "large", content: "x".repeat(65 * 1024) }))).status, 413)
  assert.equal((await api.request("DELETE", "/api/docs/no-id", await token({ scope: "docs-deleter" }))).status, 400)
  assert.equal((await api.request("GET", "/api/docs-other", await token())).status, 404)
  assert.equal((await api.request("PATCH", "/api/docs", write, "{}")).status, 405)
  assert.equal((await api.request("GET", "/api/docs", await token())).body.docs?.length, 2)
})

test("requires HTTPS for signing keys unless explicitly enabled for local tests", () => {
  assert.throws(() => createAccessTokenVerifier({ jwksUrl: new URL("http://127.0.0.1:1234") }), /HTTPS/)
})
