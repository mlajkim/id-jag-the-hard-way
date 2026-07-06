# Goal

The goal of this FAQ is to run MCP Hub locally.

<!-- TOC depthFrom:2 depthTo:3 -->

- [Step 1. Run MCP Hub](#step-1-run-mcp-hub)
- [Ste 2. Import K8s API Docs Server](#ste-2-import-k8s-api-docs-server)
- [Step 3. Setup X.509 Cert for the ui](#step-3-setup-x509-cert-for-the-ui)

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

## Ste 2. Import K8s API Docs Server

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

Refresh MCP Hub. The tutorial has been finished:

![k8s_doc_server_visible](./assets/k8s_doc_server_visible.png)


## Step 3. Setup X.509 Cert for the ui

The UI server does not have permission to get to the mcp server.

```sh
./tools/athenz/create-tld.sh "mcp-hub"
./tools/athenz/create-private-key.sh "./keys/mcp-hub-ui"
./tools/athenz/create-service.sh "mcp-hub" "hub-ui" "./keys/mcp-hub-ui.public.key"
./tools/athenz/enable-cert-provider.sh "mcp-hub" "hub-ui"
./tools/athenz/fetch-cert.sh "mcp-hub" "hub-ui" "./keys/mcp-hub-ui.key" "v1"
```

Copy the certificate and its key for the local development:

```sh
cp "./keys/mcp-hub-ui.key" "mcp_hub/certs/"
cp "./keys/mcp-hub-ui.crt" "mcp_hub/certs/"
cp ./athenz_dist/certs/ca.cert.pem ./mcp_hub/certs/ca.crt
ls -al mcp_hub/certs/
```

```sh
# total 16
# drwxr-xr-x@  4 mlajkim  staff   128 Jul  7 08:16 .
# drwxr-xr-x  21 mlajkim  staff   672 Jul  7 08:15 ..
# -rw-r--r--   1 mlajkim  staff  1834 Jul  7 08:16 ca.crt
# -rw-------   1 mlajkim  staff  1720 Jul  7 08:16 mcp-hub-ui.crt
# -rw-------   1 mlajkim  staff  1679 Jul  7 08:16 mcp-hub-ui.key
```