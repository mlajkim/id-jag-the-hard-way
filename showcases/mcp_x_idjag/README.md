# MCP × ID-JAG

This showcase organizes architectures for accessing a backend API through MCP with an Athenz ID-JAG (delegation assertion), based on where the token is obtained, transformed, and delivered. Each pattern can be built and tested independently with its own directory and `make` commands.

## Three axes

| Axis | Options | Description |
|---|---|---|
| A. id_token acquisition | local / remote | Whether the Client obtains the id_token directly from the IdP or another component (AS) acts as the OIDC RP on its behalf |
| B. ID-JAG exchange | local / remote | Whether the Client performs the id_token → ID-JAG → Access Token exchange itself or another component (Exchanger) performs it |
| C. Access Token delivery | return to Client / forward directly to MCP | Whether the Access Token is returned to the Client, which then calls MCP directly, or the Exchanger/AS proxies the actual MCP request itself |

Combinations where the Client performs the ID-JAG exchange without possessing the id_token are excluded. Axis C is not meaningfully distinguishable for Pattern 1, resulting in **five patterns**.

## Pattern list

| Directory | id_token acquisition | ID-JAG exchange | AT delivery | Does the Client hold the AT? | Status |
|---|---|---|---|---|---|
| [pattern-1-local-exchange](./patterns/pattern-1-local-exchange) | local | local | (degenerate / indistinguishable) | Yes | Placeholder (not implemented) |
| [pattern-2a-remote-return](./patterns/pattern-2a-remote-return) | local | remote | Return to Client | Yes | Placeholder (not implemented) |
| [pattern-2b-remote-forward](./patterns/pattern-2b-remote-forward) | local | remote | Forward directly to MCP | No | **Implemented** (using agentgateway's native `crossAppAccess`) |
| [pattern-3a-remote-return](./patterns/pattern-3a-remote-return) | remote | remote | Return to Client | Yes | **Implemented** (using mcp-oauth-proxy) |
| [pattern-3b-remote-forward](./patterns/pattern-3b-remote-forward) | remote | remote | Forward directly to MCP | No (session identifier only) | Existing `ai_client_gateway` is a close example |

See the README linked from each row for detailed explanations, architecture diagrams, and sequence diagrams.

## Comparison

| # | Client implementation effort | Access Token/id_token exposure | Proof-of-Possession when presented to Gateway/AS | Additional infrastructure | Single point of failure / bottleneck | Standards compliance |
|---|---|---|---|---|---|---|
| 1 | High (workload identity required) | Both id_token and AT exposed to Client | Not required (no network presentation to another component) | None | None (distributed across Clients) | Low (custom implementation) |
| 2a | Medium (OIDC RP implementation) | Both id_token and AT exposed to Client | **Required (DPoP + pre-registered/pinned key)** — presenting the id_token as a Bearer token to the Exchanger cannot be protected by DPoP alone without pinning | Exchanger | None (Exchanger is used only for token issuance) | Medium |
| 2b | Low (OIDC RP only; does not hold the AT) | id_token exposed to Client; AT is not exposed | **Required (DPoP + pre-registered/pinned key)**, plus binding the issued AT to the DPoP key and caching it in a session | Exchanger as data plane | Yes (all traffic passes through the Exchanger) | Medium |
| 3a | Low (standard PKCE only) | id_token is not exposed; AT is exposed to Client | Standard PKCE (including code-interception protection) is sufficient; the id_token never crosses the network from the IdP to the Client | AS (standard implementation) | None (AS is used only for token issuance) | High |
| 3b | Minimal (PKCE + session ID) | Neither id_token nor AT is exposed to Client | Same as 3a, plus protection for the session ID (for example, an HttpOnly cookie) | AS (BFF extension and session store) | Yes (all traffic passes through the AS) | High for the frontend; the BFF portion is non-standard |

## Feasibility with general-purpose MCP clients

The following assumes a general-purpose MCP client such as Claude Code or Codex supports standard OAuth 2.1, PKCE, PRM (RFC 9728), and AS Metadata (RFC 8414).

| # | Fits within standard OAuth + PKCE? | Non-standard elements required | Can it work with only a general-purpose MCP client? |
|---|---|---|---|
| 1 | No | Athenz workload identity and integration with the ID-JAG Exchanger | **No**. A helper equivalent to the Exchanger is required |
| 2a | No | Custom Exchanger API, DPoP (RFC 9449) proof, and key pinning | **No**. A helper is required |
| 2b | No | The non-standard elements from 2a, plus forwarding MCP requests to the Exchanger | **No**. A helper such as a local proxy is required |
| 3a | **Yes** | None (if the AS does not support DCR (RFC 7591), the client_id must be pre-registered) | **Yes** |
| 3b | Depends on the AS design | Cookie-based sessions require a cookie jar and CSRF protection; opaque reference tokens require no additional client-side mechanism | **Conditionally** |

In summary, 3a is the only pattern that works with a general-purpose MCP client alone. Pattern 3b can also work depending on the AS session design; Patterns 1, 2a, and 2b require a helper.

## Prerequisites

Run `bootstrap-common` explicitly before deploying a pattern. It provides only the shared Kind, Keycloak, and Athenz ZMS/ZTS infrastructure; each pattern target then creates its own Athenz permissions, identity-provider mapping, API server, and MCP server in its own namespace and domain. To deploy several patterns together while bootstrapping the shared infrastructure only once, pass the goals explicitly: `make bootstrap-common pattern-2b pattern-3a`.

## Pattern boundaries

Each implemented pattern deploys into its own namespace and Athenz domain, so Pattern 3a and Pattern 2b can be deployed side by side in the same cluster without interfering with each other: Pattern 3a uses the `mcp-pattern-3a` namespace and `mcp.pattern3a` Athenz domain (API, docs MCP, MoP, echo MCP, routing-only Envoy Gateway); Pattern 2b uses the `mcp-pattern-2b` namespace and `mcp.pattern2b` Athenz domain (API, docs MCP, echo MCP, agentgateway, dpop-verifier). The Athenz identity provider remains shared in the `athenz` namespace. Its `instance_provider` configuration continues to use `athenz.identityprovider` with the `svc.cluster.local` DNS suffix, while each pattern's SIA configuration explicitly sets its own Athenz domain. `bootstrap-common/05-athenz-identityprovider.sh` applies the small [`identityprovider-policy.patch`](identityprovider-policy.patch) to the checked-out Athenz policy submodule and registers the namespace-to-domain mapping in the generated policy ConfigMap (additively, so multiple patterns' mappings coexist); the upstream policy source itself is not edited in this repository.

## Running

```sh
# Build shared infrastructure once, then deploy both patterns independently
make -C showcases/mcp_x_idjag bootstrap-common pattern-2b pattern-3a

make -C showcases/mcp_x_idjag pattern-3a-port-forward   # separate terminal
make -C showcases/mcp_x_idjag pattern-2b-port-forward   # forward the agentgateway port locally (separate terminal)

# For a single pattern, use the same explicit shared-bootstrap sequence:
make -C showcases/mcp_x_idjag bootstrap-common pattern-3a
make -C showcases/mcp_x_idjag pattern-3a-port-forward   # separate terminal
```

## Cleanup

Remove only Pattern 3a or Pattern 2b resources, including their pattern namespace and gateway resources, with:

```sh
make -C showcases/mcp_x_idjag pattern-3a-clean
make -C showcases/mcp_x_idjag pattern-2b-clean
```

Remove the full showcase environment while keeping the Kind cluster with:

```sh
make -C showcases/mcp_x_idjag bootstrap-common-clean
```

The common cleanup removes both Pattern 3a and Pattern 2b resources and namespaces, plus the shared `idp`, Keycloak, and Athenz resources, generated service keys, and port-forwards. Athenz cleanup is delegated to `make -C athenz_dist clean-kubernetes-athenz`; the Kind cluster and Docker images are kept. Because this also tears down the *shared* Athenz/Keycloak infrastructure, use the pattern-specific `*-clean` target instead when you want to keep the other pattern running.

When using custom pattern service names, pass the same names to cleanup, for example `CLEAN_SERVICES="svc1 svc2" make -C showcases/mcp_x_idjag bootstrap-common-clean`.
