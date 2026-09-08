const DNS_LABEL_PATTERN = /^[a-z0-9](?:[-a-z0-9]{0,61}[a-z0-9])?$/

const RESERVED_PROJECT_NAMESPACES = new Set([
  "agent-gateway",
  "ai",
  "athenz",
  "default",
  "human",
  "idp",
  "local-path-storage",
  "mcp-hub",
])

export function isProjectNamespaceName(name: string) {
  return DNS_LABEL_PATTERN.test(name)
    && !name.startsWith("kube-")
    && !RESERVED_PROJECT_NAMESPACES.has(name)
}
