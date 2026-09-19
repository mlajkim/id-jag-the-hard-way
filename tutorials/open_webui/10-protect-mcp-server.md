| Previous | Current | Next |
|:---:|:---:|:---:|
| [Open WebUI](./09-ai-agent.md) | **Protect MCP Server — Open WebUI** | [Token Exchange](./11-token-exchange.md) |

# Protect MCP Server — Open WebUI

Complete [chapter 10's shared deployment and verification steps](../10-protect-mcp-server.md). They apply to all clients:

1. Create the MCP service identity and Secret in namespace `mcp`.
2. Deploy Runtime Proxy and switch MCP to `token-file` mode.
3. Observe `401 Unauthorized` for missing tokens or the old API-audience token.
4. Grant the learner MCP access and request an MCP-audience token carrying the API scope.
5. Observe `403 downstream_token_exchange_denied` because the service still lacks exchange permission.

Use the shared chapter's `curl` commands to see both failures independently of the client interface. MCP access now passes, but Athenz rejects the downstream token exchange. In the next chapter, you will grant the service the missing exchange permissions. Next: [Token Exchange — Open WebUI](./11-token-exchange.md)
