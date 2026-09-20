| Previous | Current | Next |
|:---:|:---:|:---:|
| [Protect MCP Server](./10-protect-mcp-server.md) | **Token Exchange** | [Identity Provider](./12-identity-provider.md) |

# Token Exchange

Fix the `downstream_token_exchange_denied` response from chapter 10. The learner can access MCP, but Runtime Proxy's service identity still needs permission to exchange the MCP token for an API token.

<!-- TOC depthFrom:2 depthTo:2 -->

- [Authorize the Downstream Exchange](#authorize-the-downstream-exchange)
- [Refresh the Learner Token](#refresh-the-learner-token)
- [Verify](#verify)
- [Update the AI Client](#update-the-ai-client)
- [Understand the Result](#understand-the-result)
- [Next Steps](#next-steps)

<!-- /TOC -->

## Authorize the Downstream Exchange

Athenz checks both the source audience and the target role. Create the source-exchange role in `mcp`, the target-exchange role in `api`, and add the proxy's service identity to each:

```sh
./tools/athenz/create-role.sh "mcp" "to-api-exchanger"
./tools/athenz/add-policy.sh "mcp" "to-api-exchanger" "zts.token_source_exchange" "api"
./tools/athenz/add-role-member.sh "mcp" "to-api-exchanger" "mcp.idthw-api-mcp"

./tools/athenz/create-role.sh "api" "docs-getter-exchanger"
./tools/athenz/add-policy.sh "api" "docs-getter-exchanger" "zts.token_target_exchange" "mcp:role.docs-getter"
./tools/athenz/add-role-member.sh "api" "docs-getter-exchanger" "mcp.idthw-api-mcp"
```

The source assertion is `mcp:api`; the target assertion is `api:mcp:role.docs-getter`. These grant exchange permission to `mcp.idthw-api-mcp`. The service does not need membership in `api:role.docs-getter`: document access comes from the learner's token.

Only retrieval is authorized here. The create and delete tools require their own learner role membership and corresponding target-exchange permissions.

## Refresh the Learner Token

Keep the scopes and audience from chapter 10. Refresh the token if necessary:

```sh
_scope="mcp:role.mcp-accessor api:role.docs-getter"
_my_access_token=$(./tools/athenz/fetch-access-token.sh \
  "./keys/idjag-learner.crt" \
  "./keys/idjag-learner.key" \
  "${_scope}" \
  "./keys/idjag-learner.jwt" \
  --audience mcp)
```

## Verify

Repeat the request that returned `403`:

```sh
_mcp_port=$(./tools/port.sh mcp)
curl -sS "http://localhost:${_mcp_port}/mcp" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer ${_my_access_token}" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_k8s_docs","arguments":{}}}' \
  | jq '.result.structuredContent'
```

```sh
# {
#   "status": 200,
#   "ok": true,
#   "data": {
#     "docs": [
#       { "id": 1, "name": "first default doc", "content": "hello world" },
#       { "id": 2, "name": "second default doc", "content": "how are you?" }
#     ]
#   }
# }
```

If Athenz still returns the same exchange denial immediately after the change, allow its policy cache to refresh and retry.

## Update the AI Client

For Claude Code, update `.mcp.json` with the new MCP-audience token:

```sh
_mcp_port=$(./tools/port.sh mcp)
_at=$(cat ./keys/idjag-learner.jwt)
cat > .mcp.json <<EOF
{
  "mcpServers": {
    "id-jag-the-hard-way-mcp": {
      "type": "http",
      "url": "http://localhost:${_mcp_port}/mcp",
      "headers": { "Authorization": "Bearer ${_at}" }
    }
  }
}
EOF
```

Reload the configuration with `/reload-plugins` (or restart Claude Code), then ask:

```text
get docs from k8s doc server!
```

The client now retrieves documents through the protected MCP service. For other clients, use the [Codex instructions](./codex/11-token-exchange.md#update-the-client) or [Open WebUI instructions](./open_webui/11-token-exchange.md#update-the-client).

## Understand the Result

1. Runtime Proxy validates the incoming token's signature, expiry, MCP audience, and accessor scope.
2. It checks the tool's API scope and exchanges the token as `mcp.idthw-api-mcp`.
3. It writes the resulting `aud=api` token to a unique request file and passes its path in MCP metadata.
4. `idthw-demo-api-mcp` reads that file and calls the API. The API validates the token and document-reading scope.
5. Runtime Proxy removes the file when the tool response finishes.

```sh
kubectl logs deploy/mcp -n mcp -c auth-proxy
```

Look for "access token verified", "downstream access token published", "request completed", and "downstream access token removed" with the same requestId.

The exchanged token grants only `api:role.docs-getter`. The MCP container has read-only access to the token directory and no service private key.

![Runtime Proxy validates and exchanges the token, then MCP calls the API](./assets/core_11_exchange_allowed.svg)

## Next Steps

The learner can now retrieve documents through the protected MCP service using a certificate-issued token. In the next chapter, you will deploy Keycloak so users can sign in and receive an ID token.

Next: [Identity Provider](./12-identity-provider.md)
