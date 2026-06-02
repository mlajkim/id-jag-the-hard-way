|                      Previous                      |        Current         |                    Next                    |
|:--------------------------------------------------:|:----------------------:|:------------------------------------------:|
| [Granular Permission](./06-granular-permission.md) | **MCP Server for API** | [AI Client Agent](./08-ai-client-agent.md) |

# MCP Server for API

In this tutorial, we will set up MCP Server for API so that our AI client agent that we will install in the next tutorial can interact with our protected API server for you.

<!-- TOC depthFrom:2 depthTo:2 -->

- [Run MCP Server for API](#run-mcp-server-for-api)
- [Create K8s Secret](#create-k8s-secret)
- [What's done?](#whats-done)
- [What's next?](#whats-next)

<!-- /TOC -->

## Run MCP Server for API

### Service Cert for MCP Server

To run the MCP Server, just like we have given service identity for human user `human.idjag-learner` , we also need to give service identity for the MCP server. Because mcp server is part of the API server, we will simply create service `api-mcp` under the tld (domain) `api`.

Run the following:

```sh
./my_tools/create-private-key.sh "./keys/api-mcp"
./my_tools/create-service.sh "api" "api-mcp" "./keys/api-mcp.public.key"
./my_tools/enable-cert-provider.sh "api" "api-mcp"
sleep 2
./my_tools/fetch-cert.sh "api" "api-mcp" "./keys/api-mcp.key" "v1"
```

*Detailed explanation is skipped as thoroughly explained in the previous tutorials. Also, sleep has been included for Athenz to sync.*

## Create K8s Secret

Create a secret based on the generated certificates: 

```sh
kubectl -n api create secret generic api-mcp-cert \
  --from-file=cert=./keys/api-mcp.crt \
  --from-file=key=./keys/api-mcp.key \
  --from-file=ca=./athenz_dist/certs/ca.cert.pem
```

```sh
# secret/api-mcp-cert created
```

### Run the MCP Server

Before we run the MCP server for the API, we need to copy Athenz CA file as well to the api server so that it can trust the Athenz generated X.509 certificate. 

```sh
cp ./athenz_dist/certs/ca.cert.pem ./api_server/mcp/certs/ca.crt
```

Run the server:

```sh
make -C api_server mcp-local PORT=8101
```

```sh
# 🚀 OpenAPI MCP Server for API listening on: http://localhost:8101
# 🔗 Upstream API: http://localhost:14443
# 📄 OpenAPI Spec available at: http://localhost:8101/openapi.json
```

## What's done?

We have created a running MCP Server for API with service identity `api.mcp-api` highlighted in red below.

![07_arch_mcp_server_for_api](./assets/07_arch_mcp_server_for_api.png)

## What's next?

In next tutorial, we will do actual chat with local AI Agent and see how it interacts with our protected API server through the MCP Server we just created.

Next: [AI Client Agent](./08-ai-client-agent.md)
