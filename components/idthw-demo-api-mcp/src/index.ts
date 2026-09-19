import { createDelegatedK8sDocsMcpServer } from "./server.ts"

const port = parsePort(process.env.PORT ?? "8080")
const host = process.env.HOST ?? "0.0.0.0"
const upstreamBaseUrl = new URL(process.env.UPSTREAM_BASE_URL ?? "http://api-server.api:8080")
const tokenDirectory = process.env.MCP_ACCESS_TOKEN_FILE_DIR ?? "/var/run/idthw-access-tokens"
const server = createDelegatedK8sDocsMcpServer({
  apiAccessToken: process.env.API_ACCESS_TOKEN,
  requiredMcpScope: process.env.ACCESS_MCP_REQUIRED_SCOPE ?? "mcp:role.mcp-accessor",
  tokenDirectory,
  upstreamBaseUrl,
})

server.listen(port, host, () => {
  console.log(JSON.stringify({
    component: "idthw-demo-api-mcp",
    event: "server_started",
    listenAddress: `${host}:${port}`,
    upstream: upstreamBaseUrl.origin,
  }))
})

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.close(() => process.exit(0)))
}

function parsePort(value: string) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Invalid PORT ${JSON.stringify(value)}`)
  }
  return parsed
}
