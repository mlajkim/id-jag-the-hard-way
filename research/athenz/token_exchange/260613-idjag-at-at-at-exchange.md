# Goal

The goal of this document is to model a full ID-JAG delegated exchange chain from Claude to `mcp-hub`, then to `mcp`, then to the final API role, and reproduce the current delegated exchange failure from Athenz ZTS, with the following steps:

<!-- TOC depthFrom:2 depthTo:2 -->

- [Setup 1. Create the mcp-hub access and JAG exchange roles](#setup-1-create-the-mcp-hub-access-and-jag-exchange-roles)
- [Setup 2. Create the mcp-hub service identity](#setup-2-create-the-mcp-hub-service-identity)
- [Setup 3. Allow mcp-hub to use api tokens as exchange input](#setup-3-allow-mcp-hub-to-use-api-tokens-as-exchange-input)
- [Setup 4. Allow mcp-hub to exchange into mcp-accessor](#setup-4-allow-mcp-hub-to-exchange-into-mcp-accessor)
- [Step 1. Fetch an id_token for the Claude service client](#step-1-fetch-an-id_token-for-the-claude-service-client)
- [Step 2. Exchange the id_token for ID_JAG](#step-2-exchange-the-id_token-for-id_jag)
- [Step 3. Fetch an mcp-hub access token with ID_JAG](#step-3-fetch-an-mcp-hub-access-token-with-id_jag)
- [Step 4. Fetch actor id_tokens for mcp-hub and mcp](#step-4-fetch-actor-id_tokens-for-mcp-hub-and-mcp)
- [Step 5. Reproduce the mcp-hub to mcp exchange failure](#step-5-reproduce-the-mcp-hub-to-mcp-exchange-failure)
- [Step 6. Continue with the intended mcp to API exchange](#step-6-continue-with-the-intended-mcp-to-api-exchange)
- [Clean-up 7. Delete temporary test resources](#clean-up-7-delete-temporary-test-resources)

<!-- /TOC -->

<details>
<summary>Last verified on Jul 10, 2026 — ✅ Success</summary>

| # | Date         | Confirmed Working                                                                           |
|---|--------------|---------------------------------------------------------------------------------------------|
| 1 | Jun 13, 2026 | 🟡 — setup tokens fetched; exchange blocked pending Athenz PR #3388                         |
| 2 | Jul 10, 2026 | ✅ — setup completed successfully as expected; 👍 mcp-hub to mcp exchange failed as expected |

</details>

# Prerequisites

This tutorial requires the following to be completed:

- [16-id-jag.md](../../../tutorials/16-id-jag.md)

# Steps

Here is the procedure to get to the goals. The setup sections create test-only Athenz objects; the core reproduction starts at Step 1.

## Setup 1. Create the mcp-hub access and JAG exchange roles

Create `api:role.mcp-hub-accessor` as the first-hop role for the hub. This is intentionally separate from `mcp-accessor`, which remains the role for the MCP layer.

```sh
./tools/athenz/create-role.sh api mcp-hub-accessor
./tools/athenz/add-role-member.sh api mcp-hub-accessor human.idjag-learner
```

```sh
#   ✔  Role created: api:role.mcp-hub-accessor
#   ✔  human.idjag-learner  →  api:role.mcp-hub-accessor
```

Because the ID_JAG token will request `api:role.mcp-hub-accessor`, create the matching tutorial-style `mcp-hub-accessor-jag-exchanger` role and grant `human.idjag-learner.claude` permission to perform JAG exchange into that target role:

```sh
./tools/athenz/create-role.sh api mcp-hub-accessor-jag-exchanger
./tools/athenz/add-policy.sh api mcp-hub-accessor-jag-exchanger zts.jag_exchange role.mcp-hub-accessor
./tools/athenz/add-role-member.sh api mcp-hub-accessor-jag-exchanger human.idjag-learner.claude
```

```sh
#   ✔  Role created: api:role.mcp-hub-accessor-jag-exchanger
#   ✔  Policy created: api:policy.mcp-hub-accessor-jag-exchanger_zts_jag_exchange_role_mcp-hub-accessor
#   ✔  human.idjag-learner.claude  →  api:role.mcp-hub-accessor-jag-exchanger
```

## Setup 2. Create the mcp-hub service identity

Create the temporary `api.mcp-hub` service identity and fetch its service certificate:

```sh
./tools/athenz/create-private-key.sh ./keys/api-mcp-hub
./tools/athenz/create-service.sh api mcp-hub ./keys/api-mcp-hub.public.key
./tools/athenz/enable-cert-provider.sh api mcp-hub
./tools/athenz/fetch-cert.sh api mcp-hub ./keys/api-mcp-hub.key v1
```

```sh
#   ·  Generating RSA key pair for: ./keys/api-mcp-hub...
#   ✔  Keys generated: ./keys/api-mcp-hub.key, ./keys/api-mcp-hub.public.key
#   ·  Registering Service: api.mcp-hub...
#   ✔  Service registered: api.mcp-hub
#   ·  Enabling ZTS Certificate Provider for api.mcp-hub...
#   ✔  ZTS Certificate Provider enabled for api.mcp-hub
#   ·  Fetching X.509 Certificate for api.mcp-hub...
#   ✔  Certificate saved to: ./keys/api-mcp-hub.crt
```

## Setup 3. Allow mcp-hub to use api tokens as exchange input

The base token-exchange tutorial already creates `api:role.to-api-exchanger` and grants it `zts.token_source_exchange` on the `api` domain. That role controls who may use an existing `api` access token as the subject token in a token exchange.

For this research flow, add the temporary `api.mcp-hub` service as a member of that existing source-exchange role. Do not create or delete the `to-api-exchanger` role itself here; it belongs to the completed tutorial baseline.

```sh
./tools/athenz/add-role-member.sh api to-api-exchanger api.mcp-hub
```

```sh
#   ✔  api.mcp-hub  →  api:role.to-api-exchanger
```

## Setup 4. Allow mcp-hub to exchange into mcp-accessor

Create the matching target-exchange role for `mcp-accessor`, then attach its policy and member:

```sh
./tools/athenz/create-role.sh api mcp-accessor-exchanger
./tools/athenz/add-policy.sh api mcp-accessor-exchanger zts.token_target_exchange api:role.mcp-accessor
./tools/athenz/add-role-member.sh api mcp-accessor-exchanger api.mcp-hub
```

```sh
#   ✔  Role created: api:role.mcp-accessor-exchanger
#   ✔  Policy created: api:policy.mcp-accessor-exchanger_zts_token_target_exchange_api_role_mcp-accessor
#   ✔  api.mcp-hub  →  api:role.mcp-accessor-exchanger
```

The final `mcp` to API hop uses the existing `docs-getter` role and the existing `api.api-mcp` exchange permissions from the base tutorial.

## Step 1. Fetch an id_token for the Claude service client

Enable Direct Access Grants for `human.idjag-learner.claude`, then fetch an `id_token` for the Keycloak username `idjag-learner`:

```sh
./tools/keycloak/set-direct-access-grants.sh human.idjag-learner.claude true
_client_secret=$(./tools/keycloak/get-client-secret.sh human.idjag-learner.claude)
_id_token=$(./tools/keycloak/get-id-token.sh human.idjag-learner.claude "$_client_secret" idjag-learner)
```

```sh
#   ·  Fetching Keycloak admin token...
#   ·  Looking up UUID for client human.idjag-learner.claude...
#   ·  Fetching client human.idjag-learner.claude...
#   ·  Setting Direct Access Grants for human.idjag-learner.claude: true...
#   ✔  Direct Access Grants set for human.idjag-learner.claude: true
#   ·  Fetching id_token from Keycloak for Keycloak username: idjag-learner, client: human.idjag-learner.claude...
#   ✔  id_token issued for Keycloak username: idjag-learner
# {
#   "alg": "RS256",
#   "typ": "JWT",
#   "kid": "jio8OS-7FzKy8UfOCol-zj1946k1y1JyC6Z6D676WKc"
# }
# {
#   "iss": "http://localhost:34443/realms/master",
#   "aud": "human.idjag-learner.claude",
#   "typ": "ID",
#   "azp": "human.idjag-learner.claude",
#   "preferred_username": "idjag-learner",
#   "email": "idjag-learner@athenz.io"
#   ...
# }
```

## Step 2. Exchange the id_token for ID_JAG

Exchange the Keycloak `id_token` for an ID_JAG token scoped to the user roles needed across the full intended chain:

```sh
_id_jag_scope="api:role.docs-getter api:role.mcp-accessor api:role.mcp-hub-accessor"

_id_jag=$(./tools/athenz/fetch-id-jag.sh \
  ./keys/human-idjag-learner-claude.crt \
  ./keys/human-idjag-learner-claude.key \
  "$_id_token" \
  "$_id_jag_scope")
```

```sh
#   ·  Exchanging id_token for ID_JAG (scope: api:role.docs-getter api:role.mcp-accessor api:role.mcp-hub-accessor)...
#   ✔  ID_JAG issued (scope: api:role.docs-getter api:role.mcp-accessor api:role.mcp-hub-accessor)
# {
#   "kid": "athenz-zts-server-b485bd456-lxjkl",
#   "typ": "N_A",
#   "alg": "RS256"
# }
# {
#   "sub": "human.idjag-learner",
#   "aud": "https://athenz-zts-server.athenz:4443/zts/v1",
#   "client_id": "human.idjag-learner.claude",
#   "scope": "docs-getter mcp-accessor mcp-hub-accessor"
# }
```

## Step 3. Fetch an mcp-hub access token with ID_JAG

Request an access token for the full role set and set `api.mcp-hub` as the intended actor:

```sh
_hub_scope="api:role.docs-getter api:role.mcp-accessor api:role.mcp-hub-accessor"
_hub_actor="api.mcp-hub"

_hub_at=$(./tools/athenz/fetch-access-token-with-id-jag.sh \
  ./keys/human-idjag-learner-claude.crt \
  ./keys/human-idjag-learner-claude.key \
  "$_id_jag" \
  "$_hub_scope" \
  --actor "$_hub_actor")
```

```sh
#   ·  Fetching Access Token with ID_JAG for scope: api:role.docs-getter api:role.mcp-accessor api:role.mcp-hub-accessor...
#   ✔  Access token issued with ID_JAG for scope: api:role.docs-getter api:role.mcp-accessor api:role.mcp-hub-accessor
# {
#   "kid": "athenz-zts-server-b485bd456-lxjkl",
#   "typ": "at+jwt",
#   "alg": "RS256"
# }
# {
#   "sub": "human.idjag-learner",
#   "aud": "api",
#   "scp": [
#     "docs-getter",
#     "mcp-accessor",
#     "mcp-hub-accessor"
#   ],
#   "uid": "human.idjag-learner",
#   "client_id": "human.idjag-learner.claude"
# }
```

## Step 4. Fetch actor id_tokens for mcp-hub and mcp

Fetch actor `id_token` values for both service identities in the intended chain:

```sh
_mcp_hub_actor_id_token=$(./tools/athenz/fetch-actor-token.sh \
  ./keys/api-mcp-hub.crt \
  ./keys/api-mcp-hub.key \
  api.mcp-hub)

_mcp_actor_id_token=$(./tools/athenz/fetch-actor-token.sh \
  ./keys/api-mcp.crt \
  ./keys/api-mcp.key \
  api.api-mcp)
```

```sh
#   ·  Fetching actor id_token from Athenz ZTS for client: api.mcp-hub...
#   ✔  Actor id_token issued for client: api.mcp-hub
# {
#   "sub": "api.mcp-hub",
#   "aud": "api.mcp-hub",
#   "client_id": "api.mcp-hub"
# }
#   ·  Fetching actor id_token from Athenz ZTS for client: api.api-mcp...
#   ✔  Actor id_token issued for client: api.api-mcp
# {
#   "sub": "api.api-mcp",
#   "aud": "api.api-mcp",
#   "client_id": "api.api-mcp"
# }
```

## Step 5. Reproduce the mcp-hub to mcp exchange failure

Attempt the first delegated AT→AT exchange: `api.mcp-hub` exchanges the hub token into `mcp-accessor` for `api.api-mcp`. This failure is expected today: the ID_JAG-issued subject access token does not contain the `may_act` claim required for delegated token exchange.

```sh
_mcp_scope="api:role.mcp-accessor"

./tools/athenz/exchange-access-token.sh \
  ./keys/api-mcp-hub.crt \
  ./keys/api-mcp-hub.key \
  "$_hub_at" \
  "$_mcp_scope" \
  --actor-token "$_mcp_hub_actor_id_token" \
  --actor api.api-mcp
```

```sh
#   ·  Exchanging access token for scope: api:role.mcp-accessor...
# {
#   "code": 400,
#   "message": "Invalid subject token: missing may_act claim"
# }
```

> [!NOTE]
> Delegated AT→AT exchange with a subject token obtained via ID_JAG is tracked in Athenz PR #3388.

## Step 6. Continue with the intended mcp to API exchange

After the mcp-hub to mcp exchange succeeds, the intended final hop is for `api.api-mcp` to exchange the MCP token into the final API role `docs-getter`:

```sh
_api_scope="api:role.docs-getter"

_mcp_at=$(./tools/athenz/exchange-access-token.sh \
  ./keys/api-mcp-hub.crt \
  ./keys/api-mcp-hub.key \
  "$_hub_at" \
  "$_mcp_scope" \
  --actor-token "$_mcp_hub_actor_id_token" \
  --actor api.api-mcp \
  --token-only)

./tools/athenz/exchange-access-token.sh \
  ./keys/api-mcp.crt \
  ./keys/api-mcp.key \
  "$_mcp_at" \
  "$_api_scope" \
  --actor-token "$_mcp_actor_id_token" \
  --actor api
```

```sh
# This step is not reached until Step 5 returns an exchanged `_mcp_at`.
```

## Clean-up 7. Delete temporary test resources

Delete the temporary `api.mcp-hub` service identity, remove only the temporary `api.mcp-hub` membership from the tutorial-owned `to-api-exchanger` role, and then delete the temporary roles and policies created only for this test:

```sh
./tools/athenz/delete-service.sh api mcp-hub
./tools/athenz/delete-role-member.sh api to-api-exchanger api.mcp-hub
./tools/athenz/delete-policy.sh api mcp-hub-accessor-jag-exchanger_zts_jag_exchange_role_mcp-hub-accessor
./tools/athenz/delete-role.sh api mcp-hub-accessor-jag-exchanger
./tools/athenz/delete-policy.sh api mcp-accessor-exchanger_zts_token_target_exchange_api_role_mcp-accessor
./tools/athenz/delete-role.sh api mcp-accessor-exchanger
./tools/athenz/delete-role.sh api mcp-hub-accessor
```

```sh
#   ·  Deleting service api.mcp-hub...
#   ✔  Service deleted or already absent: api.mcp-hub
#   ✔  Role member deleted or already absent: api.mcp-hub  →  api:role.to-api-exchanger
#   ✔  Policy deleted or already absent: api:policy.mcp-hub-accessor-jag-exchanger_zts_jag_exchange_role_mcp-hub-accessor
#   ✔  Role deleted or already absent: api:role.mcp-hub-accessor-jag-exchanger
#   ✔  Policy deleted or already absent: api:policy.mcp-accessor-exchanger_zts_token_target_exchange_api_role_mcp-accessor
#   ✔  Role deleted or already absent: api:role.mcp-accessor-exchanger
#   ✔  Role deleted or already absent: api:role.mcp-hub-accessor
```

# Reference

- [Athenz PR #3388 — support ID-JAG AT→AT exchange](https://github.com/AthenZ/athenz/pull/3388)
- [RFC 7521 — Assertion Framework](https://datatracker.ietf.org/doc/html/rfc7521)
- [RFC 8693 — Token Exchange](https://datatracker.ietf.org/doc/html/rfc8693)
