|                   Previous                   |    Current      |                   Next                   |
|:--------------------------------------------:|:---------------:|:----------------------------------------:|
| [AI Agent](./10-ai-agent.md) | **Claude Code** | [Token Exchange](./11-token-exchange.md) |

# Claude Code

In this tutorial, you will connect **Claude Code** to the MCP server as your AI client, driven from your local terminal.

<!-- TOC depthFrom:2 depthTo:2 -->

- [Add the MCP Server to Claude Code](#add-the-mcp-server-to-claude-code)
- [Open Claude](#open-claude)
- [Authenticate](#authenticate)
- [Verify](#verify)
- [What's happened?](#whats-happened)

<!-- /TOC -->

## Add the MCP Server to Claude Code

Create a `.mcp.json` at the root of this project:

```sh
_gateway_port=$(./tools/port.sh ai-client-gateway)

cat > .mcp.json <<EOF
{
  "mcpServers": {
    "id-jag-the-hard-way-mcp": {
      "type": "http",
      "url": "http://localhost:${_gateway_port}/mcp"
    }
  }
}
EOF
```

## Open Claude

```sh
claude
```

![17_open_claude](./assets/17_open_claude.png)

## Authenticate

Start (or restart) Claude Code in this directory. It will attempt to connect to the MCP server, receive a `401`, discover the OAuth2 metadata endpoint, and automatically open your browser to Keycloak.

Sign in as `idjag-learner` (the user created in Tutorial 13). After login, Keycloak redirects to the gateway's `/oauth/callback`, which stores your ID token in a server-side session and sends an authorization code back to Claude Code. Claude Code exchanges it for a bearer token and is ready.

You only need to do this once per session. The session stays valid until your Keycloak ID token expires.

## Verify

Ask Claude Code:

```
get docs!
```

It should call the `get_api_docs` tool and return the document list. Check the gateway logs to see the ID-JAG chain:

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

Claude Code drove the exact same authorization chain as Open WebUI. The only differences are where the identity token comes from (OAuth2 bearer session vs. cookie) and which Athenz service identity signs the exchange (`human.claude-cli` vs. `ai.open-webui`).

The human identity of `idjag-learner` is preserved at every hop. Each component held only the minimum permissions it needed — least privilege all the way through.

Next: [Token Exchange](./11-token-exchange.md)
