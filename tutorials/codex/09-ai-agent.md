|               Previous               |  Current  |                   Next                   |
|:------------------------------------:|:---------:|:----------------------------------------:|
| [AI Agent](../09-ai-agent.md) | **Codex** | [Protect MCP Server](./10-protect-mcp-server.md) |

# Codex

![10_codex](./assets/10_codex.png)

> [!NOTE]
> Codex CLI runs on your machine. With OpenAI-hosted models, model inference runs remotely, so this path does not require a local model runtime such as Ollama.

Install Codex CLI and connect it to the MCP server. The first tool call retrieves documents using the learner's existing API access token.

<!-- TOC depthFrom:2 depthTo:2 -->

- [Install Codex CLI](#install-codex-cli)
- [Sign In to Codex](#sign-in-to-codex)
- [Add the MCP Server to Codex](#add-the-mcp-server-to-codex)
- [Connect to the MCP Server](#connect-to-the-mcp-server)
- [Verify](#verify)
- [Understand the Result](#understand-the-result)

<!-- /TOC -->

## Install Codex CLI

Check if Codex is already installed:

```sh
codex --version
```

```sh
# codex-cli X.XXX.X
```

If Codex is not installed, install [Node.js and npm](https://nodejs.org/en/download), then run:

```sh
npm install -g @openai/codex
```

> [!NOTE]
> For other installation methods, see the [official Codex CLI documentation](https://developers.openai.com/codex/cli/).

<a id="login-to-codex"></a>

## Sign In to Codex

Start Codex and follow the sign-in prompts:

```sh
codex
```

Choose **Sign in with ChatGPT** or another available authentication method. See the [authentication guide](https://learn.chatgpt.com/docs/auth) for the supported options. Exit Codex after signing in to configure the MCP connection in your shell.

## Add the MCP Server to Codex

Get the access token:

```sh
_scope="api:role.docs-getter"
_my_access_token=$(./tools/athenz/fetch-access-token.sh \
  "./keys/idjag-learner.crt" \
  "./keys/idjag-learner.key" \
  "${_scope}" \
  "./keys/idjag-learner.jwt")

cat "./keys/idjag-learner.jwt"
```

Create a local Codex config file and append the provided settings:

```sh
_mcp_port=$(./tools/port.sh mcp)
_at=$(cat ./keys/idjag-learner.jwt)

cat > .codex/config.toml <<EOF
[mcp_servers.id-jag-the-hard-way-mcp]
url = "http://localhost:${_mcp_port}/mcp"
http_headers = { Authorization = "Bearer ${_at}" }
EOF

cat .codex/settings.toml >> .codex/config.toml
```

> [!IMPORTANT]
> The `Authorization` value must be a single unbroken line in the TOML file. The heredoc above expands `${_at}` to the full JWT token inline, so the file will be valid regardless of how long the token is. Do not manually line-wrap the token.

Check the created config file:

```sh
cat .codex/config.toml
```

```toml
[mcp_servers.id-jag-the-hard-way-mcp]
url = "http://localhost:<your_port>/mcp"
http_headers = { Authorization = "Bearer <redacted-access-token>" }

[mcp_servers.id-jag-the-hard-way-mcp.tools.get_k8s_docs]
approval_mode = "approve"

[mcp_servers.id-jag-the-hard-way-mcp.tools.delete_k8s_doc]
approval_mode = "approve"

[mcp_servers.id-jag-the-hard-way-mcp.tools.post_k8s_doc]
approval_mode = "approve"
```

<a id="connect-to-mcp-server"></a>

## Connect to the MCP Server

Start Codex in this project directory:

```sh
codex
```

Codex should connect and discover the three document tools.

## Verify

Call the document retrieval tool through `id-jag-the-hard-way-mcp`:

Type the following prompt in Codex:

```
get docs from k8s doc server!
```

The `get_k8s_docs` tool succeeds and returns the API's documents. Its structured result contains `status: 200` and `ok: true`.

## Understand the Result

Codex CLI sends the learner's API access token to `idthw-demo-api-mcp`. In `forward` mode, MCP passes that token to the API, which validates audience `api` and scope `docs-getter` before returning documents.

![The AI client retrieves documents through MCP](../assets/core_09_mcp_success.svg)

The MCP endpoint does not yet validate incoming tokens itself. In the next chapter, you will add Runtime Proxy to protect tool execution.

Next: [Protect MCP Server](./10-protect-mcp-server.md)
