import http, { type IncomingMessage, type ServerResponse } from "node:http"
import { AccessTokenError, type AccessTokenVerifier } from "./auth.ts"

const scopes: Record<string, string> = {
  GET: "api:role.docs-getter",
  POST: "api:role.docs-poster",
  DELETE: "api:role.docs-deleter",
}

export function createDemoApiServer(verify?: AccessTokenVerifier, log: (line: string) => void = console.log) {
  const docs = new Map([
    [1, { id: 1, name: "first default doc", content: "hello world" }],
    [2, { id: 2, name: "second default doc", content: "how are you?" }],
  ])
  let sequence = 2

  return http.createServer(async (request, response) => {
    const path = (request.url ?? "/").split("?", 1)[0]
    const method = request.method ?? "GET"
    if (method === "GET" && path === "/healthz") {
      sendJson(response, 200, { ok: true, accessTokenEnabled: verify !== undefined })
      return
    }
    const startedAt = Date.now()
    response.on("finish", () => log(JSON.stringify({
      timestamp: new Date().toISOString(), component: "idthw-demo-api", event: "request_completed",
      method, status: response.statusCode, durationMs: Date.now() - startedAt,
    })))

    try {
      const route = /^\/api\/docs(?:\/([^/]+))?\/?$/.exec(path)
      if (!route) return sendJson(response, 404, { error: "not_found" })
      const documentId = route[1]
      const allowed = documentId === undefined ? ["GET", "POST", "DELETE"] : ["DELETE"]
      if (!allowed.includes(method)) {
        response.setHeader("allow", allowed.join(", "))
        return sendJson(response, 405, { error: "method_not_allowed" })
      }
      if (verify) await verify(request.headers.authorization, scopes[method])

      if (method === "GET") {
        return sendJson(response, 200, { docs: [...docs.values()] })
      }
      if (method === "POST") {
        const body = await readDocument(request)
        const doc = { ...body, id: ++sequence }
        docs.set(doc.id, doc)
        return sendJson(response, 201, { success: true, doc })
      }
      const id = Number(documentId)
      if (!documentId || !/^\d+$/.test(documentId) || !Number.isSafeInteger(id) || id < 1) {
        return sendJson(response, 400, { error: "bad_request", message: "A positive document ID is required in /api/docs/{doc_id}." })
      }
      if (!docs.delete(id)) {
        return sendJson(response, 404, { error: "Not Found", message: `Document with id ${id} does not exist or is already deleted.` })
      }
      sendJson(response, 200, { success: true, message: `Document ${id} deleted successfully.` })
    } catch (error) {
      if (error instanceof AccessTokenError) {
        if (error.status === 401 || error.status === 403) {
          const reason = error.status === 403 ? "insufficient_scope" : "invalid_token"
          response.setHeader("www-authenticate", `Bearer realm="idthw-demo-api", error="${reason}"`)
        }
        sendJson(response, error.status, { error: error.code, message: error.message })
      } else if (error instanceof RequestError) {
        sendJson(response, error.status, { error: "bad_request", message: error.message })
      } else {
        sendJson(response, 500, { error: "internal_server_error" })
      }
    }
  })
}

class RequestError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function readDocument(request: IncomingMessage): Promise<{ name: string; content: string }> {
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    bytes += chunk.length
    if (bytes > 64 * 1024) {
      request.resume()
      throw new RequestError(413, "Document body exceeds 64 KiB.")
    }
    chunks.push(Buffer.from(chunk))
  }
  let body
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"))
  } catch {
    throw new RequestError(400, "Request body must be a JSON document.")
  }
  if (!body || typeof body.name !== "string" || !body.name.trim()
    || typeof body.content !== "string" || !body.content.trim()) {
    throw new RequestError(400, "Document name and content must be non-empty strings.")
  }
  return { name: body.name, content: body.content }
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" })
  response.end(JSON.stringify(body))
}
