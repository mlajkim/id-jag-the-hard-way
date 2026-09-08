export type McpServerStatus = "active" | "in-progress" | "unhealthy"

export type McpServer = {
  id: string
  routeId: string
  name: string
  namespace: string
  alias?: string
  description: string
  project: string
  publicUrl?: string
  gatewayUrl?: string
  proxyUrl: string
  accessManagement: "hub" | "server"
  accessAudience?: string
  accessScope?: string
  serviceAccount?: string
  containerImage?: string
  containerPort?: number
  creationMethod?: "direct" | "template"
  createdAt?: string
  defaultToolPermission?: "none" | "not-defined"
  desiredReplicas?: number
  path?: string
  readyReplicas?: number
  status: McpServerStatus
  statusMessage: string
  templateKey?: string
  toolPermissionOverrides?: unknown
  toolScopes?: Record<string, string>
  transport?: string
  totalToolCalls: string
  visibility?: "personal" | "project"
  iconSrc?: string
  logoText: string
  logoBg: string
  logoFg: string
}

export type CatalogResponse = {
  servers: McpServer[]
  error?: string
}
