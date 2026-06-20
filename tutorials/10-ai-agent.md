|                     Previous                     |   Current    |                   Next                   |
|:------------------------------------------------:|:------------:|:----------------------------------------:|
| [MCP Server for API](./09-mcp-server-for-api.md) | **AI Agent** | [Token Exchange](./11-token-exchange.md) |

# AI Agent

In this tutorial, we connect an AI agent to the MCP server for the first time. We will manually provide an Athenz Access Token as a Bearer header and see how far we get.

<!-- TOC depthFrom:2 depthTo:2 -->

- [Install Claude](#install-claude)
- [Login to Claude](#login-to-claude)
- [Add the MCP Server to Claude Code](#add-the-mcp-server-to-claude-code)
- [Get Access Token & Attach](#get-access-token--attach)
- [Reload and Open Claude](#reload-and-open-claude)
- [Verify](#verify)
- [What's happened?](#whats-happened)

<!-- /TOC -->

> [!NOTE]
> `Claude Code` is the default client for this tutorial path. If you prefer a different client, see the alternatives:
> - [Open WebUI](./open_webui/10-ai-agent.md)

## Install Claude

> [!NOTE]
> Official Claude installation guide: [Claude Code Quickstart](https://code.claude.com/docs/en/quickstart#native-install-recommended)

![10_install_calude_app](./assets/10_install_calude_app.png)

Check if Claude is already installed:

```sh
claude --version
```

If you don't see a version (e.g. `2.1.177 (Claude Code)`), install it:

macOS / Linux / WSL:

```sh
curl -fsSL https://claude.ai/install.sh | bash
```

Windows PowerShell:

```sh
irm https://claude.ai/install.ps1 | iex
```

Windows CMD:

```sh
curl -fsSL https://claude.ai/install.cmd -o install.cmd && install.cmd && del install.cmd
```

## Login to Claude

Run the following and follow the prompts:

```sh
claude
```

If it is your first time, choose `2. Anthropic Console account`. You can create an account or use **Continue with Google** for a faster sign-up.

## Add the MCP Server to Claude Code

Create a `.mcp.json` at the root of this project (no auth yet):

```sh
_mcp_port=$(./tools/port.sh mcp)

cat > .mcp.json <<EOF
{
  "mcpServers": {
    "id-jag-the-hard-way-mcp": {
      "type": "http",
      "url": "http://localhost:${_mcp_port}/mcp"
    }
  }
}
EOF
```

Inside Claude Code, type `/mcp` to check the MCP server status.

🟡 TODO: put image about the `/mcp` command showing the server with no permission / not connected

You will see that the MCP server has no tools loaded — this is expected because the MCP server requires an Authorization header, which we have not provided yet.

## Get Access Token & Attach

Fetch an Athenz Access Token for the `docs-getter` scope:

```sh
_scope="api:role.docs-getter"
./tools/athenz/fetch-access-token.sh \
  "./athenz_dist/certs/athenz_admin.cert.pem" \
  "./athenz_dist/keys/athenz_admin.private.pem" \
  "${_scope}" \
  "./keys/api_docs-getter.jwt"

cat "./keys/api_docs-getter.jwt"
```

Now re-create `.mcp.json` with the token attached as a Bearer header:

```sh
_mcp_port=$(./tools/port.sh mcp)

cat > .mcp.json <<EOF
{
  "mcpServers": {
    "id-jag-the-hard-way-mcp": {
      "type": "http",
      "url": "http://localhost:${_mcp_port}/mcp",
      "headers": {
        "Authorization": "Bearer $(cat ./keys/api_docs-getter.jwt)"
      }
    }
  }
}
EOF
```

## Reload and Open Claude

Run `/mcp` inside Claude Code to reload the configuration. You should now see the tools registered from the MCP server.

🟡 TODO: put image about `/mcp` showing the MCP server connected with tools listed

Open Claude in this directory if it is not already running:

```sh
claude
```

🟡 TODO: put image about the Claude Code terminal with the project open

## Verify

Ask Claude the following:

```
get docs!
```

🟡 TODO: put image about Claude Code calling the tool and returning an error about token exchange

The request will fail with an error similar to:

```
Principal not authorized for token exchange
```

This is expected. The MCP server received your Access Token and tried to exchange it for a narrower-scoped token to call the API server — but it does not yet have permission to do that.

## What's happened?

We successfully connected Claude Code to the MCP server with an Athenz Access Token. However, the MCP server's token exchange step is not yet authorized:

🟡 TODO: put image about the architecture diagram showing the token exchange failure (similar to 10_arc_failed_to_token_exchange.png)

In the next tutorial we will fix this by granting the MCP server permission to exchange tokens.

Next: [Token Exchange](./11-token-exchange.md)
