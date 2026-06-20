|             Previous              |   Current    | Next |
|:---------------------------------:|:------------:|:----:|
| [ID-JAG](./16-id-jag.md) | **Claude Code** | *None* |

# Claude Code

In this tutorial, you will connect **Claude Code** directly to the MCP server through the AI Client Gateway — the same identity-delegating chain you just validated with Open WebUI — but now triggered from your terminal.

<!-- TOC depthFrom:2 depthTo:2 -->

- [How It Works](#how-it-works)
- [Register a Keycloak Client for Claude Code](#register-a-keycloak-client-for-claude-code)
- [Update the AI Client Gateway Configuration](#update-the-ai-client-gateway-configuration)
- [Grant Athenz Permissions to `ai.claude-code`](#grant-athenz-permissions-to-aiclaudeCode)
- [Add the MCP Server to Claude Code](#add-the-mcp-server-to-claude-code)
- [Authenticate](#authenticate)
- [Verify](#verify)
- [What's happened?](#whats-happened)

<!-- /TOC -->

## How It Works

Claude Code supports OAuth2-protected MCP servers out of the box. When it first connects to an MCP server that returns `401 Unauthorized`, it reads the `WWW-Authenticate` header, discovers the gateway's OAuth2 metadata document, and opens your browser to start a login flow.

The gateway acts as a thin OAuth2 Authorization Server that delegates the actual login to your existing Keycloak deployment. Once you log in, the gateway stores your Keycloak ID token in a server-side session. Every subsequent MCP request carries that session token as a `Bearer` header, and the gateway performs the exact same ID-JAG token exchange chain as before.

```
Claude Code  →  AI Client Gateway (OAuth2 AS + proxy)
                  ↓ Bearer session token
                  resolves ID token (from session)
                  ↓ ID token
                  Athenz ZTS  →  ID-JAG token
                  ↓ ID-JAG
                  Athenz ZTS  →  Access Token (scoped)
                  ↓ AT
                MCP Auth Proxy  →  MCP Server  →  API Server
```

## Register a Keycloak Client for Claude Code

The gateway needs a dedicated Keycloak client so it can redirect Claude Code's login to Keycloak and receive a callback.

Open Keycloak admin UI:

```sh
_keycloak_port=$(./tools/port.sh keycloak)
./tools/open.sh "http://localhost:${_keycloak_port}/admin/master/console/#/master/clients"
```

Create a new client:

- **Client ID**: `claude-code`
- **Client authentication**: Off (public client)
- **Standard flow**: Enabled
- **Valid redirect URIs**: `http://localhost:44443/oauth/callback`
- **Web origins**: `http://localhost:44443`

> [!NOTE]
> The redirect URI must exactly match `PUBLIC_BASE_URL/oauth/callback` of the gateway. If you changed the default AI Client Gateway port (`44443`) via `config.local.yaml`, update the URI accordingly.

## Update the AI Client Gateway Configuration

The gateway reads three environment variables for the OAuth2 / Keycloak integration:

| Variable | Default | Meaning |
|---|---|---|
| `KEYCLOAK_URL` | `http://localhost:34443` | Base URL of your Keycloak instance |
| `KEYCLOAK_REALM` | `master` | Realm that holds the `claude-code` client |
| `KEYCLOAK_CLIENT_ID` | `claude-code` | Client ID registered above |

Patch the running gateway deployment so it knows where Keycloak lives:

```sh
_keycloak_port=$(./tools/port.sh keycloak)

kubectl patch deploy ai-client-gateway -n human --patch "$(cat <<EOF
spec:
  template:
    spec:
      containers:
        - name: ai-client-gateway
          env:
            - name: KEYCLOAK_URL
              value: "http://keycloak.idp:8080"
            - name: KEYCLOAK_REALM
              value: "master"
            - name: KEYCLOAK_CLIENT_ID
              value: "claude-code"
EOF
)"
```

> [!NOTE]
> The gateway uses `keycloak.idp:8080` (in-cluster address) because the token exchange in the callback happens server-side. The browser redirect to Keycloak uses `PUBLIC_BASE_URL`, which the gateway passes through from its own env — your local port-forward handles the rest.

Verify the gateway restarted cleanly:

```sh
kubectl logs deploy/ai-client-gateway -n human --tail=5
```

## Grant Athenz Permissions to `ai.claude-code`

Just like `ai.open-webui` needed `zts.jag_exchange` rights in Tutorial 16, the Claude Code gateway service identity needs the same permissions.

Generate a key pair and register a service identity for `ai.claude-code`:

```sh
mkdir -p ./claude_code_gateway/certs
./tools/athenz/create-private-key.sh "./claude_code_gateway/certs/claude-code"
./tools/athenz/create-service.sh "ai" "claude-code" "./claude_code_gateway/certs/claude-code.public.key"
./tools/athenz/enable-cert-provider.sh "ai" "claude-code"
./tools/athenz/fetch-cert.sh "ai" "claude-code" "./claude_code_gateway/certs/claude-code.key" "v1"
```

> [!NOTE]
> This reuses the `ai` TLD created in Tutorial 15. If it doesn't exist yet, run `./tools/athenz/create-tld.sh "ai"` first.

Add `ai.claude-code` to the existing `token-exchangable-ai-agents` role created in Tutorial 16:

```sh
./tools/athenz/add-role-member.sh "api" "token-exchangable-ai-agents" "ai.claude-code"
```

> [!NOTE]
> The `token-exchangable-ai-agents` role already carries the `zts.jag_exchange` policies for `role.docs-getter` and `role.mcp-accessor` from Tutorial 16. Adding `ai.claude-code` as a member grants it those same permissions immediately.

### Mount the certificate into the gateway

Create a Kubernetes secret for the new certificate and mount it alongside the existing `open-webui` cert. The gateway reads `certs/open-webui.crt` at startup — that file still represents the service identity used for Athenz token exchanges. The `claude-code` cert is only needed to have its public key registered in Athenz; the gateway itself continues to authenticate to ZTS as `ai.open-webui`.

> [!NOTE]
> If you prefer a cleaner separation and want the gateway to authenticate as `ai.claude-code` instead of `ai.open-webui`, update `CERT_PATH` / `KEY_PATH` in `ai_client_gateway/src/utils/idtokenIntoIdjag.js` and `athenzAt.ts` to point to the new cert, rebuild the image, and update the K8s secret accordingly. For this tutorial we keep the existing cert.

## Add the MCP Server to Claude Code

Create a project-level MCP configuration file at the root of any project where you want access to the MCP tools:

```sh
_gateway_port=$(./tools/port.sh ai-client-gateway)

cat > .mcp.json <<EOF
{
  "mcpServers": {
    "id-jag-mcp": {
      "type": "http",
      "url": "http://localhost:${_gateway_port}/mcp"
    }
  }
}
EOF
```

Or add it to your global Claude Code settings if you want it always available:

```sh
_gateway_port=$(./tools/port.sh ai-client-gateway)
echo "Add this to your ~/.claude.json under \"mcpServers\":"
echo "  \"id-jag-mcp\": { \"type\": \"http\", \"url\": \"http://localhost:${_gateway_port}/mcp\" }"
```

## Authenticate

Start (or restart) Claude Code in the project directory. Claude Code will attempt to list MCP tools, receive a `401`, discover the OAuth2 metadata endpoint, and automatically open your browser.

You will be redirected to Keycloak's login page. Sign in as `idjag-learner` (the user created in Tutorial 13):

- **Username**: `idjag-learner`
- **Password**: whatever you set in Tutorial 13

After successful login, Keycloak redirects to the gateway's `/oauth/callback`, which stores your ID token in a server-side session and redirects your browser back to Claude Code with an authorization code. Claude Code exchanges it for a bearer token and is now fully authenticated.

You only need to do this once per session. The session remains valid as long as your Keycloak ID token has not expired.

## Verify

In Claude Code, ask it to use the MCP tool:

```
get docs!
```

You should see it call the `get_api_docs` tool and return the list of documents. In the gateway logs, you will see the full ID-JAG exchange chain:

```sh
kubectl logs deploy/ai-client-gateway -n human -f
```

```
[Athenz ID-JAG] 🔑 Resolved ID token from bearer session (Claude Code path)
[Athenz ID-JAG] 🔄 Attempting to exchange new ID-JAG with id-token for scope [api:role.mcp-accessor api:role.docs-getter] ...
[Athenz ID-JAG] 💾 Successfully exchanged and cached ID-JAG for scope [...]
[Athenz AT] Fetching Athenz Access Token using ID-JAG ...
[Athenz AT] 🔑 Successfully fetched Athenz Access Token.
```

## What's happened?

Claude Code used the exact same authorization chain as Open WebUI — the only difference is how the ID token arrived at the gateway. Open WebUI injects it as a cookie; Claude Code obtains it via the OAuth2 authorization_code flow and sends it as a `Bearer` token. The gateway translates both into an Athenz Access Token before the request ever reaches the MCP server.

The human identity of `idjag-learner` is preserved through every hop, and every component operated with least-privilege permissions scoped to exactly what it needed.
