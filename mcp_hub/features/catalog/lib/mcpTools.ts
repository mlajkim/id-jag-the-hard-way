import type { McpServer } from "@/features/catalog/types/catalog"
import type { McpTool, McpToolsResult } from "@/features/catalog/types/tools"

const DEFAULT_NAMESPACE = process.env.MCP_HUB_K8S_NAMESPACE ?? "mcp-hub"
const DEFAULT_LOCAL_MCP_URL = process.env.MCP_HUB_LOCAL_MCP_URL ?? "http://127.0.0.1:18081/mcp"
const DEFAULT_IN_CLUSTER_MCP_URL = process.env.MCP_HUB_IN_CLUSTER_MCP_URL ?? `http://mcp.${DEFAULT_NAMESPACE}:8081/mcp`

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

export async function listLiveMcpTools(server: McpServer): Promise<McpToolsResult> {
  const endpoint = resolveMcpToolsEndpoint(server)

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
    })

    if (!response.ok) {
      return { endpoint, tools: [], error: `MCP server returned ${response.status}` }
    }

    const payload = (await response.json()) as JsonRpcToolsListResponse
    if (payload.error) {
      return { endpoint, tools: [], error: payload.error.message ?? "MCP tools/list returned an error" }
    }

    return { endpoint, tools: payload.result?.tools ?? [] }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to call MCP tools/list"
    return { endpoint, tools: [], error: message }
  }
}

export function resolveMcpDisplayUrl() {
  return process.env.MCP_HUB_PUBLIC_MCP_URL ?? DEFAULT_IN_CLUSTER_MCP_URL
}

function resolveMcpToolsEndpoint(server: McpServer) {
  const template = process.env.MCP_HUB_MCP_URL_TEMPLATE
  if (template) {
    return template
      .replaceAll("{server}", encodeURIComponent(server.name))
      .replaceAll("{name}", encodeURIComponent(server.name))
      .replaceAll("{namespace}", encodeURIComponent(DEFAULT_NAMESPACE))
  }

  if (process.env.KUBERNETES_SERVICE_HOST) {
    return DEFAULT_IN_CLUSTER_MCP_URL
  }

  return DEFAULT_LOCAL_MCP_URL
}
