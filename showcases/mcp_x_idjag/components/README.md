# Shared components

Pattern-agnostic building blocks used by more than one (or intended to be reusable by future)
`patterns/*` implementation under this showcase. Nothing here depends on a specific pattern's own
Athenz roles, Keycloak clients, or Kubernetes manifests - each consuming pattern wires those up
itself (see its own `k8s/` and `permissions.yaml`).

| Component | Role |
|---|---|
| [mcp-reverse-proxy](./mcp-reverse-proxy) | Public-facing sidecar: serves RFC 9728 Protected Resource Metadata, authorizes the caller's Access Token against Athenz ZPE, and reverse-proxies authorized requests to a plain MCP server. |
| [simple-mcp-server](./simple-mcp-server) | Unauthenticated MCP tool server meant to sit behind `mcp-reverse-proxy` (or an equivalent auth sidecar); re-delegates the caller's Access Token to a backend API via Athenz ID-JAG token exchange. |

