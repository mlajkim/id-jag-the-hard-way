|                            Previous                            |        Current        |           Next           |
|:--------------------------------------------------------------:|:---------------------:|:------------------------:|
| [Trusted Identity Provider](./14-trusted-identity-provider.md) | **AI Client Gateway** | [ID-JAG](./16-id-jag.md) |

# AI Client Gateway

In this tutorial, we will deploy the `AI Client Gateway`. This component sits between the AI client and the MCP server. It intercepts requests, resolves the user's Keycloak ID token, and performs the ID-JAG token exchange chain so that neither the AI client nor the user ever has to manage Athenz tokens manually.

<!-- TOC depthFrom:2 depthTo:2 -->

- [Understand What the Gateway Does](#understand-what-the-gateway-does)
- [Deploy AI Client Gateway in K8s](#deploy-ai-client-gateway-in-k8s)
- [Generate the Required Certificates](#generate-the-required-certificates)
- [Mount the Certificates](#mount-the-certificates)
- [Configure Keycloak for Open WebUI](#configure-keycloak-for-open-webui)
- [Sign in as idjag-learner](#sign-in-as-idjag-learner)
- [Accept the Account](#accept-the-account)
- [Modify the Tool Target](#modify-the-tool-target)
- [Verify](#verify)
- [What's happened?](#whats-happened)
- [What's next?](#whats-next)

<!-- /TOC -->

## Understand What the Gateway Does

When you log into Open WebUI via Keycloak, Open WebUI receives an ID Token representing your identity. The AI Client Gateway uses that ID Token to:

1. Exchange it for an ID-JAG token scoped to the `ai.open-webui` audience.
2. Fetch an Athenz Access Token (scoped to the required API roles) using that ID-JAG token.
3. Inject the Athenz Access Token into the upstream request to the MCP server.

This means tools can be shared across all users with no manual token management.

## Deploy AI Client Gateway in K8s

The gateway belongs in the `ai` namespace alongside Open WebUI.

Deploy it:

```sh
kubectl create deploy ai-client-gateway -n ai \
  --image=ghcr.io/mlajkim/ai-client-gateway:latest
```

Configure the upstream and ZTS URL:

```sh
kubectl patch deploy ai-client-gateway -n ai --patch "$(cat <<'EOF'
spec:
  template:
    spec:
      containers:
        - name: ai-client-gateway
          imagePullPolicy: Always
          env:
            - name: UPSTREAM_BASE_URL
              value: "http://mcp.api:8081"
            - name: ZTS_URL
              value: "https://athenz-zts-server.athenz:4443/zts/v1"
EOF
)"
```

Expose the deployment:

```sh
kubectl expose deploy ai-client-gateway -n ai --port 3101 --name ai-client-gateway
```

Check the logs — you will see an error about missing certificates:

```sh
kubectl logs deploy/ai-client-gateway -n ai
```

```sh
# Error: ENOENT: no such file or directory, open '/app/certs/open-webui.crt'
```

This is expected — we need to generate and mount the certificates next.

## Generate the Required Certificates

The gateway authenticates to Athenz ZTS using an X.509 certificate for the `ai.open-webui` service identity.

Generate the RSA key pair:

```sh
mkdir -p ./ai_client_gateway/certs
./tools/athenz/create-private-key.sh "./ai_client_gateway/certs/open-webui"
```

```sh
# Generating RSA key pair for: ./ai_client_gateway/certs/open-webui...
# Done! Keys generated: ./ai_client_gateway/certs/open-webui.key, ./ai_client_gateway/certs/open-webui.public.key
```

Create the `ai` top-level domain:

```sh
./tools/athenz/create-tld.sh "ai"
```

Register the `open-webui` service under `ai`:

```sh
./tools/athenz/create-service.sh "ai" "open-webui" "./ai_client_gateway/certs/open-webui.public.key"
./tools/athenz/enable-cert-provider.sh "ai" "open-webui"
sleep 2
./tools/athenz/fetch-cert.sh "ai" "open-webui" "./ai_client_gateway/certs/open-webui.key" "v1"
```

Copy the Athenz CA certificate:

```sh
cp ./athenz_dist/certs/ca.cert.pem ./ai_client_gateway/certs/ca.crt
```

Verify all files are present:

```sh
ls -al ./ai_client_gateway/certs/
```

```sh
# -rw-r--r--  ca.crt
# -rw-r--r--  open-webui.crt
# -rw-------  open-webui.key
# -rw-r--r--  open-webui.public.key
```

## Mount the Certificates

Create a Kubernetes secret from the certificates:

```sh
kubectl -n ai delete secret ai-client-gateway-cert --ignore-not-found
kubectl -n ai create secret generic ai-client-gateway-cert \
  --from-file=open-webui.crt=./ai_client_gateway/certs/open-webui.crt \
  --from-file=open-webui.key=./ai_client_gateway/certs/open-webui.key \
  --from-file=ca.crt=./ai_client_gateway/certs/ca.crt
```

Mount the secret into the gateway deployment:

```sh
kubectl patch deploy ai-client-gateway -n ai --patch "$(cat <<'EOF'
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
            secretName: ai-client-gateway-cert
EOF
)"
```

Verify the gateway started successfully:

```sh
kubectl logs deploy/ai-client-gateway -n ai
```

```sh
# 🚀 OpenWebUI OpenAPI Gateway listening on 0.0.0.0:3101
# 🔗 Upstream API: http://mcp.api:8081
# 🌍 Public Base URL: http://ai-client-gateway.ai:3101
# 🔑 Athenz ZTS Endpoint: https://athenz-zts-server.athenz:4443/zts/v1
```

🟡 TODO: put image about the architecture diagram with the AI Client Gateway now deployed (similar to 15_ai_client_agent_installed_and_used.png)

## Configure Keycloak for Open WebUI

Get the Keycloak client secret for `ai.open-webui` from Keycloak admin UI:

```sh
_keycloak_port=$(./tools/port.sh keycloak)
./tools/open.sh "http://localhost:${_keycloak_port}/admin/master/console/#/master/clients"
```

Navigate to `ai.open-webui` > **Credentials** > copy the **Client secret**, then:

```sh
_open_webui_secret="🟡TODO: Put your client secret here"

kubectl create secret generic keycloak-client-secret -n ai \
  --from-literal=OAUTH_CLIENT_ID="ai.open-webui" \
  --from-literal=OAUTH_CLIENT_SECRET="${_open_webui_secret}"
```

Patch Open WebUI to use Keycloak for login:

```sh
_open_webui_port=$(./tools/port.sh open-webui)
_keycloak_port=$(./tools/port.sh keycloak)

kubectl patch deploy open-webui -n ai --patch "$(cat <<EOF
spec:
  template:
    spec:
      containers:
        - name: open-webui
          env:
            - name: ENABLE_OAUTH_SIGNUP
              value: "true"
            - name: OAUTH_CLIENT_ID
              valueFrom:
                secretKeyRef:
                  name: keycloak-client-secret
                  key: OAUTH_CLIENT_ID
            - name: OAUTH_CLIENT_SECRET
              valueFrom:
                secretKeyRef:
                  name: keycloak-client-secret
                  key: OAUTH_CLIENT_SECRET
            - name: OPENID_PROVIDER_URL
              value: "http://keycloak.idp:8080/realms/master/.well-known/openid-configuration"
            - name: OAUTH_PROVIDER_NAME
              value: "Keycloak"
            - name: OAUTH_SCOPES
              value: "openid email profile"
            - name: OPENID_REDIRECT_URI
              value: "http://localhost:${_open_webui_port}/oauth/oidc/callback"
        - name: keycloak-proxy
          image: alpine/socat
          command: ["socat"]
          args: ["tcp-listen:${_keycloak_port},fork,reuseaddr", "tcp-connect:keycloak.idp:8080"]
EOF
)"
```

> [!NOTE]
> `OPENID_PROVIDER_URL` uses the in-cluster address `keycloak.idp:8080` because the server-side OIDC flow runs inside the cluster. The `keycloak-proxy` sidecar forwards the browser's redirect (which uses `localhost:34443`) into the cluster.

Wait for the rollout:

```sh
kubectl rollout status deploy/open-webui -n ai
```

## Sign in as idjag-learner

Open Open WebUI in an incognito window:

```sh
_open_webui_port=$(./tools/port.sh open-webui)
./tools/open.sh "http://localhost:${_open_webui_port}" incognito=true
```

You should see a **Continue with Keycloak** button on the login page.

🟡 TODO: put image about the Open WebUI login page with the "Continue with Keycloak" button (similar to 13_continue_with_keycloak_appeared.png)

Click it and sign in with:

- **Username**: `idjag-learner`
- **Password**: `password`

🟡 TODO: put image about the successful Keycloak login screen (similar to 13_login_successful_as_idjag_learner.png)

## Accept the Account

Return to your admin browser and navigate to the users overview:

```sh
_open_webui_port=$(./tools/port.sh open-webui)
./tools/open.sh "http://localhost:${_open_webui_port}/admin/users/overview"
```

🟡 TODO: put image about the pending idjag-learner user in the admin panel (similar to 13_pending_user_id_jag_learner_added.png)

Click **Edit User** for `idjag-learner`, change the status from `Pending` to `User`, and click **Save**.

🟡 TODO: put image about changing the status from Pending to User (similar to 13_change_pending_to_user.png)

## Modify the Tool Target

Log in as admin in Open WebUI and navigate to:

`User Icon` > `Admin Panel` > `Settings` > `Integrations`

Click the configure icon for the API MCP Server and change:

- **URL**: `http://ai-client-gateway.ai:3101`
- **Auth**: `OAuth`

🟡 TODO: put image about the Open WebUI tool settings showing the gateway URL and OAuth auth type (similar to 15_edit_connection_of_tool.png)

## Verify

Switch back to the `idjag-learner` incognito window and refresh if needed:

```sh
_open_webui_port=$(./tools/port.sh open-webui)
./tools/open.sh "http://localhost:${_open_webui_port}" incognito=true
```

🟡 TODO: put image about the idjag-learner successfully logged into Open WebUI (similar to 15_logged_in_as_idjag_learner.png)

Ask the AI Agent:

```
Get docs!
```

🟡 TODO: put image about the request failing with a permission error (similar to 15_deliberate_failure_to_get_without_permission.png)

The request will fail. This is expected and intentional.

## What's happened?

The gateway (`ai.open-webui`) does not yet have permission in Athenz to exchange the Keycloak ID Token for an ID-JAG token:

🟡 TODO: put image about the architecture diagram showing the gateway blocked at the ID-JAG exchange step (similar to 15_arc_not_enough_permission_into_idjag.png)

The certificate exists, but no Athenz policy grants `ai.open-webui` the right to perform the exchange. We will fix this in the next tutorial.

## What's next?

In the next tutorial, we will grant `ai.open-webui` the necessary Athenz permissions to perform the full ID-JAG exchange and complete the end-to-end authorization chain.

Next: [ID-JAG](./16-id-jag.md)
