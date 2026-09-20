# IDTHW Demo API MCP

This MCP serves the core tutorial and Hub-managed deployments. It does not perform Athenz token exchange itself and does not need access to the MCP service private key.

## Supplied API tokens

The MCP server calls the resource server with an API access token supplied in either of two ways:

- Send an API access token in each request's `Authorization: Bearer <token>` header for direct use. Both `/mcp` tool calls and `/tools/<tool>` HTTP requests forward that token to the API.
- Let Runtime Proxy supply a request-specific token file after exchange. The MCP server reads that file immediately before calling the API.

No mode switch is needed. A request-specific file takes precedence over the bearer header; an invalid or unreadable file fails the call without falling back to the incoming token. Runtime Proxy keeps the original MCP-audience bearer header, so the exchanged API token must take precedence. The MCP server never reads an access token from an environment variable or retains it for another request. The API validates the supplied token's audience and permissions.

## Core tutorial

Chapter 08 deploys the MCP server and verifies initialization and tool discovery without a proxy or access token. Chapter 09 connects Claude Code, Codex, or Open WebUI; each path fetches a fresh learner API token and sends it in the Authorization header to retrieve documents. Document retrieval requires an API-audience token with the requested tool's permission.

Chapter 10 adds Runtime Proxy and sets `HOST=127.0.0.1` so requests enter through the proxy in the same pod. The proxy validates MCP access and performs downstream exchange using the service identity. Chapter 11 grants that identity the missing exchange permissions.

`GET /openapi.json` describes `POST /tools/get_k8s_docs`, `POST /tools/post_k8s_doc`, and `POST /tools/delete_k8s_doc` for Open WebUI and the tutorial AI Client Gateway. Each endpoint accepts a JSON object of tool arguments and returns the same JSON-RPC tool result as `/mcp`. The metadata maps operation IDs to `x-athenz-required-scope`, combining `ACCESS_MCP_REQUIRED_SCOPE` (default `mcp:role.mcp-accessor`) with the API role. Runtime Proxy's configured `MCP_TOOL_SCOPES` maps these HTTP tool requests to MCP calls before publishing their token files.

Other settings: `PORT` defaults to `8080`, `HOST` to `0.0.0.0`, and `MCP_ACCESS_TOKEN_FILE_DIR` to `/var/run/idthw-access-tokens`.

## Delegated token files

For each protected `tools/call`, MCP Runtime Proxy exchanges the signed-in user's incoming Athenz access token using the MCP service identity. It writes the narrowly scoped result to a unique request file and injects that path at:

```text
params._meta["mcp.idthw.dev/access-token-file"]
```

This MCP validates that the path belongs to the current tool under `/var/run/idthw-access-tokens`, reads the token immediately before the API request, and forwards it as `Authorization: Bearer <token>`. It never logs token contents. Runtime Proxy deletes the file after the tool response completes.

## Tools

| Tool | K8s Docs endpoint | Expected configured scope |
|---|---|---|
| `get_k8s_docs` | `GET /api/docs` | `api:role.docs-getter` |
| `post_k8s_doc` | `POST /api/docs` | `api:role.docs-poster` |
| `delete_k8s_doc` | `DELETE /api/docs/{doc_id}` | `api:role.docs-deleter` |

For each tool, configure these custom permission rows in MCP Hub:

1. `<signed_in_user>` in the tool role shown above.
2. `mcp-hub.mcp-gateway` in the matching `<tool-role>-jag-exchanger` role so Gateway can obtain the incoming delegated AT.
3. The exact Athenz service selected during MCP registration in the matching `<tool-role>-exchanger` role so Runtime Proxy can perform the AT-to-AT exchange.

For example, `get_k8s_docs` uses `api:role.docs-getter`, `api:role.docs-getter-jag-exchanger`, and `api:role.docs-getter-exchanger`. Saving Hub permission settings documents and checks these memberships; it does not add the members in Athenz.

## MCP Hub template values

```text
Container image: ghcr.io/mlajkim/idthw-demo-api-mcp:latest
Target port: 8080
Protocol: Streamable HTTP
Path: /mcp
Container command: leave blank
Container arguments: leave blank
Access management: MCP Hub / Athenz
```

Set `UPSTREAM_BASE_URL` only when the protected API is not available at the default `http://api-server.api:8080`.

## Local checks

```sh
make check test
make build-image
```
