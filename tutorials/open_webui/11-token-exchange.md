|              Previous               |             Current             |                       Next                       |
|:-----------------------------------:|:-------------------------------:|:------------------------------------------------:|
| [Open WebUI](./10-ai-agent.md) | **Token Exchange - Open WebUI** | [Protect MCP Server](./12-protect-mcp-server.md) |

# Token Exchange - Open WebUI

In this tutorial, we will fix the "Principal not authorized for token exchange" error from the previous step. The MCP server received your access token but did not have permission to exchange it for a new one on your behalf.

Configure permissions for [OAuth 2.0 Token Exchange (RFC 8693)](https://www.rfc-editor.org/rfc/rfc8693.html) and retry the request with the following steps:

> [!NOTE]
> access tokens are short-lived. We will fetch a fresh token at the start of this tutorial so Open WebUI does not keep using an expired token from the previous step.

<!-- TOC depthFrom:2 depthTo:2 -->

- [Refresh the Learner Token](#refresh-the-learner-token)
- [Authorize the MCP Token Exchange](#authorize-the-mcp-token-exchange)
- [Verify](#verify)
- [Understand the Result](#understand-the-result)

<!-- /TOC -->

The incoming token still has audience `api` at this stage. Chapter 12 introduces the MCP audience and adds permission to exchange from `mcp` to `api`.

<a id="refresh-the-mcp-token"></a>

## Refresh the Learner Token

Fetch a fresh token with the `api:role.docs-getter` scope:

```sh
_scope="api:role.docs-getter"
./tools/athenz/fetch-access-token.sh \
  "./keys/idjag-learner.crt" \
  "./keys/idjag-learner.key" \
  "${_scope}" \
  "./keys/idjag-learner.jwt"

cat "./keys/idjag-learner.jwt"
```

```sh
#   ·  Fetching Access Token for scope: api:role.docs-getter...
#   ✔  Access token issued for scope: api:role.docs-getter
#   ✔  Token saved to: ./keys/idjag-learner.jwt
```

Navigate to `User Icon` > `Admin Panel` > `Settings` > `Integrations`, and click the configure icon for the API MCP Server.

Attach the refreshed access token exactly as we did previously:

![11_attach_access_token](./assets/11_attach_access_token.png)

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

## Verify

Now, ask the AI agent the exact same prompt that failed before:

```sh
get docs!
```

You just got the docs list through Open WebUI.

![11_succcesfully_get_docs_through_ai_for_the_first_time](./assets/11_succcesfully_get_docs_through_ai_for_the_first_time.png)

<a id="whats-happened"></a>

## Understand the Result

The MCP server (`mcp.idthw-api-mcp`) can now exchange the incoming token and call the API on the learner's behalf. Both the incoming and exchanged tokens have audience `api` and scope `docs-getter`. The next chapter introduces separate MCP and API audiences.

The API validates access tokens, but the MCP endpoint does not yet validate incoming tokens before processing requests. API calls still depend on a successful token exchange. In the next chapter, you will add MCP Runtime Proxy to validate tokens before allowing protected MCP requests.

Next: [Protect MCP Server](./12-protect-mcp-server.md)
