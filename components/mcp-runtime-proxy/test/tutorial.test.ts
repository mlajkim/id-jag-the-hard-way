import assert from "node:assert/strict"
import { mkdtemp, readdir, rm } from "node:fs/promises"
import http, { type Server } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { createDelegatedK8sDocsMcpServer } from "../../idthw-demo-api-mcp/src/server.ts"
import { AccessTokenError } from "../src/auth.ts"
import { createRuntimeProxyServer, toolScopesFromEnvironment } from "../src/proxy.ts"
import { createAthenzTokenFilePublisher, DownstreamTokenExchangeError } from "../src/tokenExchange.ts"

const toolScopes = { get_k8s_docs: "api:role.docs-getter" }
const call = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_k8s_docs", arguments: {} } }
const quietLogger = { info() {}, warn() {}, error() {} }

test("tutorial: forward API token, reject MCP access, deny exchange, then return documents", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "idthw-tutorial-test-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const apiHeaders: string[] = []
  const api = http.createServer((request, response) => {
    apiHeaders.push(request.headers.authorization ?? "")
    response.setHeader("content-type", "application/json")
    const allowed = ["Bearer learner.api.fixture", "Bearer delegated.api.fixture"].includes(request.headers.authorization ?? "")
    response.statusCode = allowed ? 200 : 401
    response.end(JSON.stringify(allowed ? { docs: [{ id: 1, name: "Example" }] } : { error: "invalid_access_token" }))
  })
  const apiPort = await listen(api)
  t.after(() => close(api))
  const upstreamBaseUrl = new URL(`http://127.0.0.1:${apiPort}`)
  const forward = createDelegatedK8sDocsMcpServer({ accessTokenMode: "forward", upstreamBaseUrl })
  const forwardPort = await listen(forward)
  t.after(() => close(forward))

  const first = await post(forwardPort, "/mcp", call, "learner.api.fixture")
  assert.equal((await first.json() as any).result.structuredContent.status, 200)
  const openApi = await (await fetch(`http://127.0.0.1:${forwardPort}/openapi.json`)).json() as any
  assert.equal(openApi.paths["/tools/get_k8s_docs"].post.operationId, "get_k8s_docs")
  assert.equal(openApi.paths["/tools/get_k8s_docs"].post["x-athenz-required-scope"], "mcp:role.mcp-accessor api:role.docs-getter")
  const httpResult = await post(forwardPort, "/tools/get_k8s_docs", {}, "learner.api.fixture")
  assert.equal((await httpResult.json() as any).result.structuredContent.status, 200)
  const missing = await post(forwardPort, "/mcp", call)
  assert.match((await missing.json() as any).error.message, /API access token/)

  const mcp = createDelegatedK8sDocsMcpServer({ upstreamBaseUrl, tokenDirectory: directory })
  const mcpPort = await listen(mcp)
  t.after(() => close(mcp))
  const direct = await post(mcpPort, "/mcp", call, "learner.api.fixture")
  assert.match((await direct.json() as any).error.message, /metadata|token file/)
  assert.equal(apiHeaders.length, 2, "default token-file mode must never fall back to the bearer header")

  let exchangeAllowed = false
  let exchanges = 0
  const publisher = createAthenzTokenFilePublisher({
    endpoint: new URL("https://zts.example.test/token"),
    caPath: "unused", certificatePath: "unused", keyPath: "unused", timeoutMs: 1000,
    outputDirectory: directory,
  }, { exchange: async (_config, source, scope, audience) => {
    exchanges++
    assert.equal(source, "learner.mcp.fixture")
    assert.equal(scope, "api:role.docs-getter")
    assert.equal(audience, "api")
    if (!exchangeAllowed) throw new DownstreamTokenExchangeError(403, "downstream_token_exchange_denied", "Athenz denied the downstream token exchange.")
    return "delegated.api.fixture"
  } })
  const proxy = createRuntimeProxyServer(new URL(`http://127.0.0.1:${mcpPort}`), {
    verify: async (authorization) => {
      if (!authorization) throw new AccessTokenError(401, "missing_access_token", "Token required")
      if (authorization === "Bearer learner.api.fixture") throw new AccessTokenError(401, "invalid_access_token", "Wrong audience")
      return {
        audiences: ["mcp"], keyId: "fixture", expiresAt: "2099-01-01", expiresInSeconds: 3600,
        scopes: authorization === "Bearer learner.mcp.fixture"
          ? ["mcp:role.mcp-accessor", "api:role.docs-getter"] : ["mcp:role.mcp-accessor"],
      }
    },
  }, quietLogger, publisher, { publicOpenApi: true, toolScopes })
  const port = await listen(proxy)
  t.after(() => close(proxy))
  assert.equal((await fetch(`http://127.0.0.1:${port}/readyz`)).status, 200)
  assert.equal((await post(port, "/mcp", { jsonrpc: "2.0", id: 1, method: "tools/list" })).status, 200)
  assert.equal((await post(port, "/mcp", call)).status, 401)
  assert.equal((await post(port, "/mcp", call, "learner.api.fixture")).status, 401)
  assert.equal((await post(port, "/mcp", call, "missing.downstream.scope")).status, 403)
  assert.equal(exchanges, 0)
  const denied = await post(port, "/mcp", call, "learner.mcp.fixture")
  assert.equal(denied.status, 403)
  assert.equal((await denied.json() as any).error, "downstream_token_exchange_denied")
  assert.equal(apiHeaders.length, 2)

  exchangeAllowed = true
  const successful = await post(port, "/mcp", call, "learner.mcp.fixture")
  assert.equal((await successful.json() as any).result.structuredContent.status, 200)
  const compatible = await post(port, "/tools/get_k8s_docs", {}, "learner.mcp.fixture")
  assert.equal((await compatible.json() as any).result.structuredContent.status, 200)
  assert.deepEqual(apiHeaders.slice(2), ["Bearer delegated.api.fixture", "Bearer delegated.api.fixture"])
  // Cleanup runs in the response completion callback, before the next request is handled.
  await fetch(`http://127.0.0.1:${port}/healthz`)
  assert.deepEqual(await readdir(join(directory, "get_k8s_docs")), [])

  const before = exchanges
  const forged = await post(port, "/mcp", call, "learner.mcp.fixture", { "x-idthw-mcp-downstream-scope": "api:role.docs-deleter" })
  assert.equal(forged.status, 403)
  const unknown = await post(port, "/mcp", { ...call, params: { name: "unconfigured", arguments: {} } }, "learner.mcp.fixture")
  assert.equal(unknown.status, 403)
  assert.equal(exchanges, before)
})

test("configured tool scopes reject invalid deployment configuration", () => {
  assert.deepEqual(toolScopesFromEnvironment(JSON.stringify(toolScopes)), toolScopes)
  assert.equal(toolScopesFromEnvironment(undefined), undefined)
  for (const value of ["{}", "[]", "null", '{"get_k8s_docs":"docs-getter"}', '{"../escape":"api:role.docs-getter"}']) {
    assert.throws(() => toolScopesFromEnvironment(value))
  }
  assert.throws(() => createRuntimeProxyServer(new URL("http://localhost:8080"), { verify: async () => undefined }, quietLogger, undefined, { toolScopes }), /requires/)
  assert.throws(() => createDelegatedK8sDocsMcpServer({ upstreamBaseUrl: new URL("http://localhost"), accessTokenMode: "typo" as any }), /MCP_ACCESS_TOKEN_MODE/)
})

function post(port: number, path: string, body: unknown, token?: string, headers = {}) {
  return fetch(`http://127.0.0.1:${port}${path}`, {
    method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body: JSON.stringify(body),
  })
}

function listen(server: Server) {
  return new Promise<number>((resolve) => server.listen(0, "127.0.0.1", () => {
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Missing test port")
    resolve(address.port)
  }))
}

function close(server: Server) {
  return new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
}
