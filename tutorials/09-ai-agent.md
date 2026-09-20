|                     Previous                     |   Current    |                   Next                   |
|:------------------------------------------------:|:------------:|:----------------------------------------:|
| [MCP Server for Resource Server](./08-mcp-server-for-resource-server.md) | **AI agent** | [Protect MCP Server](./10-protect-mcp-server.md) |

# AI Agent: Claude

![10_claude](./assets/10_claude.png)

Connect Claude Code to the MCP server and retrieve documents using the learner's API access token.

<!-- TOC depthFrom:2 depthTo:2 -->

- [Install Claude](#install-claude)
- [Add the MCP Server to Claude Code](#add-the-mcp-server-to-claude-code)
- [Sign In to Claude](#sign-in-to-claude)
- [Connect to the MCP Server](#connect-to-the-mcp-server)
- [Verify](#verify)
- [Verify Working](#verify-working)
- [Understand the Result](#understand-the-result)
- [Next Steps](#next-steps)

<!-- /TOC -->

> [!NOTE]
> `Claude Code` is the default client for this tutorial path. If you prefer a different client, see the alternatives:
> - [Codex](./codex/09-ai-agent.md)
> - [Open WebUI](./open_webui/09-ai-agent.md)


## Install Claude

Check if Claude is already installed:

```sh
claude --version
```

```sh
# X.X.XXX (Claude Code)
```

If you don't see a version (e.g. `X.X.XXX (Claude Code)`), install it:

| Platform            | Command                                                                                     |
|:--------------------|:--------------------------------------------------------------------------------------------|
| macOS / Linux / WSL | ```curl -fsSL https://claude.ai/install.sh \| bash```                                       |
| Windows PowerShell  | `irm https://claude.ai/install.ps1 \| iex`                                                  |
| Windows CMD         | `curl -fsSL https://claude.ai/install.cmd -o install.cmd && install.cmd && del install.cmd` |

> [!NOTE]
> Official Claude installation guide: [Claude Code Quickstart](https://code.claude.com/docs/en/quickstart#native-install-recommended)
> ![10_install_calude_app](./assets/10_install_calude_app.png)

## Add the MCP Server to Claude Code

Create `.mcp.json` before launching Claude Code so it can load the MCP server configuration.

> [!NOTE]
> The MCP URL below points at `localhost` because `./tools/keep-k8s-port-forward.sh` forwards your local machine to the Kubernetes service. Keep the port-forwarder running in one terminal, then run this in another terminal before launching Claude:
>
> ```sh
> kubectl rollout status deploy/mcp -n mcp
> ```
>
> If Claude says the port-forward connection dropped, restart `./tools/keep-k8s-port-forward.sh`, wait for the MCP deployment again, and retry.

Fetch a fresh API access token in case the token from the previous chapter has expired:

```sh
_scope="api:role.docs-getter"
_my_access_token=$(./tools/athenz/fetch-access-token.sh \
  "./keys/idjag-learner.crt" \
  "./keys/idjag-learner.key" \
  "${_scope}" \
  "./keys/idjag-learner.jwt")
```

Create `.mcp.json` at the root of this project using the fresh token. The MCP server forwards this bearer token from each request to the API:

```sh
_mcp_port=$(./tools/port.sh mcp)

cat > .mcp.json <<EOF
{
  "mcpServers": {
    "id-jag-the-hard-way-mcp": {
      "type": "http",
      "url": "http://localhost:${_mcp_port}/mcp",
      "headers": { "Authorization": "Bearer ${_my_access_token}" }
    }
  }
}
EOF
```

Check the created `.mcp.json` file:

```sh
cat .mcp.json
```

```json
{
  "mcpServers": {
    "id-jag-the-hard-way-mcp": {
      "type": "http",
      "url": "http://localhost:<your_port>/mcp",
      "headers": { "Authorization": "Bearer <your_access_token>" }
    }
  }
}
```

> [!TIP]
> If you already launched Claude Code and forgot to create `.mcp.json` first, this block fetches a fresh token and registers the MCP server from your shell:
>
> ```sh
> _mcp_port=$(./tools/port.sh mcp)
> _scope="api:role.docs-getter"
> _my_access_token=$(./tools/athenz/fetch-access-token.sh \
>   "./keys/idjag-learner.crt" \
>   "./keys/idjag-learner.key" \
>   "${_scope}" \
>   "./keys/idjag-learner.jwt")
>
> claude mcp add --transport http --scope project \
>   id-jag-the-hard-way-mcp "http://localhost:${_mcp_port}/mcp" \
>   --header "Authorization: Bearer ${_my_access_token}"
> ```
>
> This writes the server entry to `.mcp.json` (project scope). You still need to reload: run `/reload-plugins` inside Claude Code.

<a id="login-to-claude"></a>

## Sign In to Claude

Now start Claude — it will pick up `.mcp.json` automatically on launch:

```sh
claude
```

If it is your first time, choose `2. Anthropic Console account`. You can create an account or use **Continue with Google** for a faster sign-up.

<a id="connect-to-mcp-server"></a>

## Connect to the MCP Server

Run:

```sh
/mcp
```

You can see that you are `✅ Connected` for the `id-jag-the-hard-way-mcp`:

![10_mcp_connected](./assets/10_mcp_connected.png)

## Verify

Open `/mcp`, select `id-jag-the-hard-way-mcp`, and confirm that the server is connected and advertises these tools:

- `get_k8s_docs`
- `post_k8s_doc`
- `delete_k8s_doc`

## Verify Working

Ask Claude Code to call the document tool:

```sh
Get docs with id-jag-the-hard-way-mcp
```

The tool should return status `200` and the document list. If the API rejects an expired token, repeat the token and configuration steps above, then run `/reload-plugins` or restart Claude Code.

## Understand the Result

Discovery reads tool definitions without calling the API. When Claude Code calls `get_k8s_docs`, the MCP server forwards the API token from that request's Authorization header. The API validates the token and its document-read permission.

![The AI agent retrieves documents through MCP using the same API access token](./assets/core_09_mcp_success.svg)

## Next Steps

The AI client can now retrieve documents through MCP. In the next chapter, we will add Runtime Proxy to validate access tokens before allowing tool execution.

Next: [Protect MCP Server](./10-protect-mcp-server.md)
