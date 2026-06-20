|                    Previous                    |  Current   |  Next  |
|:----------------------------------------------:|:----------:|:------:|
| [AI Client Gateway](./15-ai-client-gateway.md) | **ID-JAG** | *None* |

# ID-JAG

In this tutorial, we will deploy the human-side AI Client Gateway for Claude Code, configure the proper token exchange policies in Athenz, and execute the end-to-end prompt to confirm the full integration works.

<!-- TOC depthFrom:2 depthTo:2 -->

- [How It Works](#how-it-works)
- [Why a Separate Gateway in `human`?](#why-a-separate-gateway-in-human)
- [Register a Keycloak Client](#register-a-keycloak-client)
- [Create the `human.claude-cli` Service Identity](#create-the-humanclaude-cli-service-identity)
- [Deploy the Human Gateway](#deploy-the-human-gateway)
- [Grant Permissions to `ai.open-webui` and `human.claude-cli`](#grant-permissions-to-aiopen-webui-and-humanclaude-cli)
- [Verify](#verify)
- [What's happened?](#whats-happened)
- [Finally](#finally)

<!-- /TOC -->

## How It Works

Claude Code supports OAuth2-protected MCP servers out of the box. When it first connects to an MCP server that returns `401 Unauthorized`, it reads the `WWW-Authenticate` header, discovers the gateway's OAuth2 metadata document, and opens your browser to start a login flow.

The gateway acts as a thin OAuth2 Authorization Server that delegates the actual login to your existing Keycloak deployment. Once you log in, the gateway stores your Keycloak ID token in a server-side session. Every subsequent MCP request carries that session token as a `Bearer` header, and the gateway performs the exact same ID-JAG token exchange chain as before.

```
[human ns]                       [ai ns]          [api ns]
Claude Code
    │ Bearer (session token)
    ▼
human ai-client-gateway          ai ai-client-gateway (Open WebUI)
    │ resolves ID token
    │ → ID-JAG exchange (as human.claude-cli)
    │ → Athenz AT
    ▼
                              MCP Auth Proxy → MCP Server → API Server
```

## Why a Separate Gateway in `human`?

The gateway deployed in Tutorial 15 lives in the `ai` namespace alongside Open WebUI. It authenticates to Athenz as `ai.open-webui`.

Claude Code is a **local, human-controlled tool**. Its gateway instance belongs in the `human` namespace and authenticates to Athenz as `human.claude-cli`. This is the correct boundary:

| Namespace | Gateway serves                 | Athenz identity    |
|-----------|--------------------------------|--------------------|
| `ai`      | Open WebUI (remote AI client)  | `ai.open-webui`    |
| `human`   | Claude Code (local human tool) | `human.claude-cli` |

Both gateways talk to the same MCP server and the same Athenz ZTS. They differ only in which Athenz identity signs the ID-JAG exchange.

## Register a Keycloak Client

The gateway needs a Keycloak client to redirect the login and receive the callback.

Open Keycloak admin UI:

```sh
_keycloak_port=$(./tools/port.sh keycloak)
./tools/open.sh "http://localhost:${_keycloak_port}/admin/master/console/#/master/clients"
```

Create a new client:

- **Client ID**: `human.claude-cli`
- **Client authentication**: On (confidential client)
- **Standard flow**: Enabled
- **Valid redirect URIs**: `http://localhost:44443/oauth/callback`
- **Web origins**: `http://localhost:44443`

> [!NOTE]
> The redirect URI must exactly match `PUBLIC_BASE_URL/oauth/callback` of the human gateway. Port `44443` is the default from `tools/config.yaml`. If you changed it via `config.local.yaml`, update the URI accordingly.

After saving, open the **Credentials** tab and copy the **Client secret** — you will need it in the deployment step below.

## Create the `human.claude-cli` Service Identity

```sh
./tools/athenz/create-tld.sh "human"
./tools/athenz/create-private-key.sh "./keys/human-claude-cli"
./tools/athenz/create-service.sh "human" "claude-cli" "./keys/human-claude-cli.public.key"
./tools/athenz/enable-cert-provider.sh "human" "claude-cli"
sleep 2
./tools/athenz/fetch-cert.sh "human" "claude-cli" "./keys/human-claude-cli.key" "v1"
```

```sh
# Generating RSA key pair for: ./keys/human-claude-cli...
# Done! Keys generated: ./keys/human-claude-cli.key, ./keys/human-claude-cli.public.key
# Registering Service: human.claude-cli...
# [Template(s) successfully applied to domain]
# Fetching X.509 Certificate for human.claude-cli...
# Done! Certificate saved to: ./keys/human-claude-cli.crt
```

*sleep has been included for Athenz to sync.*

## Deploy the Human Gateway

Create the `human` namespace:

```sh
kubectl create ns human
```

Store the certificates as a Kubernetes secret:

```sh
kubectl -n human create secret generic human-claude-cli-cert \
  --from-file=open-webui.crt=./keys/human-claude-cli.crt \
  --from-file=open-webui.key=./keys/human-claude-cli.key \
  --from-file=ca.crt=./athenz_dist/certs/ca.cert.pem
```

> [!NOTE]
> The gateway reads cert files at the paths `certs/human-claude-cli.crt`, `certs/human-claude-cli.key`, and `certs/ca.crt` — the filenames are fixed in the source. The secret keys use those names so the mount matches.

Store the Keycloak client credentials (from the **Credentials** tab of the `human.claude-cli` client):

```sh
_client_secret="🟡TODO: Put your client secret here"

kubectl -n human create secret generic human-claude-cli-keycloak \
  --from-literal=client-id="human.claude-cli" \
  --from-literal=client-secret="${_client_secret}"
```

Deploy the gateway:

```sh
kubectl create deploy ai-client-gateway -n human \
  --image=ghcr.io/mlajkim/ai-client-gateway:latest
```

Mount the certificates:

```sh
kubectl patch deploy ai-client-gateway -n human --patch "$(cat <<'EOF'
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
            secretName: human-claude-cli-cert
EOF
)"
```

Configure environment variables:

```sh
_gateway_port=$(./tools/port.sh ai-client-gateway)
_keycloak_port=$(./tools/port.sh keycloak)

kubectl patch deploy ai-client-gateway -n human --patch "$(cat <<EOF
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
            - name: KEYCLOAK_URL
              value: "http://keycloak.idp:8080"
            - name: KEYCLOAK_REALM
              value: "master"
            - name: KEYCLOAK_CLIENT_ID
              valueFrom:
                secretKeyRef:
                  name: human-claude-cli-keycloak
                  key: client-id
            - name: KEYCLOAK_CLIENT_SECRET
              valueFrom:
                secretKeyRef:
                  name: human-claude-cli-keycloak
                  key: client-secret
            - name: PUBLIC_BASE_URL
              value: "http://localhost:${_gateway_port}"
            - name: KEYCLOAK_PUBLIC_URL
              value: "http://localhost:${_keycloak_port}"
EOF
)"
```

> [!NOTE]
> `KEYCLOAK_URL` uses the in-cluster address `keycloak.idp:8080` because the server-side token exchange in the OAuth callback runs inside the cluster. `KEYCLOAK_PUBLIC_URL` uses the port-forwarded address because the browser's login redirect must be reachable from your local machine. If you're following port-forward defaults, `34443` is the Keycloak port.

Expose and verify:

```sh
kubectl expose deploy ai-client-gateway -n human --port 3101 --name ai-client-gateway
kubectl logs deploy/ai-client-gateway -n human --tail=5
```

```sh
# 🚀 OpenWebUI OpenAPI Gateway listening on 0.0.0.0:3101
# 🔗 Upstream API: http://mcp.api:8081
# 🌍 Public Base URL: http://localhost:44443
# 🔑 Athenz ZTS Endpoint: https://athenz-zts-server.athenz:4443/zts/v1
```

## Grant Permissions to `ai.open-webui` and `human.claude-cli`

Because these agents act on behalf of users, we need to explicitly authorize them to exchange the login ID Token for an ID-JAG token, and to access the necessary resources in the `api` domain.

First, create a role under domain `api`:

```sh
./tools/athenz/create-role.sh "api" "token-exchangable-ai-agents"
```

In Athenz, you must allow the `zts.jag_exchange` action on the target roles. Attach the policy for `role.docs-getter`:

```sh
./tools/athenz/add-policy.sh "api" "token-exchangable-ai-agents" "zts.jag_exchange" "role.docs-getter"
```

```sh
# Creating Policy: api:policy.zts.jag_exchange...
```

Also allow exchange into `api:role.mcp-accessor`:

```sh
./tools/athenz/add-policy.sh "api" "token-exchangable-ai-agents" "zts.jag_exchange" "role.mcp-accessor"
```

Add both agents as members:

```sh
./tools/athenz/add-role-member.sh "api" "token-exchangable-ai-agents" "ai.open-webui"
./tools/athenz/add-role-member.sh "api" "token-exchangable-ai-agents" "human.claude-cli"
```

```sh
# Adding Member ai.open-webui to Role: api:role.token-exchangable-ai-agents...
# Adding Member human.claude-cli to Role: api:role.token-exchangable-ai-agents...
```

> [!NOTE]
> Neither agent needs direct permission to fetch an Access Token against `api:role.docs-getter` or `api:role.mcp-accessor`. They only need `zts.jag_exchange` to perform the exchange on the user's behalf.

## Verify

Follow the steps below to verify the setup.

Now, return to the AI Agent and test the exact same prompt that failed previously:

```
get docs!
```

![16_successful_attrival_from_server](./assets/16_successful_attrival_from_server.png)

## What's happened?

Congratulations! 🎉 You have completed the full ID-JAG tutorial.

Here is a brief overview of how it all worked:

1. You signed in to the AI client as `idjag-learner` via Keycloak, which issued an **ID Token**.
2. The **AI Client Gateway** intercepted the request and exchanged the ID Token for an **ID-JAG token** via Athenz ZTS.
3. Athenz ZTS validated the token against the `token-exchangable-ai-agents` role and issued a scoped **Access Token**.
4. The gateway forwarded the request to the **MCP Server** with the Access Token attached.
5. The **MCP Authorization Proxy** validated the token and forwarded it to the MCP Server.
6. The MCP Server performed its own token exchange to call the **API Server**, which returned the data.

At every hop, the Principle of Least Privilege was enforced — each component only held the minimum permissions it needed.

![16_arc_get_docs_through_id_jag](./assets/16_arc_get_docs_through_id_jag.png)

## Finally

Thank you for following along. Hope it was helpful.

If you found this tutorial helpful, please consider giving the repository a ⭐ on GitHub!

[![GitHub Stars](https://img.shields.io/github/stars/mlajkim/id-jag-the-hard-way?style=social)](https://github.com/mlajkim/id-jag-the-hard-way)

If you run into any issues or have questions, feel free to [open an issue](https://github.com/mlajkim/id-jag-the-hard-way/issues).
