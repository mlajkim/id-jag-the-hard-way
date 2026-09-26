| Previous | Current | Next |
|:---:|:---:|:---:|
| [Protect MCP Server](./10-protect-mcp-server.md) | **Token Exchange** | [Identity Provider](./12-identity-provider.md) |

# Token Exchange

In the previous chapter, Runtime Proxy accepted the learner's MCP token, but document retrieval still failed with `502 downstream_token_exchange_unavailable`.

In this chapter, we will create Runtime Proxy's service identity, configure the exchange and shared token files, grant the required Athenz permissions, and retrieve documents through the protected MCP server.

<!-- TOC depthFrom:2 depthTo:2 -->

- [Understand the Remaining Error](#understand-the-remaining-error)
- [How Token Exchange Works](#how-token-exchange-works)
- [Create the MCP Service Identity](#create-the-mcp-service-identity)
- [Create a Kubernetes Secret](#create-a-kubernetes-secret)
- [Configure Downstream Token Exchange](#configure-downstream-token-exchange)
- [Refresh the Learner Token](#refresh-the-learner-token)
- [Verify Token Exchange Is Denied](#verify-token-exchange-is-denied)
- [Authorize the Downstream Exchange](#authorize-the-downstream-exchange)
- [Verify](#verify)
- [Update the AI Client](#update-the-ai-client)
- [Understand the Result](#understand-the-result)
- [Next Steps](#next-steps)

<!-- /TOC -->

## Understand the Remaining Error

The learner's MCP token and API scope pass validation, but Runtime Proxy needs its own service identity to authenticate token exchange requests to Athenz. The service certificate has not been mounted yet, so the tool request returns HTTP `502`:

```json
{
  "error": "downstream_token_exchange_unavailable",
  "message": "Token exchange failed: the required MCP service certificate could not be read. Check ATHENZ_TOKEN_EXCHANGE_CERT_PATH."
}
```

Check the proxy log:

```sh
kubectl logs deploy/mcp -n mcp -c auth-proxy --tail=3
```

Look for an entry like this:

```sh
# 2026-XX-XXT07:05:21.312Z × ERROR [mcp-runtime-proxy] [exchange] downstream token exchange failed | requestId=eb1c16b4-6ec0-445f-905d-7baa32cb4952 method=POST path=/mcp code=downstream_token_exchange_unavailable durationMs=3 message="Token exchange failed: the required MCP service certificate could not be read. Check ATHENZ_TOKEN_EXCHANGE_CERT_PATH." status=502 reason=service_certificate_unavailable credentialPath=/var/run/athenz/service.cert.pem fileErrorCode=ENOENT athenzRequestSent=false
```

`reason=service_certificate_unavailable` identifies the failure. `credentialPath` names the required file, and `fileErrorCode=ENOENT` means it is missing. The learner's scopes are checked before the proxy reads its service credentials.

`athenzRequestSent=false` confirms that no exchange request reached Athenz, so Athenz has not checked the proxy's exchange permissions yet. The MCP tool and API have not been called.

## How Token Exchange Works

The AI client sends the learner's access token with audience `mcp`. Runtime Proxy first validates that token and checks both MCP access and the API scope required by the tool. It then reads its service certificate and private key and authenticates to Athenz ZTS as `mcp.idthw-api-mcp`. It submits the learner's token and requests a new token with audience `api` and scope `api:role.docs-getter`. The tool's configured scope triggers this exchange automatically.

Athenz checks whether the service may exchange tokens from the `mcp` audience into the API's `docs-getter` role. After the exchange succeeds, Runtime Proxy writes the API token to a request-specific file and passes the file path to the MCP server. The MCP server uses that token to call the API. The proxy removes the file when the request finishes.

![Runtime Proxy exchanges the learner's MCP token for an API token before MCP calls the API](./assets/core_11_exchange_allowed.svg)

## Create the MCP Service Identity

Runtime Proxy needs a service identity to authenticate token exchange requests to Athenz ZTS. Create `idthw-api-mcp` in the `mcp` domain from chapter 10. Its principal is `mcp.idthw-api-mcp`, and only Runtime Proxy will mount its private key.

Use the identity and certificate helper scripts to create the MCP service identity, `mcp.idthw-api-mcp`:

```sh
./tools/athenz/create-private-key.sh "./keys/api-mcp"
./tools/athenz/create-service.sh "mcp" "idthw-api-mcp" "./keys/api-mcp.public.key"
./tools/athenz/enable-cert-provider.sh "mcp" "idthw-api-mcp"
./tools/athenz/fetch-cert.sh "mcp" "idthw-api-mcp" "./keys/api-mcp.key" "v1"
```

```sh
#   ·  Generating RSA key pair for: ./keys/api-mcp...
#   ✔  Keys generated: ./keys/api-mcp.key, ./keys/api-mcp.public.key
#   ·  Registering Service: mcp.idthw-api-mcp...
#   ✔  Service registered: mcp.idthw-api-mcp
#   ·  Enabling ZTS Certificate Provider for mcp.idthw-api-mcp...
# [Template(s) successfully applied to domain]
#   ✔  ZTS Certificate Provider enabled for mcp.idthw-api-mcp
#   ·  Fetching X.509 Certificate for mcp.idthw-api-mcp...
#   ✔  Certificate saved to: ./keys/api-mcp.crt
```

<a id="create-k8s-secret"></a>

## Create a Kubernetes Secret

Store the service certificate and private key in the `mcp` namespace. Only Runtime Proxy will mount this Secret; the CA remains in the separate CA Secret mounted in chapter 10:

```sh
kubectl -n mcp create secret generic api-mcp-cert \
  --from-file=api-mcp.crt=./keys/api-mcp.crt \
  --from-file=api-mcp.key=./keys/api-mcp.key \
  --dry-run=client -o yaml | kubectl apply -f -
```

```sh
# secret/api-mcp-cert created
```

## Configure Downstream Token Exchange

### Mount the Service Identity

Mount the service identity in Runtime Proxy, separately from the CA certificate:

```sh
kubectl patch deploy mcp -n mcp --patch "$(cat <<'EOF'
spec:
  template:
    spec:
      containers:
        - name: auth-proxy
          volumeMounts:
            - name: mcp-identity
              mountPath: /var/run/athenz-identity
              readOnly: true
      volumes:
        - name: mcp-identity
          secret:
            secretName: api-mcp-cert
EOF
)"
```

```sh
# deployment.apps/mcp patched
```

### Share the API Token Directory

Give the proxy an in-memory directory for exchanged API tokens. Mount the same directory read-only in the MCP container so it can use those tokens. `fsGroup: 1000` lets the MCP process read the shared files.

The diagram shows how both containers use the same files after token exchange succeeds:

![Inside the MCP pod, Runtime Proxy writes an API token to shared memory, passes its file path to MCP, and MCP reads the file through a read-only mount](./assets/core_10_shared_api_token_directory.svg)

```sh
kubectl patch deploy mcp -n mcp --patch "$(cat <<'EOF'
spec:
  template:
    spec:
      securityContext:
        fsGroup: 1000
      containers:
        - name: auth-proxy
          volumeMounts:
            - name: access-tokens
              mountPath: /var/run/idthw-access-tokens
        - name: idthw-demo-api-mcp
          volumeMounts:
            - name: access-tokens
              mountPath: /var/run/idthw-access-tokens
              readOnly: true
      volumes:
        - name: access-tokens
          emptyDir:
            medium: Memory
EOF
)"
```

```sh
# deployment.apps/mcp patched
```

### Configure the Service Credential Paths

Point Runtime Proxy at the mounted service certificate and private key. The `MCP_TOOL_SCOPES` mapping from chapter 10 already triggers exchange after the learner's scopes pass validation.

```sh
kubectl set env deploy/mcp -n mcp --containers=auth-proxy \
  ATHENZ_TOKEN_EXCHANGE_CERT_PATH=/var/run/athenz-identity/api-mcp.crt \
  ATHENZ_TOKEN_EXCHANGE_KEY_PATH=/var/run/athenz-identity/api-mcp.key
```

```sh
# deployment.apps/mcp env updated
```

For each tool call, the proxy writes the exchanged token to a request-specific file and passes its path to MCP. The MCP server uses that token to call the API. The proxy removes the file after the response. Athenz still needs to authorize the exchange; we will verify that denial below.

Wait for the updated pod to be ready:

```sh
kubectl rollout status deploy/mcp -n mcp
```

```sh
# deployment "mcp" successfully rolled out
```

Restart `./tools/keep-k8s-port-forward.sh` so the local connection reaches the updated pod.

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

## Verify Token Exchange Is Denied

Retry the tool call with the fresh MCP-audience token from the preceding step:

```sh
_mcp_port=$(./tools/port.sh mcp)
curl -sS -w '\nHTTP %{http_code}\n' "http://localhost:${_mcp_port}/mcp" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer ${_my_access_token}" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_k8s_docs","arguments":{}}}'
```

```sh
# {"error":"downstream_token_exchange_denied","message":"Athenz denied the downstream token exchange."}
# HTTP 403
```

This time MCP access passes. Runtime Proxy authenticates as `mcp.idthw-api-mcp` and attempts to exchange the incoming token for `aud=api` with `api:role.docs-getter`. Athenz rejects that exchange because the service has not been granted exchange permission.

```sh
kubectl logs deploy/mcp -n mcp -c auth-proxy --tail=50
```

For the same `requestId`, look for "access token verified", then "downstream token exchange failed" with `code=downstream_token_exchange_denied` and `status=403`. The log also includes `reason=athenz_error_response`, `athenzRequestSent=true`, and `athenzStatus`. The proxy can now contact Athenz, but its service identity still lacks exchange permission.

![MCP access passes, but Athenz denies Runtime Proxy's downstream exchange](./assets/core_10_exchange_denied.svg)

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

## Verify

Fetch a fresh MCP-audience token and repeat the request that returned `403`:

```sh
_mcp_port=$(./tools/port.sh mcp)
_scope="mcp:role.mcp-accessor api:role.docs-getter"
_my_access_token=$(./tools/athenz/fetch-access-token.sh \
  "./keys/idjag-learner.crt" \
  "./keys/idjag-learner.key" \
  "${_scope}" \
  "./keys/idjag-learner.jwt" \
  --audience mcp)

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

For Claude Code, fetch a fresh MCP-audience token and update `.mcp.json` in the same block:

```sh
_mcp_port=$(./tools/port.sh mcp)
_scope="mcp:role.mcp-accessor api:role.docs-getter"
_my_access_token=$(./tools/athenz/fetch-access-token.sh \
  "./keys/idjag-learner.crt" \
  "./keys/idjag-learner.key" \
  "${_scope}" \
  "./keys/idjag-learner.jwt" \
  --audience mcp)

cat > .mcp.json <<EOF
{
  "mcpServers": {
    "id-jag-the-hard-way-mcp": {
      "type": "http",
      "url": "http://localhost:${_mcp_port}/mcp",
      "headers": { "Authorization": "Bearer ${_my_access_token}" }
    }
  }
}
EOF
```

Reload the configuration with `/reload-plugins` (or restart Claude Code), then ask:

```sh
Get docs with id-jag-the-hard-way-mcp
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
