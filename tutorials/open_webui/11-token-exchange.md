| Previous | Current | Next |
|:---:|:---:|:---:|
| [Protect MCP Server](./10-protect-mcp-server.md) | **Token Exchange — Open WebUI** | [Identity Provider](./12-identity-provider.md) |

# Token Exchange — Open WebUI

Complete the shared [Authorize the Downstream Exchange](../11-token-exchange.md#authorize-the-downstream-exchange), [Refresh the Learner Token](../11-token-exchange.md#refresh-the-learner-token), and [Verify](../11-token-exchange.md#verify) steps first. The same `mcp.idthw-api-mcp` service and Athenz policies apply to every client path.

## Update the Client

Fetch a fresh MCP-audience token before updating the tool server:

```sh
_scope="mcp:role.mcp-accessor api:role.docs-getter"
_my_access_token=$(./tools/athenz/fetch-access-token.sh \
  "./keys/idjag-learner.crt" \
  "./keys/idjag-learner.key" \
  "${_scope}" \
  "./keys/idjag-learner.jwt" \
  --audience mcp)
```

Open **Admin Panel > Settings > Integrations > Manage Tool Servers** and edit `API MCP Server`. Set the auth type to `Bearer` and use the freshly issued token saved in `./keys/idjag-learner.jwt` as the API key. Keep the URL `http://mcp.mcp:8081` and OpenAPI spec `/openapi.json`.

Start a new chat, select the document tool, and ask `get docs!`.

## Understand the Result

Runtime Proxy validates the learner's MCP token, exchanges it for an API token, and supplies a request-specific token file. `idthw-demo-api-mcp` reads that file and retrieves the documents. The proxy removes the file after the response completes.

![Runtime Proxy exchanges the token before MCP calls the API](../assets/core_11_exchange_allowed.svg)

Open WebUI can now retrieve documents through the protected MCP service. In the next chapter, you will deploy Keycloak so users can sign in and receive an ID token.

Next: [Identity Provider](./12-identity-provider.md)
