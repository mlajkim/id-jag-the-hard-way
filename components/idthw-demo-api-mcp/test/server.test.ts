import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import http, { type Server } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { createDelegatedK8sDocsMcpServer } from "../src/server.ts"
import { MCP_ACCESS_TOKEN_FILE_META_KEY } from "../src/tokenFile.ts"

test("supports stateless initialization and tool discovery", async (t) => {
  const server = createDelegatedK8sDocsMcpServer({ upstreamBaseUrl: new URL("http://127.0.0.1:1") })
  const port = await listen(server)
  t.after(() => close(server))

  const initialized = await callMcp(port, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2025-06-18" },
  })
  assert.equal(initialized.result.protocolVersion, "2025-06-18")
  assert.equal(initialized.result.serverInfo.name, "idthw-demo-api-mcp")

  const listed = await callMcp(port, { jsonrpc: "2.0", id: 2, method: "tools/list" })
  assert.deepEqual(
    listed.result.tools.map((tool: { name: string }) => tool.name),
    ["get_k8s_docs", "post_k8s_doc", "delete_k8s_doc"],
  )
})

test("forwards the request's API bearer token for MCP and HTTP tool calls", async (t) => {
  const receivedAuthorizations: string[] = []
  const upstream = http.createServer((request, response) => {
    receivedAuthorizations.push(request.headers.authorization ?? "")
    response.setHeader("content-type", "application/json")
    response.end(JSON.stringify({ docs: [{ id: 1, name: "Example" }] }))
  })
  const upstreamPort = await listen(upstream)
  t.after(() => close(upstream))
  const server = createDelegatedK8sDocsMcpServer({
    upstreamBaseUrl: new URL(`http://127.0.0.1:${upstreamPort}`),
  })
  const port = await listen(server)
  t.after(() => close(server))

  const result = await callMcp(port, {
    jsonrpc: "2.0", id: 1, method: "tools/call",
    params: { name: "get_k8s_docs", arguments: {}, _meta: { progressToken: "progress-1" } },
  }, { authorization: "Bearer direct.api.fixture" })
  assert.equal(result.result.isError, false)
  assert.deepEqual(result.result.structuredContent.data.docs, [{ id: 1, name: "Example" }])

  const httpResult = await fetch(`http://127.0.0.1:${port}/tools/get_k8s_docs`, {
    method: "POST", headers: { "content-type": "application/json", authorization: "bearer http.api.fixture" }, body: "{}",
  })
  assert.equal((await httpResult.json() as any).result.isError, false)
  assert.deepEqual(receivedAuthorizations, ["Bearer direct.api.fixture", "Bearer http.api.fixture"])
})

test("keeps bearer tokens isolated between concurrent requests and rejects later unauthenticated calls", async (t) => {
  let upstreamCalls = 0
  const upstream = http.createServer((request, response) => {
    upstreamCalls++
    response.setHeader("content-type", "application/json")
    response.end(JSON.stringify({ caller: request.headers.authorization }))
  })
  const upstreamPort = await listen(upstream)
  t.after(() => close(upstream))
  const server = createDelegatedK8sDocsMcpServer({ upstreamBaseUrl: new URL(`http://127.0.0.1:${upstreamPort}`) })
  const port = await listen(server)
  t.after(() => close(server))
  const call = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_k8s_docs", arguments: {} } }

  const tokens = ["alice.api.fixture", "bob.api.fixture", "carol.api.fixture"]
  const results = await Promise.all(tokens.map((token) => callMcp(port, call, { authorization: `Bearer ${token}` })))
  assert.deepEqual(results.map((result) => result.result.structuredContent.data.caller), tokens.map((token) => `Bearer ${token}`))

  const missing = await callMcp(port, call)
  assert.match(missing.error.message, /Authorization: Bearer/)
  assert.equal(upstreamCalls, tokens.length)
})

test("missing or malformed bearer headers fail before calling the API on both tool endpoints", async (t) => {
  let upstreamCalls = 0
  const upstream = http.createServer((_request, response) => {
    upstreamCalls++
    response.end("must not be called")
  })
  const upstreamPort = await listen(upstream)
  t.after(() => close(upstream))
  const server = createDelegatedK8sDocsMcpServer({ upstreamBaseUrl: new URL(`http://127.0.0.1:${upstreamPort}`) })
  const port = await listen(server)
  t.after(() => close(server))
  const call = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_k8s_docs", arguments: {} } }

  for (const authorization of [undefined, "", "Basic fixture", "Bearer", "Bearer ", "Bearer one two", "Bearer one,two"]) {
    for (const path of ["/mcp", "/tools/get_k8s_docs"]) {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(authorization === undefined ? {} : { authorization }) },
        body: JSON.stringify(path === "/mcp" ? call : {}),
      })
      const result = await response.json() as any
      assert.equal(result.error.code, -32603)
      assert.match(result.error.message, /Authorization: Bearer/)
    }
  }
  assert.equal(upstreamCalls, 0)
})

test("returns the API's token and permission rejections without treating the tool call as successful", async (t) => {
  const upstream = http.createServer((request, response) => {
    response.statusCode = request.headers.authorization === "Bearer expired.api.fixture" ? 401 : 403
    response.setHeader("content-type", "application/json")
    response.end(JSON.stringify({ error: response.statusCode === 401 ? "invalid_access_token" : "insufficient_scope" }))
  })
  const upstreamPort = await listen(upstream)
  t.after(() => close(upstream))
  const server = createDelegatedK8sDocsMcpServer({ upstreamBaseUrl: new URL(`http://127.0.0.1:${upstreamPort}`) })
  const port = await listen(server)
  t.after(() => close(server))
  const call = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_k8s_docs", arguments: {} } }

  for (const [token, status, error] of [["expired.api.fixture", 401, "invalid_access_token"], ["limited.api.fixture", 403, "insufficient_scope"]] as const) {
    const result = await callMcp(port, call, { authorization: `Bearer ${token}` })
    assert.equal(result.result.isError, true)
    assert.deepEqual(result.result.structuredContent, { status, ok: false, data: { error } })
  }
})

test("prefers the request-scoped token file over the bearer header and rereads it for each call", async (t) => {
  const tokenDirectory = await mkdtemp(join(tmpdir(), "delegated-mcp-token-test-"))
  t.after(() => rm(tokenDirectory, { recursive: true, force: true }))
  const tokenFile = await writeToolToken(tokenDirectory, "get_k8s_docs", "12345678-1234-1234-1234-123456789abc.jwt", "first.test.token")

  const receivedAuthorizations: string[] = []
  const upstream = http.createServer((request, response) => {
    receivedAuthorizations.push(request.headers.authorization ?? "")
    response.setHeader("content-type", "application/json")
    response.end(JSON.stringify([{ id: 1, name: "Example" }]))
  })
  const upstreamPort = await listen(upstream)
  t.after(() => close(upstream))
  const server = createDelegatedK8sDocsMcpServer({
    tokenDirectory,
    upstreamBaseUrl: new URL(`http://127.0.0.1:${upstreamPort}`),
  })
  const port = await listen(server)
  t.after(() => close(server))

  const first = await callMcp(port, toolCall("get_k8s_docs", tokenFile), { authorization: "Bearer incoming.mcp.fixture" })
  assert.equal(first.result.isError, false)
  assert.deepEqual(first.result.structuredContent.data, [{ id: 1, name: "Example" }])

  await writeFile(tokenFile, "second.test.token\n", { encoding: "utf8", mode: 0o640 })
  await callMcp(port, toolCall("get_k8s_docs", tokenFile), { authorization: "Bearer incoming.mcp.fixture" })
  assert.deepEqual(receivedAuthorizations, ["Bearer first.test.token", "Bearer second.test.token"])
})

test("invalid request token files never fall back to the bearer header", async (t) => {
  const tokenDirectory = await mkdtemp(join(tmpdir(), "delegated-mcp-no-fallback-test-"))
  t.after(() => rm(tokenDirectory, { recursive: true, force: true }))
  const invalidFile = await writeToolToken(tokenDirectory, "get_k8s_docs", "12345678-1234-1234-1234-123456789abc.jwt", "invalid fixture")
  let upstreamCalls = 0
  const upstream = http.createServer((_request, response) => {
    upstreamCalls++
    response.end("must not be called")
  })
  const upstreamPort = await listen(upstream)
  t.after(() => close(upstream))
  const server = createDelegatedK8sDocsMcpServer({
    tokenDirectory,
    upstreamBaseUrl: new URL(`http://127.0.0.1:${upstreamPort}`),
  })
  const port = await listen(server)
  t.after(() => close(server))

  for (const path of [
    null, 7, "", "/tmp/outside/12345678-1234-1234-1234-123456789abc.jwt",
    join(tokenDirectory, "post_k8s_doc", "12345678-1234-1234-1234-123456789abc.jwt"),
    join(tokenDirectory, "get_k8s_docs", "22345678-1234-1234-1234-123456789abc.jwt"),
    invalidFile,
  ]) {
    const result = await callMcp(port, {
      jsonrpc: "2.0", id: 1, method: "tools/call",
      params: { name: "get_k8s_docs", arguments: {}, _meta: { [MCP_ACCESS_TOKEN_FILE_META_KEY]: path } },
    }, { authorization: "Bearer direct.api.fixture" })
    assert.equal(result.error.code, -32603)
  }
  assert.equal(upstreamCalls, 0)
})

test("maps post and delete tools onto the protected Docs API", async (t) => {
  const tokenDirectory = await mkdtemp(join(tmpdir(), "delegated-mcp-method-test-"))
  t.after(() => rm(tokenDirectory, { recursive: true, force: true }))
  const postToken = await writeToolToken(tokenDirectory, "post_k8s_doc", "12345678-1234-1234-1234-123456789abc.jwt", "post.test.token")
  const deleteToken = await writeToolToken(tokenDirectory, "delete_k8s_doc", "22345678-1234-1234-1234-123456789abc.jwt", "delete.test.token")
  const requests: Array<{ body: string; method?: string; url?: string }> = []
  const upstream = http.createServer(async (request, response) => {
    let body = ""
    for await (const chunk of request) body += chunk.toString()
    requests.push({ body, method: request.method, url: request.url })
    response.end("ok")
  })
  const upstreamPort = await listen(upstream)
  t.after(() => close(upstream))
  const server = createDelegatedK8sDocsMcpServer({
    tokenDirectory,
    upstreamBaseUrl: new URL(`http://127.0.0.1:${upstreamPort}`),
  })
  const port = await listen(server)
  t.after(() => close(server))

  await callMcp(port, toolCall("post_k8s_doc", postToken, { name: "Guide", content: "Content" }))
  await callMcp(port, toolCall("delete_k8s_doc", deleteToken, { doc_id: 7 }))

  assert.deepEqual(requests, [
    { body: JSON.stringify({ name: "Guide", content: "Content" }), method: "POST", url: "/api/docs" },
    { body: "", method: "DELETE", url: "/api/docs/7" },
  ])
})

test("rejects missing, escaped, and cross-tool token paths before calling upstream", async (t) => {
  const tokenDirectory = await mkdtemp(join(tmpdir(), "delegated-mcp-reject-test-"))
  t.after(() => rm(tokenDirectory, { recursive: true, force: true }))
  let upstreamCalls = 0
  const upstream = http.createServer((_request, response) => {
    upstreamCalls += 1
    response.end("must not be called")
  })
  const upstreamPort = await listen(upstream)
  t.after(() => close(upstream))
  const server = createDelegatedK8sDocsMcpServer({
    tokenDirectory,
    upstreamBaseUrl: new URL(`http://127.0.0.1:${upstreamPort}`),
  })
  const port = await listen(server)
  t.after(() => close(server))

  const missing = await callMcp(port, {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: "get_k8s_docs", arguments: {} },
  })
  assert.match(missing.error.message, /metadata|token file/)

  const escaped = await callMcp(port, toolCall("get_k8s_docs", "/tmp/outside/12345678-1234-1234-1234-123456789abc.jwt"))
  assert.match(escaped.error.message, /outside/)

  const crossTool = await callMcp(port, toolCall(
    "get_k8s_docs",
    join(tokenDirectory, "post_k8s_doc", "12345678-1234-1234-1234-123456789abc.jwt"),
  ))
  assert.match(crossTool.error.message, /does not match/)
  assert.equal(upstreamCalls, 0)
})

function toolCall(name: string, tokenFile: string, args: Record<string, unknown> = {}) {
  return {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name,
      arguments: args,
      _meta: { [MCP_ACCESS_TOKEN_FILE_META_KEY]: tokenFile },
    },
  }
}

async function writeToolToken(root: string, tool: string, filename: string, token: string) {
  const directory = join(root, tool)
  await mkdir(directory, { recursive: true })
  const path = join(directory, filename)
  await writeFile(path, `${token}\n`, { encoding: "utf8", mode: 0o640 })
  return path
}

async function callMcp(port: number, body: unknown, headers: Record<string, string> = {}) {
  const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  })
  return await response.json() as any
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
