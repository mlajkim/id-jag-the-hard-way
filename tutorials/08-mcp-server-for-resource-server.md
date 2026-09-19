| Previous | Current | Next |
|:---:|:---:|:---:|
| [Granular Permission](./07-granular-permission.md) | **MCP Server for Resource Server** | [AI Agent](./09-ai-agent.md) |

# MCP Server for Resource Server

Deploy `idthw-demo-api-mcp` and successfully retrieve documents through MCP. For this first call, the MCP server forwards the learner's existing API access token. The resource server continues enforcing tokens as configured in chapter 04.

<!-- TOC depthFrom:2 depthTo:2 -->

- [Create the MCP Namespace](#create-the-mcp-namespace)
- [Deploy the MCP Server](#deploy-the-mcp-server)
- [Discover the Tools](#discover-the-tools)
- [Retrieve Documents](#retrieve-documents)
- [Understand the Result](#understand-the-result)
- [Next Steps](#next-steps)

<!-- /TOC -->

## Create the MCP Namespace

Keep the MCP deployment in `mcp` and the resource server in `api`:

```sh
kubectl create ns mcp
# namespace/mcp created
```

## Deploy the MCP Server

Enable the tutorial's initial `forward` mode explicitly. It sends the incoming bearer token to the API without performing token exchange:

```sh
kubectl create deploy mcp -n mcp \
  --image=ghcr.io/mlajkim/idthw-demo-api-mcp:latest
kubectl set env deploy/mcp -n mcp \
  MCP_ACCESS_TOKEN_MODE=forward \
  UPSTREAM_BASE_URL=http://api-server.api:8080
kubectl expose deploy mcp -n mcp --port 8081 --target-port 8080 --name mcp
kubectl rollout status deploy/mcp -n mcp
```

```sh
# deployment.apps/mcp created
# deployment.apps/mcp env updated
# service/mcp exposed
# deployment "mcp" successfully rolled out
```

The container listens on `8080`; the Service keeps port `8081` for the tutorial's port-forwarder and gateway. Keep `./tools/keep-k8s-port-forward.sh` running in another terminal.

The default mode is `token-file`.

## Discover the Tools

Initialize the stateless MCP connection:

```sh
_mcp_port=$(./tools/port.sh mcp)
curl -sS "http://localhost:${_mcp_port}/mcp" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"tutorial","version":"1.0"}}}' | jq '.result.serverInfo'
# { "name": "idthw-demo-api-mcp", "title": "IDTHW Demo API MCP", "version": "0.1.0" }

curl -sS "http://localhost:${_mcp_port}/mcp" \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"notifications/initialized"}'

curl -sS "http://localhost:${_mcp_port}/mcp" \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | jq '.result.tools[].name'
# "get_k8s_docs"
# "post_k8s_doc"
# "delete_k8s_doc"
```

Discovery is public. The API still requires a valid token when a tool requests documents.

## Retrieve Documents

Refresh the learner's API token from chapter 07:

```sh
_scope="api:role.docs-getter"
_my_access_token=$(./tools/athenz/fetch-access-token.sh \
  "./keys/idjag-learner.crt" \
  "./keys/idjag-learner.key" \
  "${_scope}" \
  "./keys/idjag-learner.jwt")
```

Call the document tool:

```sh
_mcp_port=$(./tools/port.sh mcp)
curl -sS "http://localhost:${_mcp_port}/mcp" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer ${_my_access_token}" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_k8s_docs","arguments":{}}}' \
  | jq '.result.structuredContent'
# {
#   "status": 200,
#   "ok": true,
#   "data": {
#     "docs": [
#       { "id": 1, "name": "first default doc", "content": "hello world" },
#       { "id": 2, "name": "second default doc", "content": "how are you?" }
#     ]
#   }
# }
```

## Understand the Result

The MCP server successfully called the API with the learner's `aud=api` token. The API verified that token and its `docs-getter` scope before returning documents. Documents may differ if you changed them earlier.

![MCP forwards the learner's API token and returns documents](./assets/core_08_mcp_api.svg)

At this stage MCP does not validate incoming tokens itself; the API enforces document access. No MCP service identity or exchange permission is needed yet.

## Next Steps

We have successfully retrieved documents by calling the MCP tool directly. In the next chapter, we will connect an AI client and ask it to retrieve the same documents through that tool. Next: [AI Agent](./09-ai-agent.md)
