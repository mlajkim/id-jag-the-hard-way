# Goal

The goal of this FAQ is to run MCP Hub locally.

<!-- TOC depthFrom:2 depthTo:3 -->

- [Step 1. Run MCP Hub](#step-1-run-mcp-hub)
- [Import K8s API Docs Server](#import-k8s-api-docs-server)

<!-- /TOC -->

# Prerequisites

- Have the local Kubernetes cluster configured for this repo.
- Have `kubectl` pointed at that cluster.
- Have Node.js and npm available.

# Steps

## Step 1. Run MCP Hub

From the repository root:

```sh
make -C mcp_hub local PORT=3102 OPEN_UI=true
```

## Import K8s API Docs Server

MCP Hub discovers servers from Kubernetes labels and annotations. Add the MCP Hub metadata to the existing `mcp` deployment in the `api` namespace:

```sh
_core_mcp_proxy_port=$(./tools/port.sh mcp)

kubectl label deploy mcp -n api \
  app.kubernetes.io/part-of=mcp-hub \
  mcp.idthw.dev/project=k8s-docs-server \
  --overwrite

kubectl annotate deploy mcp -n api \
  mcp.idthw.dev/alias="K8s API Docs Server" \
  mcp.idthw.dev/description="MCP server for Kubernetes API docs used by ID-JAG tutorials" \
  mcp.idthw.dev/public-url="http://127.0.0.1:${_core_mcp_proxy_port}" \
  mcp.idthw.dev/upstream-url="http://mcp.api:8081/mcp" \
  mcp.idthw.dev/transport="streamable-http" \
  --overwrite
```

```sh
# deployment.apps/mcp labeled
# deployment.apps/mcp annotated
```

Refresh MCP Hub. The tutorial has been finished.
