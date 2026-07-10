# Goal

The goal of this document is to obtain a delegated access token from Athenz ZTS using an ID_JAG token, then exchange it with the actor-token shape required by delegated AT→AT exchange.

For the full `Claude → mcp-hub → mcp → API` chain, see [260613-idjag-at-at-at-exchange.md](./260613-idjag-at-at-at-exchange.md).

<!-- TOC depthFrom:2 depthTo:2 -->

- [Step 1. Fetch an ID_JAG token](#step-1-fetch-an-id_jag-token)
- [Step 2. Get a delegated Access Token with ID_JAG](#step-2-get-a-delegated-access-token-with-id_jag)
- [Step 3. Exchange the delegated Access Token](#step-3-exchange-the-delegated-access-token)
- [Clean-up 4. Disable temporary Direct Access Grants](#clean-up-4-disable-temporary-direct-access-grants)

<!-- /TOC -->

<details>
<summary>Last verified on Jul 10, 2026 — ✅ Success</summary>

| # | Date         | Confirmed Working                                                                                       |
|---|--------------|---------------------------------------------------------------------------------------------------------|
| 1 | Jun 20, 2026 | 🟡 — ID_JAG access token worked; delegated AT→AT exchange was pending Athenz PR #3388                   |
| 2 | Jul 10, 2026 | ✅ — ID_JAG access token and delegated AT→AT exchange worked with `may_act` and actor-token validation |

</details>

# Steps

Here is the procedure to get to the goals.

## Step 1. Fetch an ID_JAG token

Complete the main tutorial through [16-id-jag.md](../../../tutorials/16-id-jag.md), then enable Direct Access Grants for `human.idjag-learner.claude`.

Fetch an ID_JAG token for Keycloak username `idjag-learner`:

```sh
./tools/keycloak/set-direct-access-grants.sh human.idjag-learner.claude true
_client_secret=$(./tools/keycloak/get-client-secret.sh human.idjag-learner.claude)
_id_token=$(./tools/keycloak/get-id-token.sh human.idjag-learner.claude "$_client_secret" idjag-learner)

_id_jag_scope="api:role.docs-getter api:role.mcp-accessor"
_id_jag=$(./tools/athenz/fetch-id-jag.sh \
  ./keys/human-idjag-learner-claude.crt \
  ./keys/human-idjag-learner-claude.key \
  "$_id_token" \
  "$_id_jag_scope")
```

```sh
#   ·  Fetching id_token from Keycloak for Keycloak username: idjag-learner, client: human.idjag-learner.claude...
#   ✔  id_token issued for Keycloak username: idjag-learner
# {
#   "alg": "RS256",
#   "typ": "JWT",
#   "kid": "<key-id>"
# }
# {
#   "aud": "human.idjag-learner.claude",
#   "typ": "ID",
#   "azp": "human.idjag-learner.claude",
#   "preferred_username": "idjag-learner",
#   ...
# }
#   ·  Exchanging id_token for ID_JAG (scope: api:role.docs-getter api:role.mcp-accessor)...
#   ✔  ID_JAG issued (scope: api:role.docs-getter api:role.mcp-accessor)
# {
#   "typ": "oauth-id-jag+jwt",
#   "alg": "RS256",
#   "kid": "<key-id>"
# }
# {
#   "sub": "human.idjag-learner",
#   "aud": "https://athenz-zts-server.athenz:4443/zts/v1",
#   "scope": "api:role.docs-getter api:role.mcp-accessor",
#   "client_id": "human.idjag-learner.claude",
#   ...
# }
```

## Step 2. Get a delegated Access Token with ID_JAG

Request a delegated access token by passing `--actor api.api-mcp`. The resulting token should contain `may_act.sub: api.api-mcp`, which tells ZTS that `api.api-mcp` is the next allowed actor.

```sh
_at_scope="api:role.docs-getter api:role.mcp-accessor"
_at_actor="api.api-mcp"

_at=$(./tools/athenz/fetch-access-token-with-id-jag.sh \
  ./keys/human-idjag-learner-claude.crt \
  ./keys/human-idjag-learner-claude.key \
  "$_id_jag" \
  "$_at_scope" \
  --actor "$_at_actor")
```

```sh
#   ·  Fetching Access Token with ID_JAG for scope: api:role.docs-getter api:role.mcp-accessor...
#   ✔  Access token issued with ID_JAG for scope: api:role.docs-getter api:role.mcp-accessor
# {
#   "typ": "at+jwt",
#   "alg": "RS256",
#   "kid": "<key-id>"
# }
# {
#   "sub": "human.idjag-learner",
#   "scp": [
#     "docs-getter",
#     "mcp-accessor"
#   ],
#   "client_id": "human.idjag-learner.claude",
#   "aud": "api",
#   "act": {
#     "sub": "human.idjag-learner.claude"
#   },
#   "may_act": {
#     "sub": "api.api-mcp"
#   },
#   ...
# }
```

## Step 3. Exchange the delegated Access Token

Fetch an actor `id_token` for `api.api-mcp`, then exchange the delegated access token into the final `docs-getter` scope. The actor token proves the current actor and must match the `may_act.sub` from Step 2.

```sh
_mcp_actor_id_token=$(./tools/athenz/fetch-actor-token.sh \
  ./keys/api-mcp.crt \
  ./keys/api-mcp.key \
  api.api-mcp)

_api_scope="api:role.docs-getter"

./tools/athenz/exchange-access-token.sh \
  ./keys/api-mcp.crt \
  ./keys/api-mcp.key \
  "$_at" \
  "$_api_scope" \
  --actor-token "$_mcp_actor_id_token" \
  --actor api
```

```sh
#   ·  Fetching actor id_token from Athenz ZTS for client: api.api-mcp...
#   ✔  Actor id_token issued for client: api.api-mcp
# {
#   "sub": "api.api-mcp",
#   "aud": "api.api-mcp",
#   ...
# }
#   ·  Exchanging access token for scope: api:role.docs-getter...
#   ✔  Access token exchanged for scope: api:role.docs-getter
# {
#   "typ": "at+jwt",
#   "alg": "RS256",
#   "kid": "<key-id>"
# }
# {
#   "sub": "human.idjag-learner",
#   "scp": [
#     "docs-getter"
#   ],
#   "client_id": "api.api-mcp",
#   "aud": "api",
#   "uid": "api.api-mcp",
#   "act": {
#     "sub": "api.api-mcp",
#     "act": {
#       "sub": "human.idjag-learner.claude"
#     }
#   },
#   "may_act": {
#     "sub": "api"
#   },
#   ...
# }
# {
#   "access_token": "...",
#   "token_type": "Bearer",
#   "expires_in": 3600,
#   "scope": "api:role.docs-getter",
#   ...
# }
```

## Clean-up 4. Disable temporary Direct Access Grants

If Direct Access Grants were enabled only for this research file, disable them after the test:

```sh
./tools/keycloak/set-direct-access-grants.sh human.idjag-learner.claude false
```

```sh
#   ·  Fetching Keycloak admin token...
#   ·  Looking up UUID for client human.idjag-learner.claude...
#   ·  Fetching client human.idjag-learner.claude...
#   ·  Setting Direct Access Grants for human.idjag-learner.claude: false...
#   ✔  Direct Access Grants set for human.idjag-learner.claude: false
```

# Reference

- [Athenz PR #3388 — support ID-JAG AT→AT exchange](https://github.com/AthenZ/athenz/pull/3388)
- [Athenz PR #3390 — support subsequent delegated AT→AT exchange](https://github.com/AthenZ/athenz/pull/3390)
- [RFC 7521 — Assertion Framework](https://datatracker.ietf.org/doc/html/rfc7521)
- [RFC 8693 — Token Exchange](https://datatracker.ietf.org/doc/html/rfc8693)
