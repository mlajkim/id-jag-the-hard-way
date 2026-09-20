| Previous | Current | Next |
|:---:|:---:|:---:|
| [Open WebUI](./09-ai-agent.md) | **Protect MCP Server — Open WebUI** | [Token Exchange](./11-token-exchange.md) |

# Protect MCP Server — Open WebUI

The MCP server is running, and the AI client can discover its tools. Add MCP Runtime Proxy, require a token addressed to MCP, and observe two separate failures: rejected MCP access, then denied downstream token exchange.

<!-- TOC depthFrom:2 depthTo:2 -->

- [Create the MCP Service Identity](#create-the-mcp-service-identity)
- [Create a Kubernetes Secret](#create-a-kubernetes-secret)
- [Deploy MCP Runtime Proxy](#deploy-mcp-runtime-proxy)
- [Verify MCP Access Is Rejected](#verify-mcp-access-is-rejected)
- [Grant the Learner MCP Access](#grant-the-learner-mcp-access)
- [Verify Token Exchange Is Denied](#verify-token-exchange-is-denied)
- [Understand the Result](#understand-the-result)
- [Next Steps](#next-steps)

<!-- /TOC -->



## Create the MCP Service Identity

MCP Runtime Proxy needs a service identity to authenticate downstream token exchange requests to ZTS. The MCP application itself will not mount the private key. Create the service `idthw-api-mcp` under the Athenz top-level domain (TLD) `mcp`. Its principal is `mcp.idthw-api-mcp`; the API keeps the `api` domain. Athenz domains and Kubernetes namespaces are independent, even when both are named `mcp`.

Create the MCP domain:

```sh
./tools/athenz/create-tld.sh "mcp"
```

Generate a key pair for the service:

```sh
./tools/athenz/create-private-key.sh "./keys/api-mcp"
```

```sh
#   ·  Generating RSA key pair for: ./keys/api-mcp...
#   ✔  Keys generated: ./keys/api-mcp.key, ./keys/api-mcp.public.key
```

Register the service with its public key:

```sh
./tools/athenz/create-service.sh "mcp" "idthw-api-mcp" "./keys/api-mcp.public.key"
```

```sh
#   ·  Registering Service: mcp.idthw-api-mcp...
#   ✔  Service registered: mcp.idthw-api-mcp
```

Allow ZTS to issue a certificate for this service:

```sh
./tools/athenz/enable-cert-provider.sh "mcp" "idthw-api-mcp"
```

```sh
#   ·  Enabling ZTS Certificate Provider for mcp.idthw-api-mcp...
# [Template(s) successfully applied to domain]
#   ✔  ZTS Certificate Provider enabled for mcp.idthw-api-mcp
```

Request the service certificate:

```sh
./tools/athenz/fetch-cert.sh "mcp" "idthw-api-mcp" "./keys/api-mcp.key" "v1"
```

```sh
#   ·  Fetching X.509 Certificate for mcp.idthw-api-mcp...
#   ✔  Certificate saved to: ./keys/api-mcp.crt
```

<a id="create-k8s-secret"></a>

## Create a Kubernetes Secret

Create the secret in the `mcp` namespace so the MCP deployment can mount it:

```sh
kubectl -n mcp create secret generic api-mcp-cert \
  --from-file=api-mcp.crt=./keys/api-mcp.crt \
  --from-file=api-mcp.key=./keys/api-mcp.key \
  --from-file=ca.crt=./athenz_dist/certs/ca.cert.pem
```

```sh
# secret/api-mcp-cert created
```

## Deploy MCP Runtime Proxy

### Attach the Proxy

Add Runtime Proxy as a second container in the MCP pod. Mount the Secret only in the proxy: it uses `ca.crt` to trust ZTS and the service identity for token exchange. It will validate incoming tokens for audience `mcp` and scope `mcp:role.mcp-accessor`.

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
          volumeMounts:
            - name: mcp-identity
              mountPath: /var/run/athenz
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

The proxy listens on `8082` and reaches the MCP server at `http://127.0.0.1:8080` by default. Its readiness probe checks MCP initialization. Tool discovery and OpenAPI discovery stay public.

### Share the API Token Directory

Give the proxy an in-memory directory for exchanged API tokens. Mount the same directory read-only in the MCP container so it can use those tokens. `fsGroup: 1000` lets the MCP process read the shared files.

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
  ATHENZ_TOKEN_EXCHANGE_CERT_PATH=/var/run/athenz/api-mcp.crt \
  ATHENZ_TOKEN_EXCHANGE_KEY_PATH=/var/run/athenz/api-mcp.key \
  MCP_TOOL_SCOPES='{"get_k8s_docs":"api:role.docs-getter","post_k8s_doc":"api:role.docs-poster","delete_k8s_doc":"api:role.docs-deleter"}'
```

```sh
# deployment.apps/mcp env updated
```

For each tool call, the proxy writes the exchanged token to a request-specific file and passes its path to MCP. The MCP server uses that token to call the API. The proxy removes the file after the response. Athenz still needs to authorize the exchange; we will verify that denial below.

### Route Requests Through the Proxy

Bind the MCP server to loopback so only Runtime Proxy listens on the pod's network interface:

```sh
kubectl set env deploy/mcp -n mcp --containers=idthw-demo-api-mcp HOST=127.0.0.1
```

```sh
# deployment.apps/mcp env updated
```

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

Try a tool call without a token:

```sh
_mcp_port=$(./tools/port.sh mcp)
curl -sS -w '\nHTTP %{http_code}\n' "http://localhost:${_mcp_port}/mcp" \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_k8s_docs","arguments":{}}}'
```

```sh
# {"error":"missing_access_token","message":"Pass an Athenz access token as Authorization: Bearer <token>."}
# HTTP 401
```

The AI client can still connect and discover tools. Runtime Proxy rejects tool calls without a token. The API-audience token configured in Open WebUI in chapter 09 also fails the proxy's MCP audience check; the next steps issue an MCP-audience token.

![Runtime Proxy rejects a tool call without an access token](../assets/core_10_mcp_rejected.svg)

## Grant the Learner MCP Access

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

The MCP role permits tool execution. The API role permits the later exchange into document access; the API still rejects this MCP-audience token directly.

## Verify Token Exchange Is Denied

Fetch a fresh MCP-audience token and send the tool request:

```sh
_mcp_port=$(./tools/port.sh mcp)
_scope="mcp:role.mcp-accessor api:role.docs-getter"
_my_access_token=$(./tools/athenz/fetch-access-token.sh \
  "./keys/idjag-learner.crt" \
  "./keys/idjag-learner.key" \
  "${_scope}" \
  "./keys/idjag-learner.jwt" \
  --audience mcp)

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
kubectl logs deploy/mcp -n mcp -c auth-proxy
```

Look for "access token verified", then "downstream token exchange failed" with status=403.

![MCP access passes, but Athenz denies Runtime Proxy's downstream exchange](../assets/core_10_exchange_denied.svg)

## Understand the Result

The pod is ready and discovery works. The protected document request is deliberately denied before reaching the MCP application or API. User role membership and the service's exchange permissions are separate checks.

## Next Steps

MCP access now passes, but Athenz rejects the downstream token exchange. In the next chapter, you will grant the service exchange permissions and retry the request.

Next: [Token Exchange — Open WebUI](./11-token-exchange.md)
