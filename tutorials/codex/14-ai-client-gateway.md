|                            Previous                            |            Current            |           Next           |
|:--------------------------------------------------------------:|:-----------------------------:|:------------------------:|
| [Trusted Identity Provider](./13-trusted-identity-provider.md) | **AI Client Gateway — Codex** | [ID-JAG](./15-id-jag.md) |

# AI Client Gateway — Codex

Deploy AI Client Gateway between Codex CLI and the MCP service with the following steps. The gateway uses the signed-in user's Keycloak ID token to obtain an Athenz access token. MCP Runtime Proxy performs the later exchange for API access.

<!-- TOC depthFrom:2 depthTo:2 -->

- [Deploy AI Client Gateway in K8s](#deploy-ai-client-gateway-in-k8s)
- [Generate the Required Certificates](#generate-the-required-certificates)
- [Mount the Certificates](#mount-the-certificates)
- [Create the Keycloak Client Secret](#create-the-keycloak-client-secret)
- [Configure the Gateway](#configure-the-gateway)
- [Sign Out of Keycloak](#sign-out-of-keycloak)
- [Update Codex MCP Config](#update-codex-mcp-config)
- [Verify](#verify)
- [Next Steps](#next-steps)

<!-- /TOC -->

## Deploy AI Client Gateway in K8s

The gateway belongs in the `human` namespace — it represents the human-controlled, client side of the architecture.

Create the `human` namespace (skip if already created in a previous tutorial):

```sh
kubectl create ns human
```

Deploy the gateway with name `codex-idjag-learner-ai-client-gateway`:

```sh
kubectl create deploy codex-idjag-learner-ai-client-gateway -n human \
  --image=ghcr.io/mlajkim/ai-client-gateway:latest
```

```sh
# deployment.apps/codex-idjag-learner-ai-client-gateway created
```

Check the logs from the `ai-client-gateway` container:

```sh
kubectl logs deploy/codex-idjag-learner-ai-client-gateway -n human -c ai-client-gateway
```

```sh
# ...
# Error: ENOENT: no such file or directory, open '/app/certs/ai-client-gateway.crt'
# ...
```

This is expected. The gateway needs an X.509 certificate to identify itself to Athenz ZTS, and we have not provided one yet.

> [!NOTE]
> If the result is `ContainerCreating`, the current container instance has not started yet. Wait briefly and retry, or add `--previous` to the command above if an earlier instance has already terminated.

## Generate the Required Certificates

Create the service identity and fetch its X.509 certificate:

```sh
./tools/athenz/create-private-key.sh "./keys/human-idjag-learner-codex"
./tools/athenz/create-subdomain.sh "human" "idjag-learner"
./tools/athenz/create-service.sh "human.idjag-learner" "codex" "./keys/human-idjag-learner-codex.public.key"
./tools/athenz/enable-cert-provider.sh "human.idjag-learner" "codex"
./tools/athenz/fetch-cert.sh "human.idjag-learner" "codex" "./keys/human-idjag-learner-codex.key" "v1"
```

```sh
#   ·  Generating RSA key pair for: ./keys/human-idjag-learner-codex...
#   ✔  Keys generated: ./keys/human-idjag-learner-codex.key, ./keys/human-idjag-learner-codex.public.key
#   ·  Creating Subdomain: human.idjag-learner...
#   ✔  Subdomain created: human.idjag-learner
#   ·  Registering Service: human.idjag-learner.codex...
#   ✔  Service registered: human.idjag-learner.codex
#   ·  Enabling ZTS Certificate Provider for human.idjag-learner.codex...
# [Template(s) successfully applied to domain]
#   ✔  ZTS Certificate Provider enabled for human.idjag-learner.codex
#   ·  Fetching X.509 Certificate for human.idjag-learner.codex...
#   ✔  Certificate saved to: ./keys/human-idjag-learner-codex.crt
```

## Mount the Certificates

Store the certificate, private key, and CA certificate in a Kubernetes Secret:

```sh
test -f ./keys/human-idjag-learner-codex.crt

kubectl delete -n human secret human-idjag-learner-codex-cert --ignore-not-found=true
kubectl -n human create secret generic human-idjag-learner-codex-cert \
  --from-file=ai-client-gateway.crt=./keys/human-idjag-learner-codex.crt \
  --from-file=ai-client-gateway.key=./keys/human-idjag-learner-codex.key \
  --from-file=ca.crt=./athenz_dist/certs/ca.cert.pem
```

```sh
# secret/human-idjag-learner-codex-cert created
```

Mount the secret into the gateway pod:

```sh
kubectl patch deploy codex-idjag-learner-ai-client-gateway -n human --patch "$(cat <<'EOF'
spec:
  template:
    spec:
      containers:
        - name: ai-client-gateway
          volumeMounts:
            - name: certs
              mountPath: /app/certs
              readOnly: true
      volumes:
        - name: certs
          secret:
            secretName: human-idjag-learner-codex-cert
EOF
)"
```

```sh
# deployment.apps/codex-idjag-learner-ai-client-gateway patched
```

Wait for the new pod with the certificate mount to become available:

```sh
kubectl rollout status deployment/codex-idjag-learner-ai-client-gateway -n human --timeout=180s
```

```sh
# deployment "codex-idjag-learner-ai-client-gateway" successfully rolled out
```

Check the current container's logs to verify the gateway started successfully:

```sh
kubectl logs deploy/codex-idjag-learner-ai-client-gateway -n human -c ai-client-gateway
```

```sh
# 🚀 OpenWebUI OpenAPI Gateway listening on 0.0.0.0:3101
# 🔗 Upstream API: http://mcp.mcp:8081
# 🌍 Public Base URL: http://localhost:44444
# 🔑 Athenz ZTS Endpoint: https://athenz-zts-server.athenz:4443/zts/v1
```

<a id="deploy-the-human-gateway"></a>

## Create the Keycloak Client Secret

Configure the gateway with the Keycloak credentials it needs to drive the OAuth2 login flow.

Create the Kubernetes Secret from the Keycloak client credentials:

```sh
./tools/keycloak/create-client-k8s-secret.sh \
  "human.idjag-learner.codex" \
  "human" \
  "human-idjag-learner-codex-keycloak"
```

```sh
#   ·  Fetching Keycloak admin token...
#   ·  Looking up UUID for client human.idjag-learner.codex...
#   ·  Fetching client secret...
#   ·  Creating K8s secret human/human-idjag-learner-codex-keycloak...
# secret/human-idjag-learner-codex-keycloak created
#   ✔  Secret created: human/human-idjag-learner-codex-keycloak
```

Configure `KEYCLOAK_CLIENT_ID` and `KEYCLOAK_CLIENT_SECRET` so the gateway can authenticate to Keycloak as the registered OAuth2 client. Reference the `client-id` and `client-secret` keys in the `human-idjag-learner-codex-keycloak` Secret just created:

```sh
kubectl patch deploy codex-idjag-learner-ai-client-gateway -n human --type=strategic --patch "$(cat <<'EOF'
spec:
  template:
    spec:
      containers:
        - name: ai-client-gateway
          env:
            - name: KEYCLOAK_CLIENT_ID
              valueFrom:
                secretKeyRef:
                  name: human-idjag-learner-codex-keycloak
                  key: client-id
            - name: KEYCLOAK_CLIENT_SECRET
              valueFrom:
                secretKeyRef:
                  name: human-idjag-learner-codex-keycloak
                  key: client-secret
EOF
)"
```

```sh
# deployment.apps/codex-idjag-learner-ai-client-gateway patched
```

<a id="set-env-vars-for-the-gateway"></a>

## Configure the Gateway

Configure the gateway one connection at a time. Each command updates only the named variables, so settings from earlier steps remain in place.

### 1. Set the MCP Server Address

First, tell the gateway where to forward MCP requests. Set `UPSTREAM_BASE_URL` to the in-cluster address of the MCP Service deployed earlier:

```sh
kubectl set env deployment/codex-idjag-learner-ai-client-gateway -n human \
  --containers=ai-client-gateway \
  UPSTREAM_BASE_URL=http://mcp.mcp:8081
```

```sh
# deployment.apps/codex-idjag-learner-ai-client-gateway env updated
```

### 2. Configure Token Issuance through Athenz

Next, configure where the gateway obtains access tokens for MCP requests. `ZTS_URL` is the Athenz ZTS endpoint for the ID token → ID-JAG → access token exchanges. `ATHENZ_ACCESS_TOKEN_AUDIENCE=mcp` specifies the recipient of the resulting access token. The ID-JAG audience remains the ZTS URL:

```sh
kubectl set env deployment/codex-idjag-learner-ai-client-gateway -n human \
  --containers=ai-client-gateway \
  ZTS_URL=https://athenz-zts-server.athenz:4443/zts/v1 \
  ATHENZ_ACCESS_TOKEN_AUDIENCE=mcp
```

```sh
# deployment.apps/codex-idjag-learner-ai-client-gateway env updated
```

### 3. Connect to the Keycloak Login Server

After the user signs in, the gateway exchanges the authorization code from Keycloak for tokens. Set `KEYCLOAK_URL` to the in-cluster address for that server-to-server request, and `KEYCLOAK_REALM` to the realm where the client was registered:

```sh
kubectl set env deployment/codex-idjag-learner-ai-client-gateway -n human \
  --containers=ai-client-gateway \
  KEYCLOAK_URL=http://keycloak.idp:8080 \
  KEYCLOAK_REALM=master
```

```sh
# deployment.apps/codex-idjag-learner-ai-client-gateway env updated
```

### 4. Set the Browser-Facing Addresses

Set the port-forwarded addresses the browser can reach. `KEYCLOAK_PUBLIC_URL` points to the Keycloak login page. `PUBLIC_BASE_URL` is the gateway address used for the `/oauth/callback` after login; the AI client also connects through this address:

```sh
_gateway_port=$(./tools/port.sh ai-client-gateway-codex)
_keycloak_port=$(./tools/port.sh keycloak)

kubectl set env deployment/codex-idjag-learner-ai-client-gateway -n human \
  --containers=ai-client-gateway \
  PUBLIC_BASE_URL="http://localhost:${_gateway_port}" \
  KEYCLOAK_PUBLIC_URL="http://localhost:${_keycloak_port}"
```

```sh
# deployment.apps/codex-idjag-learner-ai-client-gateway env updated
```

### 5. Expose and Verify the Gateway

Expose the deployment as a Service:

```sh
kubectl delete -n human svc ai-client-gateway-codex --ignore-not-found=true
kubectl expose deploy codex-idjag-learner-ai-client-gateway -n human --port 3101 --name ai-client-gateway-codex
```

```sh
# service/ai-client-gateway-codex exposed
```

Wait for the rollout to apply the gateway configuration:

```sh
kubectl rollout status deployment/codex-idjag-learner-ai-client-gateway -n human --timeout=180s
```

```sh
# deployment "codex-idjag-learner-ai-client-gateway" successfully rolled out
```

Check the current container's startup logs:

```sh
kubectl logs deploy/codex-idjag-learner-ai-client-gateway -n human -c ai-client-gateway --tail=5
```

```sh
# 🚀 OpenWebUI OpenAPI Gateway listening on 0.0.0.0:3101
# 🔗 Upstream API: http://mcp.mcp:8081
# 🌍 Public Base URL: http://localhost:44444
# 🔑 Athenz ZTS Endpoint: https://athenz-zts-server.athenz:4443/zts/v1
```

<a id="verification-prerequisite"></a>

## Sign Out of Keycloak

Before verifying, sign out of Keycloak so you start with a clean session:

```sh
_keycloak_port=$(./tools/port.sh keycloak)
./tools/open.sh "http://localhost:${_keycloak_port}/realms/master/protocol/openid-connect/logout"
```

If Keycloak asks **"Do you want to log out?"**, click **Logout** to confirm.

## Update Codex MCP Config

Point Codex at the gateway by overwriting `.codex/config.toml` and appending the provided settings. The gateway now handles the entire ID-JAG flow, so you no longer need to obtain an access token in advance and manually add it to the `Authorization` header:

```sh
_gateway_port=$(./tools/port.sh ai-client-gateway-codex)

cat > .codex/config.toml <<EOF
[mcp_servers.id-jag-the-hard-way-mcp]
enabled = true
url = "http://localhost:${_gateway_port}/mcp"
auth = "oauth"
EOF

cat .codex/settings.toml >> .codex/config.toml
```

> [!NOTE]
> Notice that there is no `Authorization` header or pre-fetched access token. The gateway handles the entire ID-JAG flow on your behalf.

## Verify

Exit the current Codex session before logging in:

```sh
/quit
```

From the project directory, run the MCP login command in your terminal:

```sh
codex mcp login id-jag-the-hard-way-mcp
```

```sh
# Authorize `id-jag-the-hard-way-mcp` by opening this URL in your browser:
# http://localhost:44444/oauth/authorize?...
```

Open that URL in your browser and sign in with:

- username: `idjag-learner`
- password: `password`

Once you complete the login, the terminal will confirm:

```sh
# Successfully logged in to MCP server 'id-jag-the-hard-way-mcp'.
```

After login succeeds, restart Codex from the same project directory to load the updated configuration and saved login:

```sh
codex
```

In Codex, check the MCP connection status:

```sh
/mcp
```

```sh
# 🔌  MCP Tools

#   • id-jag-the-hard-way-mcp: failed (0 tools)
```

Sign-in succeeded, but the MCP connection shows `failed (0 tools)`. This is expected at this stage: the gateway tries to exchange the signed-in user's Keycloak ID token through Athenz ZTS, but `human.idjag-learner.codex` does not yet have `zts.jag_exchange` permission for the requested MCP role, so Athenz rejects the exchange.

In another terminal, inspect the last 8 lines of the AI Client Gateway log to see where the exchange failed:

```sh
kubectl logs deploy/codex-idjag-learner-ai-client-gateway -n human -c ai-client-gateway --tail=8
```

Example output:

```sh
# [Athenz ID-JAG] 🔑 Resolved ID token from bearer session (Claude Code path)
# [Athenz ID-JAG] 🔄 Attempting to exchange new ID-JAG with id-token for scope [mcp:role.mcp-accessor] ...
# [Athenz ID-JAG] 🎯 Target ZTS for ID-JAG: https://athenz-zts-server.athenz:4443/zts/v1/oauth2/token
# [2026-09-26T10:45:04.305Z] Proxy request failed: Error: Athenz ZTS Error: HTTP 403 - {"code":403,"message":"Principal not authorized for token exchange for the requested role"}
#     at IncomingMessage.<anonymous> (file:///app/src/utils/idtokenIntoIdjag.js:63:18)
#     at IncomingMessage.emit (node:events:531:35)
#     at endReadableNT (node:internal/streams/readable:1698:12)
#     at process.processTicksAndRejections (node:internal/process/task_queues:89:21)
```

The log shows how far the request progressed:

- `Resolved ID token from bearer session`: the gateway found the signed-in user's ID token in its session. The `(Claude Code path)` label comes from the shared Bearer-session handler that Codex also uses
- `scope [mcp:role.mcp-accessor]`: the gateway requested an ID-JAG for the MCP role from the ZTS `/oauth2/token` endpoint
- `HTTP 403` and `Principal not authorized for token exchange for the requested role`: ZTS denied the gateway's exchange request. In addition to the user's role membership, the gateway needs `zts.jag_exchange` permission for that role

<a id="whats-next"></a>

## Next Steps

Sign-in succeeds, but Athenz rejects the gateway's ID-JAG request. In the next chapter, you will grant the gateway the required exchange permissions and retry the document request.

Next: [ID-JAG](./15-id-jag.md)
