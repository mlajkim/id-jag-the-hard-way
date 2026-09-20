| Previous | Current | Next |
|:---:|:---:|:---:|
| [Protect MCP Server](./10-protect-mcp-server.md) | **Token Exchange — Codex** | [Identity Provider](./12-identity-provider.md) |

# Token Exchange — Codex

Complete the shared [Authorize the Downstream Exchange](../11-token-exchange.md#authorize-the-downstream-exchange), [Refresh the Learner Token](../11-token-exchange.md#refresh-the-learner-token), and [Verify](../11-token-exchange.md#verify) steps first. The same `mcp.idthw-api-mcp` service and Athenz policies apply to every client path.

## Update the Client

For the tutorial configuration from chapter 09, fetch a fresh MCP-audience token and update `.codex/config.toml` in the same block. If you have added unrelated settings, update just this server's `http_headers` entry instead of replacing the file:

```sh
_mcp_port=$(./tools/port.sh mcp)
_scope="mcp:role.mcp-accessor api:role.docs-getter"
_my_access_token=$(./tools/athenz/fetch-access-token.sh \
  "./keys/idjag-learner.crt" \
  "./keys/idjag-learner.key" \
  "${_scope}" \
  "./keys/idjag-learner.jwt" \
  --audience mcp)

cat > .codex/config.toml <<EOF
[mcp_servers.id-jag-the-hard-way-mcp]
url = "http://localhost:${_mcp_port}/mcp"
http_headers = { Authorization = "Bearer ${_my_access_token}" }
EOF
cat .codex/settings.toml >> .codex/config.toml
```

Restart Codex so it loads the new token, then ask `get docs from k8s doc server!`.

## Understand the Result

Runtime Proxy validates the learner's MCP token, exchanges it for an API token, and supplies a request-specific token file. `idthw-demo-api-mcp` reads that file and retrieves the documents. The proxy removes the file after the response completes.

![Runtime Proxy exchanges the token before MCP calls the API](../assets/core_11_exchange_allowed.svg)

Codex can now retrieve documents through the protected MCP service. In the next chapter, you will deploy Keycloak so users can sign in and receive an ID token.

Next: [Identity Provider](./12-identity-provider.md)
