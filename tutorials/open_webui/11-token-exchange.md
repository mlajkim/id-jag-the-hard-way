| Previous | Current | Next |
|:---:|:---:|:---:|
| [Protect MCP Server](./10-protect-mcp-server.md) | **Token Exchange — Open WebUI** | [Identity Provider](./12-identity-provider.md) |

# Token Exchange — Open WebUI

Complete the shared [Authorize the Downstream Exchange](../11-token-exchange.md#authorize-the-downstream-exchange), [Refresh the Learner Token](../11-token-exchange.md#refresh-the-learner-token), and [Verify](../11-token-exchange.md#verify) steps first. The same `mcp.idthw-api-mcp` service and Athenz policies apply to every client path.

## Update the Client

Open **Admin Panel > Settings > Integrations > Manage Tool Servers** and edit `API MCP Server`. Replace the bearer API key with the learner's MCP-audience token saved in `./keys/idjag-learner.jwt`. Keep the URL `http://mcp.mcp:8081` and OpenAPI spec `/openapi.json`.

Start a new chat, select the document tool, and ask `get docs!`.

## Understand the Result

Runtime Proxy validates the learner's MCP token, exchanges it for an API token, and supplies a request-specific token file. `idthw-demo-api-mcp` reads that file and retrieves the documents. The proxy removes the file after the response completes.

![Runtime Proxy exchanges the token before MCP calls the API](../assets/core_11_exchange_allowed.svg)

Next: [Identity Provider](./12-identity-provider.md)
