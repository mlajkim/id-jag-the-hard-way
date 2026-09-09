# IDTHW Hub Agent Notes

This full-stack Next.js application is the IDTHW Hub. It hosts multiple product surfaces and server-side APIs. MCP Hub remains one product inside it, alongside Gen AI and future IDTHW products.

The MCP Hub is mock-first, but its end goal is real: providers should be able to register MCP servers and have the hub create the runtime deployment for that MCP server.

## Product Direction

- Keep PRs small. Prefer the minimum change that makes the next product step clear.
- Treat the catalog as the entry point, not the whole product.
- The main provider flow is: register MCP server -> define managed policies/tools -> create deployment/pods -> expose connection details.
- The main consumer flow is: discover MCP server -> inspect tools and managed policies -> attach/grant access through ID-JAG.
- Do not spend large PRs only polishing dummy catalog data unless it directly supports one of those flows.

## Product Goals

Users should be able to:

- See public MCP servers.
- See what tools exist for each MCP server.
- See what actions are available for those tools.
- Eventually see resources too, but actions are the first priority.
- See how to register or connect to an MCP server.

MCP providers should be able to:

- Create/register an MCP server with a container image.
- Assign a service account.
- Have MCP pods/deployments created automatically in Kubernetes.
- Have those pods health checked automatically.

Registration is a real product goal. Users/providers should eventually be able to register their MCP server through the UI, but do not introduce a database by default. Start from Kubernetes as the source of truth: deployed MCP workloads, Services, labels, and annotations should drive the catalog until there is a concrete need for draft state, audit history, approvals, or richer metadata that Kubernetes cannot reasonably hold.

## Current State

- The app is standalone under `components/idthw_hub/`.
- It uses Next.js 16, TypeScript, Tailwind CSS imports, and mostly hand-written CSS in `app/globals.css`.
- `make local` runs the app on port `3102`.
- Projects are read directly from Kubernetes Namespaces and are selectable from the top bar or the product-level **Projects** page. The shared project-name predicate excludes `default`, every `kube-*` namespace, the Hub control namespace, local storage infrastructure, and the `agent-gateway`, `ai`, `athenz`, `human`, and `idp` platform namespaces; reuse that predicate when project creation is added. There is no create-project flow yet.
- The catalog page fetches MCP server rows from the local Next API route `/api/mcp-servers`.
- `/api/mcp-servers` reads Kubernetes Deployments with MCP Hub labels and maps labels/annotations into the catalog model.
- `/api/mcp-servers` is also the service-authenticated registry contract used by MCP Gateway; it returns each stable route ID and Core MCP Proxy URL.
- `/api/mcp-cache-status` keeps an empty Hub access-token-cache field for compatibility and aggregates sanitized MCP Gateway OAuth-session metadata with separate access-token and ID-JAG cache summaries from `MCP_HUB_GATEWAY_STATUS_URL`. Both access-token and ID-JAG entries include only audiences, scope, cache time, expiry, and status. It must never expose token or session credential values.
- The Tools page calls the running MCP server with JSON-RPC `tools/list` without an Athenz access token; Kubernetes annotations are not the source of truth for tools. Protocol bootstrap and tool discovery are public, while `tools/call` remains protected.
- Hub-managed deployments probe Runtime Proxy `/healthz` for liveness and `/readyz` for readiness. Runtime Proxy readiness runs the MCP-standard `initialize`, `notifications/initialized`, `ping`, and `tools/list` lifecycle against the colocated MCP container. Catalog status is derived from the Kubernetes Deployment rollout/readiness state: `Active`, `In progress`, or `Unhealthy`.
- Curated custom permission requirements start as pure settings in `config/permission-presets.yaml`. `make local` generates the `mcp-hub-permission-presets` Kubernetes ConfigMap from that file. Permission settings distinguish `defaultPermission: none`, which intentionally gives every unlisted tool no additional downstream requirement, from `defaultPermission: not-defined`, which leaves unlisted tools visibly unconfigured and fail-closed when an explicit tool map is published. Authenticated Hub users can override one tool's requirements from its permission dialog; those partial overrides are stored in the MCP Deployment's `mcp.idthw.dev/tool-permissions` annotation and take precedence over the checked-in defaults. The client-configuration page checks current direct role memberships through ZMS with the Hub's server-side `idthw-hub.central-controller` certificate. Athenz remains the source of truth for real membership.
- Creating a Hub-managed MCP server uses the server-side `idthw-hub.central-controller` X.509 client and its current ZMS admin authority to apply three Athenz solution templates: custom `mcp_hub_managed_access` in the existing `mcp-hub.mcps.<project>` domain, custom `mcp_exchange_helpers` in each configured downstream role domain, and built-in `zts_instance_launch_provider` for service-certificate/Copper Argos enrollment. The managed-access template creates an initially empty `<mcp-key>-accessor` role, the `<mcp-key>-accessor-jag-exchanger` role with `mcp-hub.mcp-gateway`, the `zts.jag_exchange` policy from that exchanger role to the access role, and the `<mcp-key>-accessor-source-exchanger` role with the selected MCP service account. The downstream helper template requires its direct target role to exist and creates the corresponding MCP-service and Gateway exchange roles and policies; the target domain's resource owner remains responsible for that direct role and for authorizing the Hub operator until delegated request authentication is implemented. The existing imperative reconciliation remains as idempotent verification and repair after template application. Creation and update never add the signed-in user to the accessor role; the creator must use the same client-configuration access request as every other user. Saving a signed-in-user tool audience adds an idempotent `zts.token_source_exchange` assertion for that target domain to the server-specific source-exchange policy. The Hub verifies that the selected service exists, generates a dedicated RSA service key, registers its public key under the deterministic per-server key ID `idthw-hub-<mcp-key>` (truncated with a stable hash when necessary), and applies the certificate-provider template for that service; it never creates the project domain or downstream direct-access role. Multiple MCP servers may share one Athenz service account because their access roles, exchange policies, and public-key IDs are distinct. Updates preserve legacy key IDs already stored in Runtime Proxy configuration.
- The Hub-managed client-configuration flow starts with an authenticated access request. `POST /api/mcp-servers/<mcp-key>/access` adds the current signed-in user to that server's access role and idempotently creates or repairs its managed roles, memberships, JAG policy, and configured source-exchange assertions. It also reconciles a legacy shared Deployment scope to the per-server scope before the UI proceeds to permission verification and client configuration. It never deletes legacy Athenz roles or policies.
- Confirmed deletion of a Hub-managed MCP server removes that MCP's three server-specific access roles and its JAG/source-exchange policies before deleting the Kubernetes resources. It must not delete the project-owned Athenz service account, project domain, or legacy shared access resources.
- Hub-managed creation and update also idempotently apply the project-local `mcp-runtime-proxy-athenz-ca` ConfigMap from the Hub's configured Athenz CA. New Hub-managed servers store their private key in an immutable bootstrap Secret mounted only by Runtime Proxy. Runtime Proxy obtains an X.509 service certificate from ZTS, publishes the cert/key through a separate Secret mounted read-only by both Runtime Proxy and the MCP container at `/var/run/athenz/service.{cert,key}.pem`, and refreshes it every 24 hours using a resource-name-scoped Kubernetes Role. Both containers also receive the Athenz CA as `/var/run/athenz/ca.crt` and `/var/run/athenz/ca.cert.pem`. Runtime Proxy validates protected requests against the ZTS JWKS endpoint, exact managed audience, token expiry, and the server-specific `<mcp-key>-accessor` scope without downloading Athenz policy. Protocol bootstrap, `ping`, and `tools/list` remain public.
- For configured custom tool scopes, MCP Gateway sends only the scope outside the managed route scope through the internal downstream-scope header. Runtime Proxy verifies those scopes exist in the signed incoming AT, performs mTLS token exchange with the managed MCP service identity, publishes the exchanged AT at `/var/run/idthw-access-tokens/<tool>/<request-id>.jwt`, passes the exact path through MCP request `_meta`, and removes it after the response. The shared `emptyDir` is read/write only for Runtime Proxy and read-only for the MCP container. Do not replace the request-scoped layout with a shared per-tool file because concurrent users would overwrite each other.
- Permission setup must enumerate tools from the public live MCP `tools/list` result, not from the preset. The YAML plus Deployment overrides map custom execution requirements onto those tool names. Hub-managed user, Gateway, and MCP source-exchanger requirements are generated from the deployment's managed access scope and merged into every discovered tool. Permission dialogs show editable custom **Tool permissions** first and read-only **MCP access** defaults at the bottom; auto-expand the managed-default section only when a managed membership or policy is missing. Each direct requirement leads with its audience/Athenz domain and role. For Hub-managed servers, render the derived Gateway `<role>-jag-exchanger` and MCP-service `<role>-exchanger` memberships immediately below and indented from each owning direct-access row, before the final **Add permission** control. Edit mode should mirror the visible permission table: each helper keeps its editable member and role together with zero or more editable policies containing effect, action, and resource. Do not use a helper enable/disable checkbox. Each helper and each associated policy can be added or deleted, and helpers can target MCP Gateway, the selected MCP IAM account, or a custom service account. Keep **Add policy** compact and inside its helper. An empty helper list offers **Generate default helpers**; a customized list can reset to defaults. Saving persists these helper policy expectations and provisions only the managed source-domain exchange assertion; it does not grant downstream target-domain access by itself. Consumer-facing missing tool permissions link to the provider's shared permission guide instead of registering a Workflow Platform request. Hub-managed MCP access remains an idempotent direct grant handled separately in step 1.
- Direct tool-permission roles are selected from the live ZMS role list after an audience is entered; they are not free-text inputs. Keep a template's stored raw role visible immediately, automatically check it once when the form loads, and retain it as the selected value when the live list confirms it. For manually entered audiences, load the list when the user activates the required-role selector instead of fetching on every audience edit. Exclude the `admin` and `zts_instance_launch_provider` roles and every role ending in `-exchanger`, including `-jag-exchanger`, because those are administrative, infrastructure, or generated helper roles rather than direct tool-access roles. Place a compact live-role refresh control beside the selector. Apply this selector consistently in initial known-tool authoring and the live Tools permission editor; helper-role fields remain independently editable.
- Legacy MCP permission workflow ConfigMaps may remain for compatibility, but the current Workflow Platform queue does not read or execute them. Workflow Platform pages and mutations require the normal signed-in Hub session. Reusable workflow form templates are versioned ConfigMaps with a visible required user-defined ID, subject, application content, creation time, creator username, an optional operator-only operational link, and optional reorderable fields marked required or optional. Template fields support plain text or bullet options; a bullet-options field always contains at least one non-removable option. Authenticated users may create, update, and delete templates. An update preserves the ID and original creation audit fields, increments the version, and rejects stale edits. The template ID links to its signed-in registration form. Submitted applications snapshot the template version and operational link, are stored as separate creator-attributed ConfigMaps with pending or approved status, and reject submission from a stale registration form. Applicant-facing template data must not expose the operational link. The Permission requests page lists those applications. Normal per-request approval records the approver and timestamp only; it must never mutate Athenz memberships, policies, or other infrastructure. The explicitly labeled local Demo tools page is the sole exception: its bulk action idempotently adds `human.idjag-learner` to the existing `api:role.docs-getter`, `api:role.docs-poster`, and `api:role.docs-deleter` roles before approving every pending workflow application, and its confirmed reset action removes only those three memberships.
- Hub-managed server creation always presents the unlisted-tool default plus any known tool names and their downstream permission requirements immediately after IAM service-account selection, using the same direct/helper/policy editor as the live Tools page. New server and template drafts default unlisted tools to no additional downstream permission so MCP Gateway requests only the managed route scope; turning that option off explicitly blocks unlisted tools until they are configured. The known-tool list itself may remain empty because live tools may not be known until deployment. A known tool can be explicitly marked as requiring no additional permission; its empty requirement list is still stored so MCP Gateway receives an intentional managed-only tool mapping instead of treating the tool as unconfigured. Templates store the same settings in their Kubernetes Secret; template-based creation inherits them, lets the provider customize or remove them, and stores the final settings in the Deployment's `mcp.idthw.dev/tool-permissions` annotation. Creation and server update idempotently provision the corresponding managed source-exchange audience assertions, while downstream memberships remain external Athenz grants.
- `/api/mcp-servers` derives `toolScopes` from each configured tool's `<signed_in_user>` roles, merges the deployment's managed route scope into each one, and publishes `defaultToolPermission` separately. It also publishes `accessAudience`, defaulted from the first route-scope domain; Hub-managed manifests record the managed MCP domain explicitly so it matches Runtime Proxy's expected audience. MCP Gateway uses that audience for multi-domain Athenz access-token issuance and the exact `tools/call.params.name` mapping. An unmapped tool uses only the managed route scope when `defaultToolPermission` is `none`, and fails closed when it is `not-defined`. Legacy servers without explicit tool settings continue to use the Kubernetes `access-scope` annotation.
- On the client-configuration page, always keep up to five tool permission rows visible. When there are more than five tools, place only the remaining rows behind an `Expand tools` control so the next setup step remains immediately visible. Keep the expand/collapse control after the currently displayed tool rows.
- Permission detail dialogs use a compact table. The Athenz role value itself is the outbound link; do not add a redundant `Open in Athenz` action beside it.
- `<signed_in_user>` is the only supported dynamic permission-preset member. It must occupy the complete `member` value. Unknown or partial placeholders are configuration errors and must never be skipped in a way that could produce a false ready state.
- Most navigation and not-yet-implemented controls are disabled so missing surfaces are obvious.
- Public images live in `public/icons/` and are referenced as `/icons/<file>`.
- Selectable MCP server and template icons live in `public/mcp_icons/`. Resources store only the image filename ID in `mcp.idthw.dev/icon`; missing or unknown IDs fall back to name initials. A selected template icon is the default for servers created from that template.
- Selecting a template during MCP server creation shows the template's container source, image, port, protocol, path, command, and arguments in the same layout as direct setup, but those template-owned values are read-only. Direct MCP server creation does not suggest container images; template authoring retains its curated image suggestions.
- For the first real-data slice, prefer reading Kubernetes Deployments/Services with MCP Hub labels and annotations over adding a database.

## Recommended PR Order

Prefer small PRs that establish real product contracts:

1. Add a read-only MCP detail page for catalog rows.
2. Add a mock `Register MCP server` page with fields for name, project, image, transport, port, service account, replicas, tools, and managed policies.
3. Add local mock persistence for registered MCP servers.
4. Add a generated Kubernetes manifest preview from the registration form.
5. Wire a backend action/API that can create a Kubernetes Deployment and Service.
6. Add health, logs, and rollout status once deployment creation exists.

## Data Model Hints

Keep these concepts separate:

- MCP server identity: name, project, description, icon, owner/provider project.
- Runtime deployment: image, transport, port, replicas, service account, env vars, health checks.
- Managed policies: provider-owned default policy templates for tools.
- Grants/attachments: consumer/project-owned ID-JAG permissions that allow agents or users to call the MCP tools.

Initial Kubernetes metadata can be modeled with labels and annotations such as:

- `app.kubernetes.io/part-of=mcp-hub`
- `mcp.idthw.dev/alias=<optional-display-alias>` as an annotation when the alias contains spaces.
- `mcp.idthw.dev/id=<globally-unique-route-id>` is the stable ID used in `/mcp/{id}`; it defaults to the deployment name.
- `mcp.idthw.dev/access-scope=<space-separated-Athenz-scopes>` optionally tells MCP Gateway which per-user AT scope to request for this route.
- `mcp.idthw.dev/project=<project-name>` is required for catalog listing.
- `mcp.idthw.dev/description=<description>`
- `mcp.idthw.dev/public-url=<externally-reachable-mcp-url>` for client configuration and live tool discovery.
- `mcp.idthw.dev/transport=<transport>`

## UI Guidance

- Keep the screen operational and dense, similar to an internal control plane.
- Keep the black top bar, gray sidebar, white content area, tabbed catalog, filter row, and flat table style unless the user asks to redesign.
- Use disabled controls for planned surfaces that are not wired yet.
- Avoid company-specific names, URLs, or screenshots in source.
- Keep copy generic to IDTHW, MCP Hub, ID-JAG, Kubernetes, and Athenz.

## Commands

```sh
make local
npm run lint
npm run build
```

`npm run build` may need permission in sandboxed environments because Next/Turbopack can spawn workers and bind local ports.

## Next.js Note

This project uses Next.js 16. If framework behavior is unclear, check the installed docs or existing app patterns before assuming older Next.js conventions.
