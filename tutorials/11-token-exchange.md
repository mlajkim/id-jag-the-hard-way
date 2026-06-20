|              Previous               |      Current       |                       Next                       |
|:-----------------------------------:|:------------------:|:------------------------------------------------:|
| [AI Agent](./10-ai-agent.md) | **Token Exchange** | [Protect MCP Server](./12-protect-mcp-server.md) |

# Token Exchange

In this tutorial, we will fix the "Principal not authorized for token exchange" error from the previous step. The MCP server received your Access Token but did not have permission to exchange it for a new one on your behalf.

By implementing [OAuth 2.0 Token Exchange (RFC 8693)](https://www.rfc-editor.org/rfc/rfc8693.html), we will grant the MCP server permission to exchange the user's Access Token and act on their behalf to call the API server.

<!-- TOC depthFrom:2 depthTo:2 -->

- [Allow MCP Server to Exchange the Given Access Token](#allow-mcp-server-to-exchange-the-given-access-token)
- [Verify](#verify)
- [What's happened?](#whats-happened)
- [What's next?](#whats-next)

<!-- /TOC -->

## Allow MCP Server to Exchange the Given Access Token

Even if the original requester has `get` access to the `api:docs` resource, that does not automatically mean anyone can exchange the Access Token on their behalf. We need to create a dedicated role that explicitly allows token exchange.

Create the `docs-token-exchanger` role:

```sh
./tools/athenz/create-role.sh "api" "docs-token-exchanger"
```

Verify it was created in the Athenz UI:

```sh
_athenz_ui_port=$(./tools/port.sh athenz-ui)
./tools/open.sh "http://localhost:${_athenz_ui_port}/domain/api/role/docs-token-exchanger/members"
```

🟡 TODO: put image about the new docs-token-exchanger role in Athenz UI (similar to 11_check_new_role.png)

In Athenz, you must explicitly define both the **source** and the **target** of the exchange. Add both policies:

```sh
./tools/athenz/add-policy.sh "api" "docs-token-exchanger" "zts.token_source_exchange" "api"
./tools/athenz/add-policy.sh "api" "docs-token-exchanger" "zts.token_target_exchange" "api:role.docs-getter"
```

🟡 TODO: put image about both source and target exchange policies in Athenz UI (similar to 11_source_and_target_exchange_policy.png)

> [!NOTE]
> The MCP server does not need direct access to the target resource. It only needs permission to perform the exchange itself.

Add the `api.api-mcp` service principal as a member of this role:

```sh
./tools/athenz/add-role-member.sh "api" "docs-token-exchanger" "api.api-mcp"
```

## Verify

Fetch a fresh Access Token to make sure it hasn't expired:

```sh
_scope="api:role.docs-getter"
./tools/athenz/fetch-access-token.sh \
  "./athenz_dist/certs/athenz_admin.cert.pem" \
  "./athenz_dist/keys/athenz_admin.private.pem" \
  "${_scope}" \
  "./keys/api_docs-getter.jwt"
```

Update `.mcp.json` with the fresh token (same command as before):

```sh
_mcp_port=$(./tools/port.sh mcp)

cat > .mcp.json <<EOF
{
  "mcpServers": {
    "id-jag-the-hard-way-mcp": {
      "type": "http",
      "url": "http://localhost:${_mcp_port}/mcp",
      "headers": {
        "Authorization": "Bearer $(cat ./keys/api_docs-getter.jwt)"
      }
    }
  }
}
EOF
```

Now ask Claude the same prompt that failed before:

```
get docs!
```

🟡 TODO: put image about Claude Code successfully returning the docs list (similar to 11_succcesfully_get_docs_through_ai_for_the_first_time.png)

## What's happened?

By creating the `docs-token-exchanger` role and assigning both source and target exchange policies, the MCP server (`api.api-mcp`) can now exchange the incoming Access Token for a narrower-scoped token before calling the API server:

🟡 TODO: put image about the architecture diagram showing the successful token exchange flow (similar to 11_arc_success_to_token_exchange.png)

## What's next?

Our API server is now fully protected by Athenz Access Tokens. However, the MCP server itself has no authentication layer — anyone who can reach it can use it. In the next tutorial, we will deploy an Authorization Proxy in front of the MCP server.

Next: [Protect MCP Server](./12-protect-mcp-server.md)
