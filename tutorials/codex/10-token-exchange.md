|              Previous               |          Current           |                       Next                       |
|:-----------------------------------:|:--------------------------:|:------------------------------------------------:|
| [Codex](./09-ai-agent.md) | **Token Exchange - Codex** | [Protect MCP Server](./11-protect-mcp-server.md) |

# Token Exchange - Codex

In this tutorial, we will fix the "Principal not authorized for token exchange" error from the previous step. The MCP server received your access token but did not have permission to exchange it for a new one on your behalf.

Configure permissions for [OAuth 2.0 Token Exchange (RFC 8693)](https://www.rfc-editor.org/rfc/rfc8693.html) and retry the request with the following steps:

<!-- TOC depthFrom:2 depthTo:2 -->

- [Authorize the MCP Token Exchange](#authorize-the-mcp-token-exchange)
- [Refresh the Learner Token](#refresh-the-learner-token)
- [Verify](#verify)
- [Understand the Result](#understand-the-result)

<!-- /TOC -->

<a id="allow-mcp-server-to-exchange-the-given-access-token"></a>

## Authorize the MCP Token Exchange

The learner can request the `api:role.docs-getter` scope, but that does not authorize the MCP server to exchange the resulting token. Create separate roles that grant the MCP service permission to perform the exchange.

Create the exchange roles:

```sh
./tools/athenz/create-role.sh "api" "to-api-exchanger"
./tools/athenz/create-role.sh "api" "docs-getter-exchanger"
```

```sh
#   ·  Creating Role: api:role.to-api-exchanger...
#   ✔  Role created: api:role.to-api-exchanger
#   ·  Creating Role: api:role.docs-getter-exchanger...
#   ✔  Role created: api:role.docs-getter-exchanger
```

In Athenz, you must explicitly define both the source and the target of the exchange. Add both policies:

```sh
./tools/athenz/add-policy.sh "api" "to-api-exchanger" "zts.token_source_exchange" "api"
./tools/athenz/add-policy.sh "api" "docs-getter-exchanger" "zts.token_target_exchange" "api:role.docs-getter"
```

```sh
#   ·  Creating Policy: api:policy.to-api-exchanger_zts_token_source_exchange_api...
#   ✔  Policy created: api:policy.to-api-exchanger_zts_token_source_exchange_api
#   ·  Creating Policy: api:policy.docs-getter-exchanger_zts_token_target_exchange_api_role_docs-getter...
#   ✔  Policy created: api:policy.docs-getter-exchanger_zts_token_target_exchange_api_role_docs-getter
```

> [!NOTE]
> The MCP server does not need direct access to the target resource. It only needs permission to perform the exchange itself.

Add the `mcp.idthw-api-mcp` service principal as a member of both roles:

```sh
./tools/athenz/add-role-member.sh "api" "to-api-exchanger" "mcp.idthw-api-mcp"
./tools/athenz/add-role-member.sh "api" "docs-getter-exchanger" "mcp.idthw-api-mcp"
```

```sh
#   ·  Adding Member mcp.idthw-api-mcp to Role: api:role.to-api-exchanger...
#   ✔  mcp.idthw-api-mcp  →  api:role.to-api-exchanger
#   ·  Adding Member mcp.idthw-api-mcp to Role: api:role.docs-getter-exchanger...
#   ✔  mcp.idthw-api-mcp  →  api:role.docs-getter-exchanger
```

The incoming token still has audience `api` at this stage. Chapter 11 introduces the MCP audience and adds permission to exchange from `mcp` to `api`.

<a id="refresh-the-mcp-token"></a>

## Refresh the Learner Token

Fetch a fresh token with `api:role.docs-getter` so the next request does not use an expired token:

```sh
_scope="api:role.docs-getter"
./tools/athenz/fetch-access-token.sh \
  "./keys/idjag-learner.crt" \
  "./keys/idjag-learner.key" \
  "${_scope}" \
  "./keys/idjag-learner.jwt"
```

```sh
#   ·  Fetching Access Token for scope: api:role.docs-getter...
#   ✔  Access token issued for scope: api:role.docs-getter
#   ✔  Token saved to: ./keys/idjag-learner.jwt
```

Overwrite `.codex/config.toml` with the fresh token and append the provided settings:

```sh
_mcp_port=$(./tools/port.sh mcp)
_at=$(cat ./keys/idjag-learner.jwt)

cat > .codex/config.toml <<EOF
[mcp_servers.id-jag-the-hard-way-mcp]
url = "http://localhost:${_mcp_port}/mcp"
http_headers = { Authorization = "Bearer ${_at}" }
EOF

cat .codex/settings.toml >> .codex/config.toml
```

## Verify

Start a new Codex chat so the updated MCP config is used:

```sh
/new
```

Then ask the exact same prompt that failed before:

```sh
get docs from k8s doc server!
```

You just got the docs list through Codex.

![Codex token exchange successful](./assets/11_codex_token_exchange_successful.png)

<a id="whats-happened"></a>

## Understand the Result

The MCP server (`mcp.idthw-api-mcp`) can now exchange the incoming token and call the API on the learner's behalf. Both the incoming and exchanged tokens have audience `api` and scope `docs-getter`. The next chapter introduces separate MCP and API audiences.

The API validates access tokens, but the MCP endpoint does not yet validate incoming tokens before processing requests. API calls still depend on a successful token exchange. In the next chapter, you will add MCP Runtime Proxy to validate tokens before allowing protected MCP requests.

Next: [Protect MCP Server](./11-protect-mcp-server.md)
