# Goal

The goal of this document is to reproduce the "Invalid subject token: missing may_act claim" error from Athenz ZTS by performing a token exchange with an AT that was obtained without the `actor` parameter, with the following steps:

<!-- TOC depthFrom:2 depthTo:2 -->

- [Step 1. Fetch an actor-less access token](#step-1-fetch-an-actor-less-access-token)
- [Step 2. Token Exchange](#step-2-token-exchange)
- [Clean-up 3. Clear shell variables](#clean-up-3-clear-shell-variables)

<!-- /TOC -->

<details>
<summary>Last verified on Jun 14, 2026 — ✅ Success</summary>

| # | Date         | Confirmed Working                                                                         |
|---|--------------|-------------------------------------------------------------------------------------------|
| 1 | Jun 14, 2026 | ✅ — error reproduced as expected; root cause confirmed as missing `actor` param in Step 1 |

</details>

# Steps

Here is the procedure to get to the goals.

## Step 1. Fetch an actor-less access token

Complete the main tutorial through [16-id-jag.md](../../../tutorials/16-id-jag.md), then fetch an actor-less `_at` and an `_actor_id_token`:

```sh
_role_scope="api:role.docs-getter api:role.mcp-accessor"

_at=$(./tools/athenz/fetch-access-token.sh \
  ./keys/idjag-learner.crt \
  ./keys/idjag-learner.key \
  "$_role_scope")

_actor_id_token=$(./tools/athenz/fetch-actor-token.sh \
  ./keys/api-mcp.crt \
  ./keys/api-mcp.key \
  api.api-mcp)
```

## Step 2. Token Exchange

Attempting the exchange with the actor-less `_at` produces the expected error.

```sh
_exchange_scope="api:role.docs-getter"

./tools/athenz/exchange-access-token.sh \
  ./keys/api-mcp.crt \
  ./keys/api-mcp.key \
  "$_at" \
  "$_exchange_scope" \
  --actor-token "$_actor_id_token" \
  --actor test.test | jq
```

```sh
# {
#   "code": 400,
#   "message": "Invalid subject token: missing may_act claim"
# }
```

## Clean-up 3. Clear shell variables

This research file only creates temporary shell variables and tokens. Clear them when done:

```sh
unset _role_scope _at _actor_id_token _exchange_scope
```

# Reference

*None*
