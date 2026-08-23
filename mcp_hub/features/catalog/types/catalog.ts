export type McpServer = {
  id: string
  name: string
  namespace: string
  alias?: string
  description: string
  project: string
  publicUrl?: string
  discoveryUrl?: string
  pattern?: string
  authMode?: "oauth" | "dpop-connector"
  accessScope?: string
  connectorCommand?: string
  totalToolCalls: string
  iconSrc?: string
  logoText: string
  logoBg: string
  logoFg: string
}

export type CatalogResponse = {
  servers: McpServer[]
  error?: string
}
