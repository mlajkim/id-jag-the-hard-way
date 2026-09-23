| Previous | Current | Next |
|:---:|:---:|:---:|
| [Protect MCP Server](./10-protect-mcp-server.md) | **Token Exchange — Codex** | [Identity Provider](./12-identity-provider.md) |

# Token Exchange — Codex

In the previous chapter, Runtime Proxy accepted the learner's MCP token, then returned `502 downstream_token_exchange_unavailable` because token exchange was not configured.

In this chapter, we will create Runtime Proxy's service identity, configure the exchange and shared token files, grant the required Athenz permissions, and retrieve the documents through Codex.

<!-- TOC depthFrom:2 depthTo:2 -->

- [How Token Exchange Works](#how-token-exchange-works)
- [Create the MCP Service Identity](#create-the-mcp-service-identity)
- [Create a Kubernetes Secret](#create-a-kubernetes-secret)
- [Configure Downstream Token Exchange](#configure-downstream-token-exchange)
- [Refresh the Learner Token](#refresh-the-learner-token)
- [Update Codex with the MCP Token](#update-codex-with-the-mcp-token)
- [Verify Token Exchange Is Denied](#verify-token-exchange-is-denied)
- [Authorize the Downstream Exchange](#authorize-the-downstream-exchange)
- [Verify Document Retrieval](#verify-document-retrieval)
- [Next Steps](#next-steps)

<!-- /TOC -->

## How Token Exchange Works

Codex sends the learner's access token with audience `mcp`. Runtime Proxy validates that token, then authenticates to Athenz ZTS as `mcp.idthw-api-mcp` using its service certificate. It submits the learner's token and requests a new token with audience `api` and scope `api:role.docs-getter`.

Athenz checks whether the service may exchange tokens from the `mcp` audience into the API's `docs-getter` role. After the exchange succeeds, Runtime Proxy writes the API token to a request-specific file and passes the file path to the MCP server. The MCP server uses that token to call the API. The proxy removes the file when the request finishes.

![Runtime Proxy exchanges the learner's MCP token for an API token before MCP calls the API](../assets/core_11_exchange_allowed.svg)

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

![Inside the MCP pod, Runtime Proxy writes an API token to shared memory, passes its file path to MCP, and MCP reads the file through a read-only mount](../assets/core_10_shared_api_token_directory.svg)

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

### Enable Downstream Token Exchange

Configure Runtime Proxy to exchange tokens using the mounted service identity. `MCP_TOOL_SCOPES` selects the API scope for each tool; the verified incoming token must also grant that scope.

```sh
kubectl set env deploy/mcp -n mcp --containers=auth-proxy \
  ATHENZ_TOKEN_FILE_EXCHANGE_ENABLED=true \
  ATHENZ_TOKEN_EXCHANGE_CERT_PATH=/var/run/athenz-identity/api-mcp.crt \
  ATHENZ_TOKEN_EXCHANGE_KEY_PATH=/var/run/athenz-identity/api-mcp.key \
  MCP_TOOL_SCOPES='{"get_k8s_docs":"api:role.docs-getter","post_k8s_doc":"api:role.docs-poster","delete_k8s_doc":"api:role.docs-deleter"}'
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

Fetch a fresh learner token with the same audience and both scopes used in chapter 10:

```sh
_scope="mcp:role.mcp-accessor api:role.docs-getter"
_my_access_token=$(./tools/athenz/fetch-access-token.sh \
  "./keys/idjag-learner.crt" \
  "./keys/idjag-learner.key" \
  "${_scope}" \
  "./keys/idjag-learner.jwt" \
  --audience mcp)
```

The decoded output should show `aud=mcp` and both `mcp-accessor` and `api:role.docs-getter` in `scp`. Runtime Proxy obtains the separate API-audience token during the tool call.

<a id="update-the-client"></a>

## Update Codex with the MCP Token

In the same shell where you issued `_my_access_token`, update the tutorial's `.codex/config.toml`. If you have added unrelated settings, update just this server's `http_headers` entry instead of replacing the file:

```sh
_mcp_port=$(./tools/port.sh mcp)

cat > .codex/config.toml <<EOF
[mcp_servers.id-jag-the-hard-way-mcp]
url = "http://localhost:${_mcp_port}/mcp"
http_headers = { Authorization = "Bearer ${_my_access_token}" }
EOF
cat .codex/settings.toml >> .codex/config.toml
```

Exit the current Codex session:

```text
/quit
```

From the project directory, restart Codex and resume the conversation so it loads the updated token:

```sh
codex resume --last
```

## Verify Token Exchange Is Denied

Ask Codex to retrieve the documents again:

```sh
Get docs with id-jag-the-hard-way-mcp
```

Codex may report **Insufficient scope** because Runtime Proxy returns an `insufficient_scope` authentication challenge for this exchange failure. You can also check the proxy log for the reason behind this failure:

```sh
kubectl logs deploy/mcp -n mcp -c auth-proxy --tail=3
```

Example output:

```sh
# 2026-09-23T04:44:42.137Z → INFO  [mcp-runtime-proxy] [request] request received | requestId=7dd7e8b3-f274-4708-90a0-3dd28c48e2a3 method=POST path=/mcp accessTokenPresent=true
# 2026-09-23T04:44:42.158Z ✓ INFO  [mcp-runtime-proxy] [auth] access token verified | requestId=7dd7e8b3-f274-4708-90a0-3dd28c48e2a3 method=POST path=/mcp audiences=["mcp"] clientId=human.idjag-learner expiresAt=2026-09-23T05:42:36.000Z expiresInSeconds=3474 keyId=athenz-zts-server-5fcdbc67f4-lwctf scopes=["api:role.docs-getter","mcp-accessor"] subject=human.idjag-learner userId=human.idjag-learner
# 2026-09-23T04:44:42.190Z ! WARN  [mcp-runtime-proxy] [exchange] downstream token exchange failed | requestId=7dd7e8b3-f274-4708-90a0-3dd28c48e2a3 method=POST path=/mcp code=downstream_token_exchange_denied durationMs=53 message="Athenz denied the downstream token exchange." status=403
```

For the same `requestId`, look for "access token verified", then "downstream token exchange failed" with `code=downstream_token_exchange_denied` and `status=403`. This is a different failure from the earlier "access denied": the learner can now access MCP, but the proxy's service identity still lacks permission to exchange the token for the API.

![MCP access passes, but Athenz denies Runtime Proxy's downstream exchange](../assets/core_10_exchange_denied.svg)

## Authorize the Downstream Exchange

The learner already has both `mcp:role.mcp-accessor` and `api:role.docs-getter`. Now grant the proxy's service identity permission to perform the exchange. Athenz requires permission in both the source domain, `mcp`, and the target domain, `api`.

### Allow Exchange from MCP to API

Create an exchange role in `mcp`, allow `zts.token_source_exchange` toward `api`, and add `mcp.idthw-api-mcp` to the role:

```sh
./tools/athenz/create-role.sh "mcp" "to-api-exchanger"
./tools/athenz/add-policy.sh "mcp" "to-api-exchanger" "zts.token_source_exchange" "api"
./tools/athenz/add-role-member.sh "mcp" "to-api-exchanger" "mcp.idthw-api-mcp"
```

Example output on the first run:

```sh
#   ·  Creating Role: mcp:role.to-api-exchanger...
#   ✔  Role created: mcp:role.to-api-exchanger
#   ·  Creating Policy: mcp:policy.to-api-exchanger_zts_token_source_exchange_api...
#   ✔  Policy created: mcp:policy.to-api-exchanger_zts_token_source_exchange_api
#   ·  Adding Member mcp.idthw-api-mcp to Role: mcp:role.to-api-exchanger...
#   ✔  mcp.idthw-api-mcp  →  mcp:role.to-api-exchanger
```

The policy resource is `mcp:api`: the `mcp` domain permits this service to exchange an MCP-audience token toward the `api` domain.

### Allow Exchange into the API Role

Create an exchange role in `api`, allow `zts.token_target_exchange` from `mcp` into `docs-getter`, and add the same service identity:

```sh
./tools/athenz/create-role.sh "api" "docs-getter-exchanger"
./tools/athenz/add-policy.sh "api" "docs-getter-exchanger" "zts.token_target_exchange" "mcp:role.docs-getter"
./tools/athenz/add-role-member.sh "api" "docs-getter-exchanger" "mcp.idthw-api-mcp"
```

Example output on the first run:

```sh
#   ·  Creating Role: api:role.docs-getter-exchanger...
#   ✔  Role created: api:role.docs-getter-exchanger
#   ·  Creating Policy: api:policy.docs-getter-exchanger_zts_token_target_exchange_mcp_role_docs-getter...
#   ✔  Policy created: api:policy.docs-getter-exchanger_zts_token_target_exchange_mcp_role_docs-getter
#   ·  Adding Member mcp.idthw-api-mcp to Role: api:role.docs-getter-exchanger...
#   ✔  mcp.idthw-api-mcp  →  api:role.docs-getter-exchanger
```

The policy resource is `api:mcp:role.docs-getter`: the `api` domain permits this service to exchange a token from `mcp` into its `docs-getter` role. Document access comes from the learner's scope; the service's new roles authorize the exchange.

## Verify Document Retrieval

Ask Codex to repeat the request that returned **Insufficient scope**:

```sh
Get docs with id-jag-the-hard-way-mcp
```

Codex should now retrieve the documents. With the default documents from the tutorial, the tool's structured response should contain:

```json
{
  "status": 200,
  "ok": true,
  "data": {
    "docs": [
      { "id": 1, "name": "first default doc", "content": "hello world" },
      { "id": 2, "name": "second default doc", "content": "how are you?" }
    ]
  }
}
```

Check the proxy log:

```sh
kubectl logs deploy/mcp -n mcp -c auth-proxy --tail=5
```

For the same `requestId`, look for these events:

- `access token verified` — the learner's MCP token passed validation
- `downstream access token published` — the exchange succeeded and the API token file is ready
- `request completed` with `upstreamStatus=200` — the MCP server returned a response
- `downstream access token removed` — the proxy cleaned up the request's token file

If the log still shows `downstream_token_exchange_denied` immediately after the policy changes, allow Athenz's policy cache to refresh and retry the same request in Codex.

## Next Steps

Codex can now retrieve documents through the protected MCP service. Runtime Proxy exchanges the learner's MCP token for the API token needed by each request.

In the next chapter, you will deploy Keycloak so users can sign in and receive an ID token.

Next: [Identity Provider](./12-identity-provider.md)
