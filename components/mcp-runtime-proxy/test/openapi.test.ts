import assert from "node:assert/strict"
import http, { type Server } from "node:http"
import test from "node:test"
import { AccessTokenError } from "../src/auth.ts"
import { createRuntimeProxyServer } from "../src/proxy.ts"

const deny = { verify: async () => { throw new AccessTokenError(403, "insufficient_scope", "Missing MCP scope") } }
const quiet = { info() {}, warn() {}, error() {} }

async function listen(server: Server) {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  assert.ok(address && typeof address !== "string")
  return `http://127.0.0.1:${address.port}`
}

function close(server: Server) {
  server.closeAllConnections()
  return new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
}

test("OpenAPI discovery is opt-in and tool routes remain protected", async (t) => {
  const calls: string[] = []
  const upstream = http.createServer((request, response) => {
    calls.push(`${request.method} ${request.url}`)
    response.end("discovery")
  })
  const target = new URL(await listen(upstream))
  t.after(() => close(upstream))
  for (const publicOpenApi of [false, true]) {
    const proxy = createRuntimeProxyServer(target, deny, quiet, undefined, { publicOpenApi })
    const baseUrl = await listen(proxy)
    t.after(() => close(proxy))
    const expected = publicOpenApi ? 200 : 403
    assert.equal((await fetch(`${baseUrl}/openapi.json`)).status, expected)
    assert.equal((await fetch(`${baseUrl}/get_k8s_docs`, { method: "OPTIONS" })).status, expected)
    assert.equal((await fetch(`${baseUrl}/get_k8s_docs`)).status, 403)
    assert.equal((await fetch(`${baseUrl}/openapi.json`, { method: "POST" })).status, 403)
    assert.equal((await fetch(`${baseUrl}/post_k8s_doc`, {
      method: "POST", body: JSON.stringify({ jsonrpc: "2.0", method: "tools/list" }),
    })).status, 403)
  }
  assert.deepEqual(calls, ["GET /openapi.json", "OPTIONS /get_k8s_docs"])
})

test("tutorial MCP discovery accepts an old token but tools/call still needs MCP scope", async (t) => {
  const upstream = http.createServer((_request, response) => response.end("discovery"))
  const target = new URL(await listen(upstream))
  t.after(() => close(upstream))
  const proxy = createRuntimeProxyServer(target, deny, quiet, undefined, { publicOpenApi: true })
  const baseUrl = await listen(proxy)
  t.after(() => close(proxy))
  for (const method of ["initialize", "notifications/initialized", "ping", "tools/list", "tools/call"]) {
    const response = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: { authorization: "Bearer old-test-token", "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method }),
    })
    assert.equal(response.status, method === "tools/call" ? 403 : 200)
  }
})

test("forwards protected tool bodies and authorization unchanged", async (t) => {
  const seen: { body?: string; authorization?: string } = {}
  const upstream = http.createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)))
    request.on("end", () => {
      seen.body = Buffer.concat(chunks).toString()
      seen.authorization = request.headers.authorization
      response.end("ok")
    })
  })
  const target = new URL(await listen(upstream))
  t.after(() => close(upstream))
  const proxy = createRuntimeProxyServer(target, { verify: async () => {} }, quiet, undefined, { publicOpenApi: true })
  const baseUrl = await listen(proxy)
  t.after(() => close(proxy))
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_k8s_docs" } })
  const response = await fetch(`${baseUrl}/mcp`, {
    method: "POST", headers: { authorization: "Bearer test-token", "content-type": "application/json" }, body,
  })
  assert.equal(response.status, 200)
  assert.deepEqual(seen, { body, authorization: "Bearer test-token" })
})
