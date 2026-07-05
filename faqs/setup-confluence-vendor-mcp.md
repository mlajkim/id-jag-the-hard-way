# Goal

The goal of this tutorial is to connect a vendor MCP server to MCP Hub, using Confluence Cloud and `mcp-atlassian` as the first real vendor example.

<!-- TOC depthFrom:2 depthTo:3 -->

- [Step 1. Create Confluence Cloud Workspace](#step-1-create-confluence-cloud-workspace)
- [Step 2. Create ID-JAG Space](#step-2-create-id-jag-space)
- [Step 3. Create Starter Pages](#step-3-create-starter-pages)
- [Step 4. Create API Token](#step-4-create-api-token)
- [Step 5. Run Vendor MCP Server](#step-5-run-vendor-mcp-server)
- [Step 6. Register Vendor MCP in MCP Hub](#step-6-register-vendor-mcp-in-mcp-hub)
- [Step 7. Verify Tool Discovery](#step-7-verify-tool-discovery)
- [Step 8. Keep SSOT Boundary Clear](#step-8-keep-ssot-boundary-clear)

<!-- /TOC -->

> [!NOTE]
> This tutorial intentionally uses an existing vendor MCP server instead of writing a new Confluence MCP server first. That keeps the demo focused on MCP Hub as the control point for MCP server discovery and future resource-policy metadata.

# Prerequisites

- Complete the main tutorial through [MCP Server for API](../tutorials/09-mcp-server-for-api.md).
- Have the local Kubernetes cluster and MCP Hub namespace available.
- Have a Confluence Cloud site. The free plan is enough for a local multi-user demo.
- Install `uv` or be ready to run the vendor MCP server another way.

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

Create an Atlassian API token for the Confluence Cloud user that the vendor MCP server will use.

Export the connection settings in your shell:

```sh
export CONFLUENCE_URL="https://<your-site>.atlassian.net/wiki"
export CONFLUENCE_USERNAME="<your-email>"
export CONFLUENCE_API_TOKEN="<your-api-token>"
```

Use a dedicated test user if you want the demo to show a clean service boundary. The permissions of this Confluence user still matter because Confluence enforces its own space and page access.

## Step 5. Run Vendor MCP Server

Run the Atlassian MCP server with streamable HTTP on port `9000`:

```sh
uvx mcp-atlassian \
  --transport streamable-http \
  --host 127.0.0.1 \
  --port 9000 \
  -vv
```

The endpoint for MCP Hub will be:

```text
http://127.0.0.1:9000/mcp
```

Keep this process running in its own terminal.

> [!IMPORTANT]
> `127.0.0.1` only works when MCP Hub runs on the same host as this vendor MCP server. If MCP Hub runs inside Kubernetes, `127.0.0.1` means the MCP Hub pod itself, not your laptop. For in-cluster MCP Hub, deploy the vendor MCP server in the cluster or expose it through a real reachable URL.

## Step 6. Register Vendor MCP in MCP Hub

MCP Hub discovers catalog entries from Kubernetes deployments labeled as part of `mcp-hub`. For a locally running vendor MCP server, create a lightweight catalog marker deployment:

```sh
kubectl create namespace mcp-hub --dry-run=client -o yaml | kubectl apply -f -

kubectl create deploy confluence-mcp -n mcp-hub \
  --image=registry.k8s.io/pause:3.9 \
  --replicas=0 \
  --dry-run=client -o yaml | kubectl apply -f -
```

Label and annotate the deployment:

```sh
kubectl label deploy confluence-mcp -n mcp-hub \
  app.kubernetes.io/part-of=mcp-hub \
  mcp.idthw.dev/project=confluence-cloud \
  --overwrite

kubectl annotate deploy confluence-mcp -n mcp-hub \
  mcp.idthw.dev/alias="Confluence MCP" \
  mcp.idthw.dev/description="Vendor MCP server backed by Confluence Cloud" \
  mcp.idthw.dev/public-url="http://127.0.0.1:9000/mcp" \
  mcp.idthw.dev/transport="streamable-http" \
  --overwrite
```

This does not deploy Confluence or the vendor MCP server into Kubernetes. It only registers the MCP endpoint in MCP Hub's Kubernetes-backed catalog.

## Step 7. Verify Tool Discovery

Start MCP Hub locally if it is not already running:

```sh
cd mcp_hub
npm run dev
```

Open the MCP Hub catalog and select `Confluence MCP`. The Tools page should call:

```text
http://127.0.0.1:9000/mcp
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
4. MCP Hub is running on the same host as `127.0.0.1:9000`.
5. The vendor MCP server supports direct `tools/list` over streamable HTTP.

## Step 8. Keep SSOT Boundary Clear

For now, MCP Hub is the SSOT for the MCP server endpoint and live tool discovery:

```yaml
mcp.idthw.dev/public-url: "http://127.0.0.1:9000/mcp"
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
