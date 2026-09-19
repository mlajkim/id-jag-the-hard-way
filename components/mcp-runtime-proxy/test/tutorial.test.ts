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

test("tutorial: discover MCP, reject MCP access, deny exchange, then return documents", { timeout: 5000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "idthw-tutorial-test-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const apiHeaders: string[] = []
  const api = http.createServer((request, response) => {
    apiHeaders.push(request.headers.authorization ?? "")
    response.setHeader("content-type", "application/json")
    const allowed = request.headers.authorization === "Bearer delegated.api.fixture"
    response.statusCode = allowed ? 200 : 401
    response.end(JSON.stringify(allowed ? { docs: [{ id: 1, name: "Example" }] } : { error: "invalid_access_token" }))
  })
  const apiPort = await listen(api)
  t.after(() => close(api))
  const upstreamBaseUrl = new URL(`http://127.0.0.1:${apiPort}`)
  const mcp = createDelegatedK8sDocsMcpServer({ upstreamBaseUrl, tokenDirectory: directory })
  const mcpPort = await listen(mcp)
  t.after(() => close(mcp))
  const initialized = await post(mcpPort, "/mcp", { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } })
  assert.equal((await initialized.json() as any).result.serverInfo.name, "idthw-demo-api-mcp")
  const listed = await post(mcpPort, "/mcp", { jsonrpc: "2.0", id: 2, method: "tools/list" })
  assert.deepEqual((await listed.json() as any).result.tools.map((tool: { name: string }) => tool.name), ["get_k8s_docs", "post_k8s_doc", "delete_k8s_doc"])
  const openApi = await (await fetch(`http://127.0.0.1:${mcpPort}/openapi.json`)).json() as any
  assert.equal(openApi.paths["/tools/get_k8s_docs"].post.operationId, "get_k8s_docs")
  assert.equal(openApi.paths["/tools/get_k8s_docs"].post["x-athenz-required-scope"], "mcp:role.mcp-accessor api:role.docs-getter")
  const httpResult = await post(mcpPort, "/tools/get_k8s_docs", {}, "learner.api.fixture")
  assert.match((await httpResult.json() as any).error.message, /metadata|token file/)
  const missing = await post(mcpPort, "/mcp", call)
  assert.match((await missing.json() as any).error.message, /metadata|token file/)
  const direct = await post(mcpPort, "/mcp", call, "learner.api.fixture")
  assert.match((await direct.json() as any).error.message, /metadata|token file/)
  assert.equal(apiHeaders.length, 0, "document calls must never fall back to the bearer header")

  let exchangeAllowed = false
  let exchanges = 0
  let removedTokens = 0
  const cleanupComplete = Promise.withResolvers<void>()
  const logger = {
    ...quietLogger,
    info(event: string) {
      if (event === "downstream_access_token_removed" && ++removedTokens === 2) cleanupComplete.resolve()
    },
  }
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
  }, logger, publisher, { publicOpenApi: true, toolScopes })
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
  assert.equal(apiHeaders.length, 0)

  exchangeAllowed = true
  const successful = await post(port, "/mcp", call, "learner.mcp.fixture")
  assert.equal((await successful.json() as any).result.structuredContent.status, 200)
  const compatible = await post(port, "/tools/get_k8s_docs", {}, "learner.mcp.fixture")
  assert.equal((await compatible.json() as any).result.structuredContent.status, 200)
  assert.deepEqual(apiHeaders, ["Bearer delegated.api.fixture", "Bearer delegated.api.fixture"])
  // File removal is asynchronous and can finish after the client receives the response.
  await cleanupComplete.promise
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
