import type { McpServer } from "@/features/catalog/types/catalog"
import type { McpTool, McpToolsResult } from "@/features/catalog/types/tools"
import { getMcpAccessToken } from "./athenzAccessToken"

const DEFAULT_LOCAL_MCP_URL = process.env.MCP_HUB_LOCAL_MCP_URL ?? "http://127.0.0.1:24443/mcp"

type JsonRpcToolsListResponse = {
  jsonrpc?: string
  id?: string | number
  result?: {
    tools?: McpTool[]
  }
  error?: {
    message?: string
  }
}

const MCP_PROTOCOL_VERSION = "2025-06-18"

export async function listLiveMcpTools(server: McpServer): Promise<McpToolsResult> {
  const endpoint = resolveMcpToolsEndpoint(server)

  try {
    const accessToken = await getMcpAccessToken(server.accessScope)
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    }
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`
    }

    const initializeResponse = await postMcpJsonRpc(endpoint, headers, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: {
          name: "mcp-hub",
          version: "0.1.0",
        },
      },
    })

    // A few older MCP HTTP endpoints predate initialize. Keep those endpoints
    // usable while using a real session for Streamable HTTP servers.
    if (!initializeResponse.ok && isInitializeUnsupportedStatus(initializeResponse.status)) {
      return requestToolsList(endpoint, headers)
    }

    if (!initializeResponse.ok) {
      return { endpoint, tools: [], error: `MCP server returned ${initializeResponse.status}` }
    }

    const initializePayload = await parseMcpJsonRpcResponse(initializeResponse)
    if (initializePayload.error) {
      if (isMethodUnavailable(initializePayload.error.message)) {
        return requestToolsList(endpoint, headers)
      }
      return {
        endpoint,
        tools: [],
        error: initializePayload.error.message ?? "MCP initialize returned an error",
      }
    }

    const sessionId = initializeResponse.headers.get("mcp-session-id")
    const sessionHeaders = sessionId ? { ...headers, "Mcp-Session-Id": sessionId } : headers

    const initializedResponse = await postMcpJsonRpc(endpoint, sessionHeaders, {
      jsonrpc: "2.0",
      method: "notifications/initialized",
      params: {},
    })
    if (!initializedResponse.ok) {
      return { endpoint, tools: [], error: `MCP server returned ${initializedResponse.status}` }
    }

    return requestToolsList(endpoint, sessionHeaders)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to call MCP tools/list"
    return { endpoint, tools: [], error: message }
  }
}

export function resolveMcpDisplayUrl(server?: McpServer) {
  return normalizeMcpEndpoint(server?.publicUrl ?? process.env.MCP_HUB_PUBLIC_MCP_URL ?? DEFAULT_LOCAL_MCP_URL)
}

function resolveMcpToolsEndpoint(server: McpServer) {
  const template = process.env.MCP_HUB_MCP_URL_TEMPLATE
  if (template) {
    return template
      .replaceAll("{server}", encodeURIComponent(server.name))
      .replaceAll("{name}", encodeURIComponent(server.name))
      .replaceAll("{namespace}", encodeURIComponent(server.namespace))
  }

  if (server.publicUrl) {
    return normalizeMcpEndpoint(server.discoveryUrl ?? server.publicUrl)
  }

  if (process.env.MCP_HUB_PUBLIC_MCP_URL) {
    return normalizeMcpEndpoint(process.env.MCP_HUB_PUBLIC_MCP_URL)
  }

  if (process.env.KUBERNETES_SERVICE_HOST) {
    return process.env.MCP_HUB_IN_CLUSTER_MCP_URL ?? `http://${server.name}.${server.namespace}:8081/mcp`
  }

  return DEFAULT_LOCAL_MCP_URL
}

function normalizeMcpEndpoint(value: string) {
  const raw = value.trim()
  const withProtocol = /^https?:\/\//.test(raw) ? raw : `http://${raw}`

  try {
    const url = new URL(withProtocol)
    if (url.pathname === "" || url.pathname === "/") {
      url.pathname = "/mcp"
    }
    return url.toString()
  } catch {
    return raw
  }
}

async function postMcpJsonRpc(endpoint: string, headers: Record<string, string>, body: Record<string, unknown>) {
  return fetch(endpoint, {
    method: "POST",
    cache: "no-store",
    headers: {
      ...headers,
      "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
    },
    body: JSON.stringify(body),
  })
}

async function requestToolsList(endpoint: string, headers: Record<string, string>): Promise<McpToolsResult> {
  const response = await postMcpJsonRpc(endpoint, headers, {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {},
  })

  if (!response.ok) {
    return { endpoint, tools: [], error: `MCP server returned ${response.status}` }
  }

  const payload = await parseMcpJsonRpcResponse(response)
  if (payload.error) {
    return { endpoint, tools: [], error: payload.error.message ?? "MCP tools/list returned an error" }
  }

  return { endpoint, tools: payload.result?.tools ?? [] }
}

function isInitializeUnsupportedStatus(status: number) {
  return status === 404 || status === 405
}

function isMethodUnavailable(message?: string) {
  if (!message) {
    return false
  }

  const normalized = message.toLowerCase()
  return normalized.includes("method not found") || normalized.includes("method is invalid")
}

async function parseMcpJsonRpcResponse(response: Response): Promise<JsonRpcToolsListResponse> {
  const body = await response.text()
  const contentType = response.headers.get("content-type") ?? ""

  if (contentType.includes("text/event-stream") || body.trimStart().startsWith("event:")) {
    return parseSseJsonRpcResponse(body)
  }

  return JSON.parse(body) as JsonRpcToolsListResponse
}

function parseSseJsonRpcResponse(body: string): JsonRpcToolsListResponse {
  for (const event of body.split(/\r?\n\r?\n/)) {
    const data = event
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trimStart())
      .join("\n")

    if (!data) {
      continue
    }

    const payload = JSON.parse(data) as JsonRpcToolsListResponse
    if (payload.result || payload.error) {
      return payload
    }
  }

  throw new Error("MCP server returned an SSE response without a JSON-RPC message")
}
