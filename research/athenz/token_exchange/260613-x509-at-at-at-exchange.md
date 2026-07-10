# Goal

The goal of this document is to perform a delegated token exchange flow using X.509 client certificates, from obtaining an access token through to a second-hop AT→AT exchange via Athenz ZTS, with the following steps:

<!-- TOC depthFrom:2 depthTo:2 -->

- [Step 1. Fetch certificate-based tokens](#step-1-fetch-certificate-based-tokens)
- [Step 2. Token Exchange, with may_act](#step-2-token-exchange-with-may_act)
- [Step 3. Token Exchange Again (NOT AVAILABLE)](#step-3-token-exchange-again-not-available)

<!-- /TOC -->

<details>
<summary>Last verified on Jun 13, 2026 — 🟡 In Progress</summary>

| # | Date         | Confirmed Working                                                                                        |
|---|--------------|----------------------------------------------------------------------------------------------------------|
| 1 | Jun 13, 2026 | 🟡 — setup tokens fetched; exchange missing `may_act` in output; second exchange not available in Athenz |

</details>

# Steps

Here is the procedure to get to the goals.

## Step 1. Fetch certificate-based tokens

Complete the main tutorial through [16-id-jag.md](../../../tutorials/16-id-jag.md), then fetch `_at` and `_actor_id_token`:

```sh
_role_scope="api:role.docs-getter api:role.mcp-accessor"
_mcp_actor="api.api-mcp"

_at=$(./tools/athenz/fetch-access-token.sh \
  ./keys/idjag-learner.crt \
  ./keys/idjag-learner.key \
  "$_role_scope" \
  --actor "$_mcp_actor")

_actor_id_token=$(./tools/athenz/fetch-actor-token.sh \
  ./keys/api-mcp.crt \
  ./keys/api-mcp.key \
  api.api-mcp)
```

## Step 2. Token Exchange, with may_act

> [!NOTE]
> Passing `actor=api.api` does not result in a `may_act` claim in the exchanged token. This is under investigation.

```sh
_exchange_scope="api:role.docs-getter"

_delegated_at=$(./tools/athenz/exchange-access-token.sh \
  ./keys/api-mcp.crt \
  ./keys/api-mcp.key \
  "$_at" \
  "$_exchange_scope" \
  --actor-token "$_actor_id_token" \
  --actor api.api \
  --token-only)

echo "$_delegated_at" | jq -R 'split(".") | .[1] | @base64d | fromjson'
```

```sh
# {
#   "sub": "human.idjag-learner",
#   "scp": [
#     "docs-getter"
#   ],
#   "ver": 1,
#   "iss": "athenz-zts-server-b485bd456-lxjkl",
#   "client_id": "api.api-mcp",
#   "aud": "api",
#   "uid": "api.api-mcp",
#   "act": {
#     "sub": "api.api-mcp"
#   },
#   "auth_time": 1781352416,
#   "scope": "docs-getter",
#   "exp": 1781356016,
#   "iat": 1781352416,
#   "jti": "a73bec8f-41f4-4471-81c4-661c9b513121"
# }
```

## Step 3. Token Exchange Again (NOT AVAILABLE)

> [!NOTE]
> Athenz does not allow a second token exchange on an already-delegated token. A further AT→AT hop from `_delegated_at` is not supported.

# Reference

- [Athenz PR #3388 — support ID-JAG AT→AT exchange](https://github.com/AthenZ/athenz/pull/3388)
