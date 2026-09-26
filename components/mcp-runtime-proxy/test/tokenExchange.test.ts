import assert from "node:assert/strict"
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import {
  assertExchangedTokenGrant,
  createAthenzTokenFilePublisher,
  DownstreamTokenExchangeError,
  tokenExchangeConfigFromEnvironment,
} from "../src/tokenExchange.ts"

test("loads token-file exchange defaults without an enable flag", () => {
  const config = tokenExchangeConfigFromEnvironment({})
  assert.equal(config.endpoint.toString(), "https://athenz-zts-server.athenz:4443/zts/v1/oauth2/token")
  assert.equal(config.certificatePath, "/var/run/athenz/service.cert.pem")
  assert.equal(config.keyPath, "/var/run/athenz/service.key.pem")
  assert.equal(config.caPath, "/var/run/athenz/ca.crt")
  assert.equal(config.outputDirectory, "/var/run/idthw-access-tokens")
})

for (const [failedPath, description, setting, reason, fileErrorCode] of [
  ["/test/service.cert.pem", "MCP service certificate", "ATHENZ_TOKEN_EXCHANGE_CERT_PATH", "service_certificate_unavailable", "ENOENT"],
  ["/test/service.key.pem", "MCP service private key", "ATHENZ_TOKEN_EXCHANGE_KEY_PATH", "service_private_key_unavailable", "EACCES"],
  ["/test/ca.crt", "Athenz CA certificate", "ATHENZ_TOKEN_EXCHANGE_CA_PATH", "athenz_ca_unavailable", "ENOENT"],
]) {
  test(`reports ${reason} before contacting Athenz`, async () => {
    const reads: string[] = []
    const publisher = createAthenzTokenFilePublisher({
      ...tokenExchangeConfigFromEnvironment({}),
      certificatePath: "/test/service.cert.pem",
      keyPath: "/test/service.key.pem",
      caPath: "/test/ca.crt",
      endpoint: new URL("https://127.0.0.1:1/token"),
    }, {
      readCredential: async (path) => {
        reads.push(path)
        if (path === failedPath) throw Object.assign(new Error("unlogged underlying error"), { code: fileErrorCode })
        return Buffer.from("unused test data")
      },
    })
    assert.deepEqual(reads, [])
    await assert.rejects(publisher.publish({
      requestId: "12345678-1234-1234-1234-123456789abc",
      scope: "api:role.docs-getter",
      sourceToken: "test-source-token",
      toolName: "get_k8s_docs",
    }), (error) => {
      assert.ok(error instanceof DownstreamTokenExchangeError)
      assert.equal(error.status, 502)
      assert.equal(error.code, "downstream_token_exchange_unavailable")
      assert.equal(error.message, `Token exchange failed: the required ${description} could not be read. Check ${setting}.`)
      assert.deepEqual(error.diagnostics, { reason, credentialPath: failedPath, fileErrorCode, athenzRequestSent: false })
      assert.equal(JSON.stringify(error).includes("unlogged underlying error"), false)
      return true
    })
    const paths = ["/test/service.cert.pem", "/test/service.key.pem", "/test/ca.crt"]
    assert.deepEqual(reads, paths.slice(0, paths.indexOf(failedPath) + 1))
  })
}

test("wraps a missing credential file as an exchange error", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "mcp-runtime-missing-identity-test-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const certificatePath = join(directory, "missing.cert.pem")
  const publisher = createAthenzTokenFilePublisher({
    ...tokenExchangeConfigFromEnvironment({}), certificatePath,
  })
  await assert.rejects(publisher.publish({
    requestId: "12345678-1234-1234-1234-123456789abc",
    scope: "api:role.docs-getter",
    sourceToken: "test-source-token",
    toolName: "get_k8s_docs",
  }), (error) => {
    assert.ok(error instanceof DownstreamTokenExchangeError)
    assert.deepEqual(error.diagnostics, {
      reason: "service_certificate_unavailable", credentialPath: certificatePath,
      fileErrorCode: "ENOENT", athenzRequestSent: false,
    })
    return true
  })
})

test("publishes an exchanged token atomically in a request-scoped file", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "mcp-runtime-token-test-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  let exchangeInput: { audience: string; scope: string; sourceToken: string } | undefined
  const publisher = createAthenzTokenFilePublisher({
    caPath: "/unused/ca",
    certificatePath: "/unused/cert",
    endpoint: new URL("https://zts.example.test/zts/v1/oauth2/token"),
    keyPath: "/unused/key",
    outputDirectory: directory,
    timeoutMs: 1000,
  }, {
    exchange: async (_config, sourceToken, scope, audience) => {
      exchangeInput = { audience, scope, sourceToken }
      return "test-exchanged-token"
    },
  })

  const publication = await publisher.publish({
    requestId: "12345678-1234-1234-1234-123456789abc",
    scope: "api:role.docs-poster api:role.docs-getter",
    sourceToken: "test-source-token",
    toolName: "post_k8s_doc",
  })

  assert.deepEqual(exchangeInput, {
    audience: "api",
    scope: "api:role.docs-getter api:role.docs-poster",
    sourceToken: "test-source-token",
  })
  assert.equal(
    publication.filePath,
    join(directory, "post_k8s_doc", "12345678-1234-1234-1234-123456789abc.jwt"),
  )
  assert.equal(await readFile(publication.filePath, "utf8"), "test-exchanged-token\n")
  assert.equal((await stat(publication.filePath)).mode & 0o777, 0o640)
  assert.deepEqual(await readdir(join(directory, "post_k8s_doc")), ["12345678-1234-1234-1234-123456789abc.jwt"])

  await publication.remove()
  assert.deepEqual(await readdir(join(directory, "post_k8s_doc")), [])
})

test("rejects multiple downstream domains and unsafe tool names", async () => {
  const publisher = createAthenzTokenFilePublisher({
    caPath: "/unused/ca",
    certificatePath: "/unused/cert",
    endpoint: new URL("https://zts.example.test/zts/v1/oauth2/token"),
    keyPath: "/unused/key",
    outputDirectory: "/tmp/test-token-output",
    timeoutMs: 1000,
  }, { exchange: async () => "unused" })
  const base = {
    requestId: "12345678-1234-1234-1234-123456789abc",
    sourceToken: "test-source-token",
    toolName: "get_k8s_docs",
  }

  await assert.rejects(
    publisher.publish({ ...base, scope: "api:role.reader storage:role.reader" }),
    (error) => error instanceof DownstreamTokenExchangeError && error.status === 502,
  )
  await assert.rejects(
    publisher.publish({ ...base, scope: "api:role.reader", toolName: "../escape" }),
    (error) => error instanceof DownstreamTokenExchangeError && error.status === 502,
  )
})

test("validates the exchanged token audience, scope, and lifetime", () => {
  const valid = tokenForTest({
    aud: "api",
    exp: Math.floor(Date.now() / 1000) + 300,
    scp: ["docs-getter"],
  })
  assert.doesNotThrow(() => assertExchangedTokenGrant(valid, "api", "api:role.docs-getter"))

  assert.throws(
    () => assertExchangedTokenGrant(tokenForTest({
      aud: "wrong",
      exp: Math.floor(Date.now() / 1000) + 300,
      scp: ["docs-getter"],
    }), "api", "api:role.docs-getter"),
    /invalid downstream access token/,
  )
  assert.throws(
    () => assertExchangedTokenGrant(tokenForTest({
      aud: "api",
      exp: Math.floor(Date.now() / 1000) - 1,
      scp: ["docs-getter"],
    }), "api", "api:role.docs-getter"),
    /invalid downstream access token/,
  )
})

function tokenForTest(claims: Record<string, unknown>) {
  return [
    Buffer.from(JSON.stringify({ alg: "RS256", typ: "at+jwt" })).toString("base64url"),
    Buffer.from(JSON.stringify(claims)).toString("base64url"),
    "test-signature",
  ].join(".")
}
