| Previous | Current | Next |
|:---:|:---:|:---:|
| [Codex](./09-ai-agent.md) | **Protect MCP Server — Codex** | [Token Exchange](./11-token-exchange.md) |

# Protect MCP Server — Codex

In the previous chapter, the AI client retrieved documents with an Athenz access token (AT). Just as we protected the API server with an AT, we also want to protect the MCP server. In this chapter, we will deploy a component called `MCP Runtime Proxy` to validate ATs before allowing tool calls.

<!-- TOC depthFrom:2 depthTo:2 -->

- [Deploy MCP Runtime Proxy](#deploy-mcp-runtime-proxy)
- [Verify MCP Access Is Rejected](#verify-mcp-access-is-rejected)
- [Create the MCP Service Identity](#create-the-mcp-service-identity)
- [Create a Kubernetes Secret](#create-a-kubernetes-secret)
- [Configure Downstream Token Exchange](#configure-downstream-token-exchange)
- [Grant the Learner MCP Access](#grant-the-learner-mcp-access)
- [Verify Token Exchange Is Denied](#verify-token-exchange-is-denied)
- [Understand the Result](#understand-the-result)
- [Next Steps](#next-steps)

<!-- /TOC -->

## Deploy MCP Runtime Proxy

### Attach the Proxy

Add Runtime Proxy as a second container in the MCP pod. It will require audience `mcp` and scope `mcp:role.mcp-accessor` for tool calls. These are local validation settings; the Athenz domain and role will be created later.

```sh
kubectl patch deploy mcp -n mcp --patch "$(cat <<'EOF'
spec:
  template:
    spec:
      containers:
        - name: idthw-demo-api-mcp
          env:
            - name: HOST
              value: "127.0.0.1"
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
EOF
)"
```

```sh
# deployment.apps/mcp patched
```

Both containers share the pod's network. `HOST=127.0.0.1` makes the MCP app listen only on loopback, where Runtime Proxy can reach it at `http://127.0.0.1:8080`. This prevents callers from bypassing the proxy through the MCP app's port. The proxy listens on `8082`.

The proxy reads `/var/run/athenz/ca.crt` at startup. Until you mount the CA in the next step, its container will exit and restart; wait for readiness after that step.

### Create and Attach the CA Secret

Create a Secret containing the existing Athenz CA certificate. Runtime Proxy uses it to trust ZTS when loading signing keys and exchanging tokens:

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

Before creating the MCP domain or service identity in Athenz, try a tool call without a token:

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

The AI client can still connect and discover tools. Runtime Proxy rejects tool calls without a token. The API-audience token configured in Codex in the previous chapter also fails the proxy's MCP audience check; the next steps issue an MCP-audience token.

Check the proxy log:

```sh
kubectl logs deploy/mcp -n mcp -c auth-proxy --tail=30
```

Look for "access denied" with `code=missing_access_token` and `status=401`. The request stops at MCP access validation, before any downstream exchange or API call.

![Runtime Proxy rejects a tool call without an access token](../assets/core_10_mcp_rejected.svg)

## Create the MCP Service Identity

The first failure confirms that Runtime Proxy protects tool calls. Now set up the MCP domain and the identities needed to proceed. Runtime Proxy needs a service identity to authenticate downstream token exchange requests to ZTS. The MCP application itself will not mount the private key. Create the service `idthw-api-mcp` under the Athenz top-level domain (TLD) `mcp`. Its principal is `mcp.idthw-api-mcp`; the API keeps the `api` domain. Athenz domains and Kubernetes namespaces are independent, even when both are named `mcp`.

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

Store the service certificate and private key in the `mcp` namespace. Only Runtime Proxy will mount this Secret; the CA remains in the separate CA Secret attached earlier:

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

Repeat the same tool call, this time with the MCP-audience token from the preceding step. If you took a break and it has expired, rerun that token command first:

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

For the same `requestId`, look for "access token verified", then "downstream token exchange failed" with `code=downstream_token_exchange_denied` and `status=403`. This is a different failure from the earlier "access denied": the learner can now access MCP, but the proxy's service identity still lacks permission to exchange the token for the API.

![MCP access passes, but Athenz denies Runtime Proxy's downstream exchange](../assets/core_10_exchange_denied.svg)

## Understand the Result

The same document request stops at two different checks as you build the setup:

| Stage | Result | Proxy log |
|---|---|---|
| Proxy running; request has no token | `401 missing_access_token` | "access denied" |
| MCP identity configured; learner has an MCP token | `403 downstream_token_exchange_denied` | "access token verified", then "downstream token exchange failed" |

The second failure shows why token exchange is needed: the learner's token is addressed to MCP, while the API requires an API-audience token. The proxy is configured to perform that exchange, but Athenz has not authorized it yet. Both failures occur before the tool call reaches the MCP application or API; discovery remains available.

## Next Steps

MCP access now passes, but Athenz rejects the downstream token exchange. In the next chapter, you will grant the service exchange permissions and retry the request.

Next: [Token Exchange — Codex](./11-token-exchange.md)
