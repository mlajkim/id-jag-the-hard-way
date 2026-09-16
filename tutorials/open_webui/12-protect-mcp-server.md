|                 Previous                 |                Current                 |                      Next                      |
|:----------------------------------------:|:--------------------------------------:|:----------------------------------------------:|
| [Token Exchange](./11-token-exchange.md) | **Protect MCP Server - Open WebUI** | [Identity Provider](./13-identity-provider.md) |

# Protect MCP Server - Open WebUI

Protect MCP tool execution with MCP Runtime Proxy using the following steps. The proxy validates incoming access tokens before forwarding protected requests to the MCP server. MCP initialization and `tools/list` remain public for discovery.

<!-- TOC depthFrom:2 depthTo:2 -->

- [Deploy MCP Runtime Proxy](#deploy-mcp-runtime-proxy)
- [Update the MCP Service to Point to the Proxy](#update-the-mcp-service-to-point-to-the-proxy)
- [Verify (Expected Failure)](#verify-expected-failure)
- [Fix Insufficient Permission](#fix-insufficient-permission)
- [Allow Exchange from MCP to API](#allow-exchange-from-mcp-to-api)
- [Request Both MCP and API Scopes](#request-both-mcp-and-api-scopes)
- [Verify](#verify)
- [Review the Result](#review-the-result)
- [Next Steps](#next-steps)

<!-- /TOC -->

<a id="run-authorization-proxy-for-api-mcp"></a>

## Deploy MCP Runtime Proxy

Deploy MCP Runtime Proxy as the `auth-proxy` sidecar. It validates the access token's signature, expiry, audience `mcp`, and `mcp:role.mcp-accessor` scope. The existing MCP adapter continues to exchange tokens before calling the API.

Enable OpenAPI discovery for the current AI Client Gateway and Open WebUI. MCP bootstrap and tool discovery remain public; protected requests require the accessor scope.

```sh
kubectl patch deploy mcp -n api --patch "$(cat <<'EOF'
spec:
  template:
    spec:
      containers:
        - name: auth-proxy
          image: ghcr.io/mlajkim/mcp-runtime-proxy:latest
          imagePullPolicy: Always
          env:
            - name: PORT
              value: "8082"
            - name: MCP_TARGET_URL
              value: "http://localhost:8081"
            - name: ATHENZ_EXPECTED_AUDIENCE
              value: "mcp"
            - name: ATHENZ_REQUIRED_SCOPE
              value: "mcp:role.mcp-accessor"
            - name: ATHENZ_JWKS_CA_PATH
              value: "/var/run/athenz/ca.crt"
            - name: MCP_PUBLIC_OPENAPI_ENABLED
              value: "true"
          ports:
            - containerPort: 8082
          volumeMounts:
            - name: zts-ca
              mountPath: /var/run/athenz
              readOnly: true
      volumes:
        - name: zts-ca
          configMap:
            name: api-zts-ca
EOF
)"
kubectl rollout status deploy/mcp -n api
```

The proxy uses the `api-zts-ca` ConfigMap from chapter 07 to trust the ZTS signing-key endpoint. It validates incoming tokens; the MCP adapter uses its own service certificate for the downstream token exchange.

## Update the MCP Service to Point to the Proxy

Keep the Service on port `8081`, and route its traffic through the proxy on port `8082`:

```sh
kubectl patch svc mcp -n api --patch '{"spec":{"ports":[{"port":8081,"targetPort":8082}]}}'
```

```sh
# service/mcp patched
```

## Verify (Expected Failure)

Ask Open WebUI:

```sh
get docs!
```

Open WebUI can still initialize and list the available tools. The tool call fails because protected requests require `mcp:role.mcp-accessor`, while the current token has audience `api` and only grants `docs-getter`. The proxy rejects that audience before checking the MCP scope.

```sh
kubectl logs deploy/mcp -n api -c auth-proxy
```

## Fix Insufficient Permission

Create the `mcp-accessor` role in the `mcp` domain from chapter 09. The proxy maps this scope to MCP access directly:

```sh
./tools/athenz/create-role.sh "mcp" "mcp-accessor"
./tools/athenz/add-role-member.sh "mcp" "mcp-accessor" "human.idjag-learner"
```

```sh
#   ·  Creating Role: mcp:role.mcp-accessor...
#   ✔  Role created: mcp:role.mcp-accessor
#   ·  Adding Member human.idjag-learner to Role: mcp:role.mcp-accessor...
#   ✔  human.idjag-learner  →  mcp:role.mcp-accessor
```

## Allow Exchange from MCP to API

The next token will have audience `mcp`. Authorize the MCP service to exchange it for an API token:

```sh
./tools/athenz/create-role.sh "mcp" "to-api-exchanger"
./tools/athenz/add-policy.sh "mcp" "to-api-exchanger" "zts.token_source_exchange" "api"
./tools/athenz/add-role-member.sh "mcp" "to-api-exchanger" "mcp.idthw-api-mcp"
./tools/athenz/add-policy.sh "api" "docs-getter-exchanger" "zts.token_target_exchange" "mcp:role.docs-getter"
```

The source assertion is `mcp:api`; the target assertion is `api:mcp:role.docs-getter`. The `docs-getter-exchanger` role already contains `mcp.idthw-api-mcp` from chapter 11. These policies permit exchange; the incoming token must also carry `api:role.docs-getter`.

<a id="fetch-a-new-access-token-for-the-new-role"></a>

## Request Both MCP and API Scopes

Request scopes from both domains and explicitly select `mcp` as the audience. The MCP scope permits the incoming request; the API scope permits the later exchange. A multi-domain request without an audience is rejected by ZTS:

```sh
_scope="mcp:role.mcp-accessor api:role.docs-getter"
./tools/athenz/fetch-access-token.sh \
  "./keys/idjag-learner.crt" \
  "./keys/idjag-learner.key" \
  "${_scope}" \
  "./keys/api_mcp-accessor_docs-getter.jwt" \
  --audience mcp

cat "./keys/api_mcp-accessor_docs-getter.jwt"
```

```sh
#   ·  Fetching Access Token for scope: mcp:role.mcp-accessor api:role.docs-getter...
#   ✔  Access token issued for scope: mcp:role.mcp-accessor api:role.docs-getter
#   ✔  Token saved to: ./keys/api_mcp-accessor_docs-getter.jwt
```

The relevant claims are shown below (scope order may differ). Only the audience-domain role is shortened:

```json
{
  "aud": "mcp",
  "scp": ["mcp-accessor", "api:role.docs-getter"]
}
```

The MCP adapter requests `audience=api` and `scope=api:role.docs-getter` for its downstream exchange. The resulting API token has `aud=api` and `scp=["docs-getter"]`; it no longer carries MCP access. The API rejects the original MCP-bound token even though that token carries its qualified API scope.

Navigate back to Open WebUI and replace the MCP Authorization header with this new access token.

## Verify

Ask Open WebUI again:

```sh
get docs!
```

Check the MCP server logs to confirm the proxy authorized the request:

```sh
kubectl logs deploy/mcp -n api -c auth-proxy
```

<a id="review-summary-of-changes"></a>

## Review the Result

MCP Runtime Proxy now validates tokens in front of the MCP adapter. Any client can initialize and list tools without an Athenz access role. Protected methods such as `tools/call` reach the MCP server only when the caller's access token carries the `mcp:role.mcp-accessor` scope.

<a id="whats-next"></a>

## Next Steps

Next: [Identity Provider](./13-identity-provider.md)
