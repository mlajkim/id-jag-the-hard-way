# Goal

The goal of this tutorial is to connect a vendor MCP server to MCP Hub, using Confluence Cloud and `mcp-atlassian` as the first real vendor example.

<!-- TOC depthFrom:2 depthTo:3 -->

- [Step 1. Create Confluence Cloud Workspace](#step-1-create-confluence-cloud-workspace)
- [Step 2. Create ID-JAG Space](#step-2-create-id-jag-space)
- [Step 3. Create Starter Pages](#step-3-create-starter-pages)
- [Step 4. Create API Token](#step-4-create-api-token)
- [Step 5. Deploy Vendor MCP Server](#step-5-deploy-vendor-mcp-server)
  - [Deploy Confluence MCP](#deploy-confluence-mcp)
  - [Configure Confluence Toolsets](#configure-confluence-toolsets)
  - [Register MCP Hub Metadata](#register-mcp-hub-metadata)
- [Step 6. Forward Confluence MCP Locally](#step-6-forward-confluence-mcp-locally)
- [Step 7. Verify Tool Discovery](#step-7-verify-tool-discovery)
- [Step 8. Keep SSOT Boundary Clear](#step-8-keep-ssot-boundary-clear)

<!-- /TOC -->

> [!NOTE]
> This tutorial intentionally uses an existing vendor MCP server instead of writing a new Confluence MCP server first. That keeps the demo focused on MCP Hub as the control point for MCP server discovery and future resource-policy metadata.

# Prerequisites

- Complete the main tutorial through [MCP Server for API](../tutorials/09-mcp-server-for-api.md).
- Have the local Kubernetes cluster and MCP Hub namespace available.
- Have a Confluence Cloud site. The free plan is enough for a local multi-user demo.
- Make sure your Kubernetes cluster can pull `ghcr.io/sooperset/mcp-atlassian:latest`.

# Background

The vendor service owns its own upstream authorization model. For Confluence Cloud, Atlassian issues the API token or OAuth token that lets the MCP server call Confluence.

That upstream token is separate from the ID-JAG/Athenz access token used to reach your MCP boundary.

```text
AI client
  -> MCP Hub / AthenzProxy boundary
  -> vendor MCP server
  -> Confluence Cloud REST API
```

For the first demo, MCP Hub should be treated as the SSOT for:

- which MCP servers are approved
- where each MCP server endpoint is
- which tools each MCP server exposes
- what resource model each tool should eventually map to

The vendor MCP server still owns the actual Confluence API call.

# Steps

## Step 1. Create Confluence Cloud Workspace

Go to the Confluence page and login with whatever IdP or SAML SSO:

```text
https://www.atlassian.com/software/confluence
```

Create a workspace (Takes few minutes):

![create_confluence_workspace](./assets/create_confluence_workspace.png)


## Step 2. Create ID-JAG Space

Create a space:

![create_space](./assets/create_space.png)

Create a normal named space and use these exact settings:

```text
Name this space: ID-JAG
Purpose: Knowledge base
Space access: Default
Customize space key: IDJAG
```

![space_setting](./assets/space_setting.png)

Use `Knowledge base`, not `Collaboration`, because this demo is about managed documentation resources. Keep `Default` space access for the first setup, then tighten permissions later when testing multi-user access. The icon does not matter for MCP. Pick any icon.

After the space is created, the clean space URL should look like:

```text
https://idjag.atlassian.net/wiki/spaces/IDJAG
```

![space_created](./assets/space_created.png)

This gives MCP Hub a stable resource identity:

```text
confluence:space/IDJAG
confluence:space/IDJAG/page/<pageId>
```

## Step 3. Create Starter Pages

Create a few starter pages in this space with these exact titles:

```text
MCP Hub SSOT Vision
Confluence Vendor MCP Setup
AthenzProxy Design Notes
Resource Control Model
Tomorrow Demo Script
```

## Step 4. Create API Token

Go to the following page:

```text
https://id.atlassian.com/manage-profile/security/api-tokens
```

Create an Atlassian API token with id `id-jag-confluence-mcp`:

![click_create_token](./assets/click_create_token.png)

Get key:

![store_api_token](./assets/store_api_token.png)

## Step 5. Deploy Vendor MCP Server

Create a Kubernetes Secret for the Confluence credentials using the values obtained above. The helper will ask you for the API token value, so go ahead and paste it when prompted:

```sh
./tools/confluence/create-admin-key-secret.sh
```

The helper prompts for the namespace, secret name, API token name, Confluence URL, username, and API token. The default API token name is `id-jag-confluence-mcp`. If you exported the `CONFLUENCE_*` values above, it uses them as defaults. Prompts with defaults use this shape: `Enter for default: xxx`.

### Deploy Confluence MCP

Deploy the vendor MCP server into the `mcp-hub` namespace. The upstream MCP server still serves the standard `/mcp` path on container port `9000`.

```sh
kubectl apply -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: confluence-mcp
  namespace: mcp-hub
  labels:
    app: confluence-mcp
spec:
  replicas: 1
  selector:
    matchLabels:
      app: confluence-mcp
  template:
    metadata:
      labels:
        app: confluence-mcp
    spec:
      containers:
        - name: confluence-mcp
          image: ghcr.io/sooperset/mcp-atlassian:latest
          args:
            - "--transport"
            - "streamable-http"
            - "--stateless"
            - "--host"
            - "0.0.0.0"
            - "--port"
            - "9000"
          envFrom:
            - secretRef:
                name: confluence-mcp-env
          ports:
            - name: http
              containerPort: 9000
EOF
```

Expose the deployment:

```sh
kubectl expose deploy confluence-mcp -n mcp-hub \
  --port 9000 \
  --target-port 9000 \
  --name confluence-mcp
```

### Configure Confluence Toolsets

`mcp-atlassian` supports both Jira and Confluence. This tutorial is Confluence-only, so set `TOOLSETS` explicitly to Confluence toolsets. This also avoids the startup warning about the default toolset behavior changing in a future `mcp-atlassian` release.

Set the Confluence toolsets:

```sh
kubectl set env deploy/confluence-mcp -n mcp-hub \
  TOOLSETS=confluence_pages,confluence_comments,confluence_labels,confluence_attachments,confluence_users,confluence_analytics
```

### Register MCP Hub Metadata

MCP Hub discovers catalog entries from Kubernetes deployments labeled as part of `mcp-hub`. Add the MCP Hub labels and annotations after the deployment exists.

This annotation value assumes MCP Hub is running locally with a port-forward to the Confluence MCP service:

```sh
_confluence_mcp_port=$(./tools/port.sh confluence-mcp)

kubectl label deploy confluence-mcp -n mcp-hub \
  app.kubernetes.io/part-of=mcp-hub \
  mcp.idthw.dev/project=confluence-cloud \
  --overwrite

kubectl annotate deploy confluence-mcp -n mcp-hub \
  mcp.idthw.dev/alias="Confluence MCP" \
  mcp.idthw.dev/description="Vendor MCP server backed by Confluence Cloud" \
  mcp.idthw.dev/public-url="http://127.0.0.1:${_confluence_mcp_port}/mcp" \
  mcp.idthw.dev/transport="streamable-http" \
  --overwrite
```

If MCP Hub is running inside Kubernetes instead of through `make -C mcp_hub local`, use the in-cluster service DNS name instead:

```sh
kubectl annotate deploy confluence-mcp -n mcp-hub \
  mcp.idthw.dev/public-url="http://confluence-mcp.mcp-hub:9000/mcp" \
  --overwrite
```

Wait for it to become ready:

```sh
kubectl -n mcp-hub rollout status deploy/confluence-mcp
```

If the logs mention `Excluding Jira tool ... Jira configuration/authentication is incomplete`, that is expected for this tutorial. The `mcp-atlassian` server supports both Jira and Confluence, but this setup only provides Confluence credentials. A successful `tools/list` response should still include Confluence tools.

> [!IMPORTANT]
> The vendor MCP server is now running inside Kubernetes. For local MCP Hub development, the local `confluence-mcp` port defaults to `24444` and forwards to the in-cluster service port `9000`.

## Step 6. Forward Confluence MCP Locally

For the local MCP Hub dev server, forward the in-cluster Confluence MCP service to your laptop:

```sh
_confluence_mcp_port=$(./tools/port.sh confluence-mcp)
kubectl -n mcp-hub port-forward svc/confluence-mcp "${_confluence_mcp_port}:9000"
```

If `svc/confluence-mcp` is missing, expose the deployment from Step 5:

```sh
kubectl expose deploy confluence-mcp -n mcp-hub \
  --port 9000 \
  --target-port 9000 \
  --name confluence-mcp
```

If MCP Hub is running inside Kubernetes, skip the local port-forward and use the in-cluster `mcp.idthw.dev/public-url` annotation from Step 5.

## Step 7. Verify Tool Discovery

Start MCP Hub locally if it is not already running:

```sh
make -C mcp_hub local
```

Open the MCP Hub catalog and select `Confluence MCP`. The Tools page should call:

```text
http://127.0.0.1:24444/mcp
```

Expected tools depend on the vendor MCP server version, but they should be Confluence-shaped, such as:

```text
confluence_search
confluence_get_page
confluence_create_page
confluence_update_page
```

If the page shows a fetch error, check these in order:

1. The vendor MCP server is still running.
2. The annotation is exactly `mcp.idthw.dev/public-url`.
3. The URL ends with `/mcp`, or is an origin that MCP Hub can normalize to `/mcp`.
4. If MCP Hub is running locally, `kubectl -n mcp-hub port-forward svc/confluence-mcp "$(./tools/port.sh confluence-mcp):9000"` is still running.
5. If MCP Hub is running inside Kubernetes, `mcp.idthw.dev/public-url` uses `http://confluence-mcp.mcp-hub:9000/mcp`.
6. The vendor MCP server supports direct `tools/list` over streamable HTTP.

## Step 8. Keep SSOT Boundary Clear

For now, MCP Hub is the SSOT for the MCP server endpoint and live tool discovery:

```yaml
mcp.idthw.dev/public-url: "http://127.0.0.1:24444/mcp"
```

For in-cluster MCP Hub, use:

```yaml
mcp.idthw.dev/public-url: "http://confluence-mcp.mcp-hub:9000/mcp"
```

Do not make the AI client guess vendor MCP URLs. The AI client should look at MCP Hub-managed MCP servers.

For the next resource-control slice, model Confluence resources separately from the tool list:

```json
{
  "managedResources": [
    {
      "id": "confluence-space",
      "kind": "confluence.space",
      "displayName": "Confluence space",
      "actions": ["read", "write"],
      "resourcePattern": "confluence:space/{spaceKey}"
    },
    {
      "id": "confluence-page",
      "kind": "confluence.page",
      "displayName": "Confluence page",
      "actions": ["read", "write"],
      "resourcePattern": "confluence:space/{spaceKey}/page/{pageId}"
    }
  ],
  "toolAccess": [
    {
      "tool": "confluence_get_page",
      "action": "read",
      "resourceRef": "confluence-page",
      "resourceParams": {
        "spaceKey": "$.arguments.spaceKey",
        "pageId": "$.arguments.pageId"
      }
    }
  ]
}
```

That JSON is the contract MCP Hub should eventually manage. The vendor MCP server can keep doing the Confluence API work, while MCP Hub/AthenzProxy/ID-JAG decide whether the current actor should be allowed to call a tool for a specific Confluence resource.
