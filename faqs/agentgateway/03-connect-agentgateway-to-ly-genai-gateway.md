# Connect agentgateway to LY GenAI Gateway

The goal of this FAQ is to expose the LY GenAI Gateway through the existing local Kubernetes agentgateway listener without giving the upstream credential to the AI client.

<!-- TOC depthFrom:2 depthTo:3 -->

- [Current connection](#current-connection)
- [Step 1. Create the upstream credential Secret](#step-1-create-the-upstream-credential-secret)
- [Step 2. Apply the model route](#step-2-apply-the-model-route)
- [Step 3. Verify the model attachment](#step-3-verify-the-model-attachment)
- [Step 4. Test the Responses API](#step-4-test-the-responses-api)
- [Step 5. Point Codex at agentgateway](#step-5-point-codex-at-agentgateway)

<!-- /TOC -->

<details>
<summary>Verification status — 🟡 Pending human verification</summary>

| # | Date | Status |
|---|------|--------|
| 1 | 2026-09-11 | 🟡 Model route attached; upstream credential and end-to-end response remain pending |

</details>

## Current connection

```text
Codex or another local OpenAI Responses client
  -> http://127.0.0.1:44440/v1/responses
  -> agentgateway v1.4.1
  -> https://openai-proxy.linecorp.com/v1/responses
```

`44440` is the agentgateway traffic listener. `44441` is its read-only Admin UI.

The model route matches `gpt-5.5`. Agentgateway reads the LY upstream credential from a Kubernetes Secret and writes it to the upstream `Authorization: Bearer ...` header. The credential is not stored in this repository.

## Step 1. Create the upstream credential Secret

Create a Secret in the `agent-gateway` namespace using the approved local secret-management workflow:

- Secret name: `ly-genai-upstream-credential`
- Secret data key: `Authorization`
- Secret data value: the existing LY GenAI Gateway key, with or without the `Bearer ` prefix

Do not paste the value into this document, Git, screenshots, shared terminal output, or an AI conversation.

Confirm only that the named Secret exists; do not print its data:

```sh
kubectl -n agent-gateway get secret ly-genai-upstream-credential \
  -o custom-columns=NAME:.metadata.name,TYPE:.type
```

## Step 2. Apply the model route

AgentgatewayModel support is experimental and disabled by default in agentgateway `v1.4.1`. Enable it on the existing Helm release:

```sh
helm upgrade agentgateway \
  oci://cr.agentgateway.dev/charts/agentgateway \
  --version v1.4.1 \
  --namespace agent-gateway \
  --reuse-values \
  --set agentgatewayModels.enabled=true \
  --wait
```

Apply the model route:

```sh
kubectl apply \
  -f faqs/agentgateway/manifests/ly-genai-gateway.yaml
```

The manifest preserves the existing `HTTPRoute` support for `/mcp` and adds `AgentgatewayModel` support to the same listener.

## Step 3. Verify the model attachment

```sh
kubectl -n agent-gateway get agentgatewaymodel ly-genai-gateway
```

```sh
kubectl -n agent-gateway get gateway agentgateway-proxy \
  -o jsonpath='{range .status.listeners[*]}{.name}{"\t"}{.attachedRoutes}{"\t"}{range .supportedKinds[*]}{.group}{"/"}{.kind}{" "}{end}{"\n"}{end}'
```

The `http` listener should list both `gateway.networking.k8s.io/HTTPRoute` and `agentgateway.dev/AgentgatewayModel`.

## Step 4. Test the Responses API

Keep the repository port-forward process running, then send a non-sensitive test request:

```sh
curl --fail-with-body --silent --show-error \
  http://127.0.0.1:44440/v1/responses \
  -H 'Content-Type: application/json' \
  --data '{"model":"gpt-5.5","input":"Reply with exactly: agentgateway connected"}' \
  | jq '{id, model, output_text}'
```

The client sends no LY upstream credential. Agentgateway retrieves it from the Kubernetes Secret and injects it only on the upstream connection.

## Step 5. Point Codex at agentgateway

Use the local agentgateway listener as the custom model provider base URL:

```toml
model = "gpt-5.5"
model_provider = "ly-agentgateway"

[model_providers.ly-agentgateway]
name = "Local agentgateway to LY GenAI Gateway"
base_url = "http://127.0.0.1:44440/v1"
wire_api = "responses"
```

Do not configure the LY upstream key in Codex for this path. The current PoC relies on the listener being reachable only through a loopback port-forward; a dedicated listener with its own client authentication is required before exposing it beyond the local workstation.

# Reference

- [Agentgateway model manifest](./manifests/ly-genai-gateway.yaml)
- [Install agentgateway on Kubernetes](./01-install-agent-gateway.md)
- [Connect agentgateway to the API MCP Server](./02-connect-agentgateway-to-api-mcp-server.md)
