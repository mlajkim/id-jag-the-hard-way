| Previous | Current | Next |
|:---:|:---:|:---:|
| [Open WebUI](./09-ai-agent.md) | **Protect MCP Server — Open WebUI** | [Token Exchange](./11-token-exchange.md) |

# Protect MCP Server — Open WebUI

In the previous chapter, the AI client retrieved documents with an Athenz access token (AT). Just as we protected the API server with an AT, we also want to protect the MCP server.

The [MCP authorization specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization#access-token-privilege-restriction) states:

> *If the MCP server makes requests to upstream APIs, it may act as an OAuth client to them. The access token used at the upstream API is a separate token, issued by the upstream authorization server. The MCP server **MUST NOT** pass through the token it received from the MCP client.*

In this chapter, we will deploy `MCP Runtime Proxy` as an authorization proxy in front of the MCP server. It will require an AT with audience `mcp` and scope `mcp:role.mcp-accessor` for tool calls. We will verify that it rejects the previous API token, then grant the learner MCP access.

<!-- TOC depthFrom:2 depthTo:2 -->

- [Deploy MCP Runtime Proxy as an Authorization Proxy](#deploy-mcp-runtime-proxy-as-an-authorization-proxy)
- [Verify MCP Access Is Rejected](#verify-mcp-access-is-rejected)
- [Grant the Learner MCP Access](#grant-the-learner-mcp-access)
- [Verify MCP Access Is Accepted](#verify-mcp-access-is-accepted)
- [Next Steps](#next-steps)

<!-- /TOC -->

## Deploy MCP Runtime Proxy as an Authorization Proxy

The proxy checks Athenz access tokens before forwarding tool calls to the MCP server.

### Attach the Proxy

Add Runtime Proxy as a second container in the MCP pod. Configure the required audience and MCP scope, along with the API permission each tool needs in `MCP_TOOL_SCOPES`. We will create the Athenz domain and learner role below.

```sh
kubectl patch deploy mcp -n mcp --patch "$(cat <<'EOF'
spec:
  template:
    spec:
      containers:
        - name: auth-proxy
          image: ghcr.io/mlajkim/mcp-runtime-proxy:latest
          imagePullPolicy: Always
          env:
            - name: ATHENZ_EXPECTED_AUDIENCE
              value: "mcp"
            - name: ATHENZ_REQUIRED_SCOPE
              value: "mcp:role.mcp-accessor"
            - name: MCP_PUBLIC_OPENAPI_ENABLED
              value: "true"
            - name: MCP_TOOL_SCOPES
              value: '{"get_k8s_docs":"api:role.docs-getter","post_k8s_doc":"api:role.docs-poster","delete_k8s_doc":"api:role.docs-deleter"}'
          ports:
            - containerPort: 8082
          readinessProbe:
            httpGet:
              path: /readyz
              port: 8082
          livenessProbe:
            httpGet:
              path: /healthz
              port: 8082
EOF
)"
```

```sh
# deployment.apps/mcp patched
```

Both containers share the pod's network. Runtime Proxy listens on `8082` and reaches the MCP app at its default loopback address, `http://127.0.0.1:8080`.

The proxy reads `/var/run/athenz/ca.crt` at startup. Until you mount the CA in the next step, its container will exit and restart; wait for readiness after that step.

### Create and Attach the CA Secret

Create a Secret containing the existing Athenz CA certificate. Runtime Proxy uses it to trust ZTS when loading the signing keys needed to validate access tokens:

```sh
kubectl -n mcp create secret generic mcp-runtime-proxy-athenz-ca \
  --from-file=ca.crt=./athenz_dist/certs/ca.cert.pem \
  --dry-run=client -o yaml | kubectl apply -f -
```

```sh
# secret/mcp-runtime-proxy-athenz-ca created
```

Mount the CA Secret in Runtime Proxy:

```sh
kubectl patch deploy mcp -n mcp --patch "$(cat <<'EOF'
spec:
  template:
    spec:
      containers:
        - name: auth-proxy
          volumeMounts:
            - name: athenz-ca-secret
              mountPath: /var/run/athenz
              readOnly: true
      volumes:
        - name: athenz-ca-secret
          secret:
            secretName: mcp-runtime-proxy-athenz-ca
EOF
)"
```

```sh
# deployment.apps/mcp patched
```

The proxy can now start. Its readiness probe checks MCP initialization. Tool discovery and OpenAPI discovery stay public.

### Route Requests Through the Proxy

Wait for both containers to be ready:

```sh
kubectl rollout status deploy/mcp -n mcp
```

```sh
# deployment "mcp" successfully rolled out
```

Point the Service at Runtime Proxy on `8082`, keeping its public port `8081`:

```sh
kubectl patch svc mcp -n mcp --patch '{"spec":{"ports":[{"port":8081,"targetPort":8082}]}}'
```

```sh
# service/mcp patched
```

Restart `./tools/keep-k8s-port-forward.sh` after this change so the local connection targets the proxy.

## Verify MCP Access Is Rejected

With the proxy in place, ask Open WebUI to retrieve documents again using the same configuration as in the previous chapter. Start a new chat with the document tool enabled and ask:

```sh
Get docs with the API MCP Server
```

The tool call should be rejected with `401 invalid_access_token`.

Open WebUI can still discover tools through `/openapi.json`, but Runtime Proxy rejects this tool call. The token configured in the previous chapter has audience `api`; the proxy now requires audience `mcp`. Even an unexpired API token fails this check. The next steps issue an MCP-audience token.

Check the proxy log for the reason behind Open WebUI's authentication message:

```sh
kubectl logs deploy/mcp -n mcp -c auth-proxy --tail=2
```

Example output from the updated proxy for an unexpired API-audience token:

```sh
# 2026-XX-XXT03:20:11.552Z → INFO  [mcp-runtime-proxy] [request] request received | requestId=434926ee-eba7-4770-aca3-6a292410b19c method=POST path=/tools/get_k8s_docs accessTokenPresent=true
# 2026-XX-XXT03:20:11.583Z ! WARN  [mcp-runtime-proxy] [auth] access denied | requestId=434926ee-eba7-4770-aca3-6a292410b19c method=POST path=/tools/get_k8s_docs accessTokenPresent=true code=invalid_access_token durationMs=31 message="The Athenz access token is invalid or expired." status=401 expectedAudience=mcp requiredScope=mcp:role.mcp-accessor keyId=athenz-zts-server-example signatureVerified=true expiresAt=2026-XX-XXT04:20:11.000Z expiresInSeconds=3600 audiences=["api"] reason=audience_mismatch
```

`reason=audience_mismatch`, `expectedAudience=mcp`, and `audiences=["api"]` identify the failed check. `signatureVerified=true` and the positive `expiresInSeconds` show that the signature and expiration checks passed.

`invalid_access_token` is the client-facing error code. An expired token instead logs `reason=token_expired`, its `expiresAt`, and a nonpositive `expiresInSeconds`; expiration is checked before audience. If Open WebUI sends no bearer token, the log shows `accessTokenPresent=false`, `code=missing_access_token`, and `reason=missing_authorization`, also with `status=401`. These failures stop the request at the proxy before it reaches the MCP application.

![Runtime Proxy returns 401 to the AI agent; the MCP server and API are not called](../assets/core_10_mcp_rejected.svg)

## Grant the Learner MCP Access

Create the `mcp` domain:

```sh
./tools/athenz/create-tld.sh "mcp"
```

Create the MCP accessor role:

```sh
./tools/athenz/create-role.sh "mcp" "mcp-accessor"
```

Add the learner to that role:

```sh
./tools/athenz/add-role-member.sh "mcp" "mcp-accessor" "human.idjag-learner"
```

Request both MCP and API scopes, explicitly selecting the MCP audience:

```sh
_scope="mcp:role.mcp-accessor api:role.docs-getter"
_my_access_token=$(./tools/athenz/fetch-access-token.sh \
  "./keys/idjag-learner.crt" \
  "./keys/idjag-learner.key" \
  "${_scope}" \
  "./keys/idjag-learner.jwt" \
  --audience mcp)
```

The relevant claims are:

```json
{
  "aud": "mcp",
  "scp": ["mcp-accessor", "api:role.docs-getter"]
}
```

The MCP role permits tool execution, and the API role records the learner's permission to read documents. This token is addressed to MCP.

## Verify MCP Access Is Accepted

Call the tool through the proxy with the MCP-audience token from the preceding step. If the token has expired, rerun that token command first:

```sh
_mcp_port=$(./tools/port.sh mcp)
curl -sS -w '\nHTTP %{http_code}\n' "http://localhost:${_mcp_port}/mcp" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer ${_my_access_token}" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_k8s_docs","arguments":{}}}'
```

Document retrieval still returns `502 downstream_token_exchange_unavailable` at this stage. Check the proxy log to confirm that MCP access now passes:

```sh
kubectl logs deploy/mcp -n mcp -c auth-proxy --tail=3
```

Look for `access token verified` with `audiences=["mcp"]` and `mcp-accessor` in `scopes`. This confirms that the MCP access check passed. We will resolve the remaining error in chapter 11.

## Next Steps

In the next chapter, you will configure token exchange so MCP can retrieve documents from the protected API.

Next: [Token Exchange — Open WebUI](./11-token-exchange.md)
