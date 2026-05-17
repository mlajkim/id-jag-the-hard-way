|                      Previous                      |        Current         |                    Next                    |
|:--------------------------------------------------:|:----------------------:|:------------------------------------------:|
| [Granular Permission](./06-granular-permission.md) | **MCP Server for API** | [AI Client Agent](./08-ai-client-agent.md) |

# MCP Server for API

In this tutorial, we will set up MCP Server for API so that our AI client agent that we will install in the next tutorial can interact with our protected API server for you.

## Run MCP Server for API

### Service Cert for MCP Server

To run the MCP Server, just like we have given service identity for human user `human.idjag-learner` , we also need to give service identity for the MCP server. Because mcp server is part of the API server, we will simply create service `api-mcp` under the tld (domain) `api`.

Create a directory:

```sh
mkdir -p api_server/mcp/certs
```

```sh
./my_tools/create-private-key.sh "./api_server/mcp/certs/api-mcp"
```

```sh
# Generating RSA key pair for: ./api_server/mcp/certs/api-mcp...
# Done! Keys generated: ./api_server/mcp/certs/api-mcp.key, ./api_server/mcp/certs/api-mcp.public.key
```

Then create a service with the key created above:

```sh
./my_tools/create-service.sh "api" "api-mcp" "./api_server/mcp/certs/api-mcp.public.key"
```

```sh
# Registering Service: api.api-mcp...
```

Enable cert provider for the service `api.api-mcp`:

```sh
./my_tools/enable-cert-provider.sh "api" "api-mcp"

```sh
# [Template(s) successfully applied to domain]
```

And finally generate X.509 Certificate:

```sh
./my_tools/fetch-cert.sh "api" "api-mcp" "./api_server/mcp/certs/api-mcp.key" "v1"
```

```sh
# Fetching X.509 Certificate for api.api-mcp...
# Done! Certificate saved to: ./api_server/mcp/certs/api-mcp.crt
```

### Run the MCP Server

Before we run the MCP server for the API, we need to copy Athenz CA file as well to the api server so that it can trust the Athenz generated X.509 certificate. 

```sh
cp ./athenz_dist/certs/ca.cert.pem ./api_server/mcp/certs/ca.crt
```

Run the server:

```sh
make -C api_server mcp-local PORT=8101

# 🚀 OpenAPI MCP Server for API listening on: http://localhost:8101
# 🔗 Upstream API: http://localhost:14443
# 📄 OpenAPI Spec available at: http://localhost:8101/openapi.json
```

## What we have done

We have created a running MCP Server for API with service identity `api.mcp-api` highlighted in red below.

![07_arch_mcp_server_for_api](./assets/07_arch_mcp_server_for_api.png)

## What's next?

In next tutorial, we will do actual chat with local AI Agent and see how it interacts with our protected API server through the MCP Server we just created.

Next: [AI Client Agent](./08-ai-client-agent.md)
