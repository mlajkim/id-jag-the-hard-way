# Goal

Reproduce whether `api.mcp-hub` can keep exchanging an access token issued for MCP Hub into new tokens with the same audience and scopes, continuing after the original token expires.

<!-- TOC depthFrom:2 depthTo:2 -->

- [Setup 1. Refresh the learner and mcp-hub certificates](#setup-1-refresh-the-learner-and-mcp-hub-certificates)
- [Setup 2. Prepare the mcp-hub access scopes](#setup-2-prepare-the-mcp-hub-access-scopes)
- [Setup 3. Allow mcp-hub to use api tokens as exchange input](#setup-3-allow-mcp-hub-to-use-api-tokens-as-exchange-input)
- [Setup 4. Allow mcp-hub to exchange into the same scopes](#setup-4-allow-mcp-hub-to-exchange-into-the-same-scopes)
- [Step 1. Issue the initial access token for mcp-hub](#step-1-issue-the-initial-access-token-for-mcp-hub)
- [Step 2. Exchange the token twice as mcp-hub](#step-2-exchange-the-token-twice-as-mcp-hub)
- [Step 3. Keep exchanging beyond the original token expiry](#step-3-keep-exchanging-beyond-the-original-token-expiry)
- [Step 4. Repeat with delegated tokens](#step-4-repeat-with-delegated-tokens)
- [Clean-up 5. Delete the temporary exchange grants](#clean-up-5-delete-the-temporary-exchange-grants)

<!-- /TOC -->

<details>
<summary>Last verified on Oct 27, 2026 — 🟡 Source checked; live reproduction pending</summary>

| # | Date | Confirmed Working |
|---|------|-------------------|
| 1 | Oct 27, 2026 | Source inspected at checkout `fa7a5b4343e2c309317e2dbc3e4e415bdfecc692`, latest release `v1.12.50`, and upstream master `faa895dfc7d58345c63ba8eb974f7f1c6e02b05a`; the seven relevant lifetime, dispatch, scope, and exchange methods are identical |
| 2 | Oct 27, 2026 | The [Aug 29 impersonation record](./260829-x509-imp-imp-exchange.md#step-2-exchange-the-at-by-impersonation) records input `exp=1787972661` and child `exp=1787972667`; it supports one exchange extending expiry, not a repeated chain |
| 3 | Oct 27, 2026 | Live ZTS build, HTTP results, and continued exchange after original-token rejection remain unverified; result blocks below are expected examples |
| 4 | Oct 27, 2026 | ✅ — `python3 -B -m unittest discover -s tools/athenz/tests -p 'test_exchange_expiry.py' -v`: 10 tests passed with synthetic responses and a simulated clock; no identity files or live endpoints used |
| 5 | Oct 27, 2026 | ✅ — Bash syntax, all nine independent command/result pairs, local links, TOC, and whitespace checked |

LY AI Policy rule 1 prohibits this session from handling certificates, keys, or tokens. These live commands are prepared for the repository owner to run. [Policy and owner-managed removal procedure](https://github.com/secdev-whc/ai-cli-hardening). Record the actual ZTS build with the live results; the source checkout does not identify the running server.

</details>

# Prerequisites

This tutorial requires the following to be completed:

1. Complete the main [ID-JAG The Hard Way tutorial](https://github.com/mlajkim/id-jag-the-hard-way/tree/main/tutorials)
1. Create the `api.mcp-hub` identity and its local key pair using [the Aug 29 X.509 setup](./260829-x509-imp-imp-exchange.md#setup-3-create-the-mcp-hub-service-identity), or reuse that identity if it already exists
1. Run each block from the `idthw/` repository root with the local lab and port-forwards running, Bash, `jq`, and Python 3 available

# Steps

Here is the procedure to get to the goals.

## Setup 1. Refresh the learner and mcp-hub certificates

Use the same identities as the Aug 29 patterns: `human.idjag-learner` supplies the original subject, and `api.mcp-hub` authenticates every exchange. Those examples share the `api` audience across services, so the `mcp-hub-accessor` role identifies MCP Hub access; `aud=api` alone does not identify the individual hub service.

```sh
./tools/athenz/fetch-cert.sh human idjag-learner ./keys/idjag-learner.key v1 &&
./tools/athenz/fetch-cert.sh api mcp-hub ./keys/api-mcp-hub.key v1
```

```sh
# Expected success excerpts; not captured output
#   ✔  Certificate saved to: ./keys/idjag-learner.crt
#   ✔  Certificate saved to: ./keys/api-mcp-hub.crt
```

## Setup 2. Prepare the mcp-hub access scopes

Keep the original three scopes from the Aug 29 flow: `docs-getter`, `mcp-accessor`, and `mcp-hub-accessor`, all in `api`. The main tutorial provides `api:role.docs-getter`; create or reuse the two additional roles and give the learner membership.

```sh
./tools/athenz/create-role.sh api mcp-accessor &&
./tools/athenz/add-role-member.sh api mcp-accessor human.idjag-learner &&
./tools/athenz/create-role.sh api mcp-hub-accessor &&
./tools/athenz/add-role-member.sh api mcp-hub-accessor human.idjag-learner
```

```sh
# Expected success excerpts when the roles are new; not captured output
#   ✔  Role created: api:role.mcp-accessor
#   ✔  human.idjag-learner  →  api:role.mcp-accessor
#   ✔  Role created: api:role.mcp-hub-accessor
#   ✔  human.idjag-learner  →  api:role.mcp-hub-accessor
```

## Setup 3. Allow mcp-hub to use api tokens as exchange input

Reserve `api:role.expiry-mcp-hub-exchanger-261027` for this disposable lab experiment. Grant `api.mcp-hub` source-exchange permission on `api:api`. Adding these grants makes the test an explicitly authorized self-exchange experiment; it does not establish that the unmodified tutorial already permits it.

```sh
./tools/athenz/create-role.sh api expiry-mcp-hub-exchanger-261027 &&
./tools/athenz/add-policy.sh api expiry-mcp-hub-exchanger-261027 \
  zts.token_source_exchange api &&
./tools/athenz/add-role-member.sh api expiry-mcp-hub-exchanger-261027 api.mcp-hub
```

```sh
# Expected success excerpts; not captured output
#   ✔  Role created: api:role.expiry-mcp-hub-exchanger-261027
#   ✔  Policy created: api:policy.expiry-mcp-hub-exchanger-261027_zts_token_source_exchange_api
#   ✔  api.mcp-hub  →  api:role.expiry-mcp-hub-exchanger-261027
```

## Setup 4. Allow mcp-hub to exchange into the same scopes

Authorize all three target roles so each child can retain exactly the scopes of the original token. The policy helper prefixes the domain; for example, its `api:role.docs-getter` argument produces the target resource `api:api:role.docs-getter`.

```sh
./tools/athenz/add-policy.sh api expiry-mcp-hub-exchanger-261027 \
  zts.token_target_exchange api:role.docs-getter &&
./tools/athenz/add-policy.sh api expiry-mcp-hub-exchanger-261027 \
  zts.token_target_exchange api:role.mcp-accessor &&
./tools/athenz/add-policy.sh api expiry-mcp-hub-exchanger-261027 \
  zts.token_target_exchange api:role.mcp-hub-accessor
```

```sh
# Expected success excerpts; not captured output
#   ✔  Policy created: api:policy.expiry-mcp-hub-exchanger-261027_zts_token_target_exchange_api_role_docs-getter
#   ✔  Policy created: api:policy.expiry-mcp-hub-exchanger-261027_zts_token_target_exchange_api_role_mcp-accessor
#   ✔  Policy created: api:policy.expiry-mcp-hub-exchanger-261027_zts_token_target_exchange_api_role_mcp-hub-accessor
```

Allow ZTS's policy cache to refresh before the exchange checks. MCP Hub needs the exchange permissions; the subject's access comes from the learner's role membership.

## Step 1. Issue the initial access token for mcp-hub

Request an ordinary X.509 access token without `actor`. Use a 30-second lifetime to make the later expiry test finish in a few minutes. The token helpers keep their original one-hour default when `--expires-in` is omitted.

```sh
_hub_scope='api:role.docs-getter api:role.mcp-accessor api:role.mcp-hub-accessor' &&
_hub_at=$(./tools/athenz/fetch-access-token.sh \
  ./keys/idjag-learner.crt ./keys/idjag-learner.key \
  "${_hub_scope}" --audience api --expires-in 30)
```

```sh
# Expected stable claim excerpt; not captured output
# {
#   "sub": "human.idjag-learner",
#   "client_id": "human.idjag-learner",
#   "aud": "api",
#   "scp": ["docs-getter", "mcp-accessor", "mcp-hub-accessor"]
# }
```

The helper prints progress, the JWT header, and decoded claims to stderr. The result excerpt omits changing fields such as `iat`, `exp`, and `jti`; check that the actual `exp - iat` is 30 seconds. Neither `act` nor `may_act` should be present.

## Step 2. Exchange the token twice as mcp-hub

Fetch a fresh original inside this block, then authenticate as `api.mcp-hub` for both exchanges. The second exchange uses the first exchange's output as its subject token. Audience and requested scopes stay the same.

```sh
_hub_scope='api:role.docs-getter api:role.mcp-accessor api:role.mcp-hub-accessor' &&
_original_at=$(./tools/athenz/fetch-access-token.sh \
  ./keys/idjag-learner.crt ./keys/idjag-learner.key \
  "${_hub_scope}" --audience api --expires-in 30) &&
sleep 2 &&
_next_at=$(./tools/athenz/exchange-access-token.sh \
  ./keys/api-mcp-hub.crt ./keys/api-mcp-hub.key \
  "${_original_at}" "${_hub_scope}" \
  --audience api --expires-in 30 --token-only) &&
sleep 2 &&
_next_at=$(./tools/athenz/exchange-access-token.sh \
  ./keys/api-mcp-hub.crt ./keys/api-mcp-hub.key \
  "${_next_at}" "${_hub_scope}" \
  --audience api --expires-in 30 --token-only)
```

```sh
# Expected stable claim excerpt for both exchanged tokens; not captured output
# {
#   "sub": "human.idjag-learner",
#   "client_id": "api.mcp-hub",
#   "aud": "api",
#   "scp": ["docs-getter", "mcp-accessor", "mcp-hub-accessor"]
# }
```

Compare the actual `iat` and `exp` from each response. The inspected implementation issues each child with `exp = now + allowed_lifetime`, rather than capping it at the parent's expiry. With the same 30-second lifetime and the waits above, each child is expected to expire later than its parent. Scope order may vary.

## Step 3. Keep exchanging beyond the original token expiry

Run the bounded check below. It obtains the learner's token once, then exchanges only the latest child as MCP Hub every ten seconds. Every child must keep the original subject, audience, and complete scope set, and its expiry must advance.

```sh
./tools/athenz/check-exchange-expiry.sh \
  ./keys/idjag-learner.crt ./keys/idjag-learner.key \
  ./keys/api-mcp-hub.crt ./keys/api-mcp-hub.key \
  'api:role.docs-getter api:role.mcp-accessor api:role.mcp-hub-accessor' \
  --audience api
```

```sh
# Expected stable excerpts if repeated exchange extends the lifetime; not captured output
#   ·  Issuing the original access token once for audience: api
#   ·  Checking that the unchanged original token is rejected as expired
# {
#   "code": 400,
#   "message": "Invalid subject token: Unable to parse token: Expired JWT"
# }
#   ✔  Original token rejected specifically because it expired
#   ✔  Child exchange succeeded after original token was rejected as expired
#   ✔  The child kept the original subject, audience, and scopes
```

The tool prints each hop's decoded metadata and actual `iat`, `parent_exp`, `child_exp`, and `original_exp`. Once the original's expiry plus 90 seconds has passed, it requires the unchanged original to fail specifically as expired, then exchanges the current child once more. The allowance accounts for clock skew; the explicit rejection is the control. A role denial, connection failure, or still-accepted original does not count as a successful result. The tool stops after at most 18 scheduled exchanges plus one final exchange and does not save token files.

If the check passes against the running ZTS, MCP Hub has continued acting for the original subject after that subject's original token was rejected as expired. This is evidence of repeated lifetime extension, not literal infinite execution. A maximum TTL on each token does not impose an absolute deadline on the chain. A's role membership and B's exchange permissions must still remain valid in ZTS's current policy cache.

## Step 4. Repeat with delegated tokens

Repeat the same check with `api.mcp-hub` as both the current actor and the next authorized actor. The tool fetches the actor token once and requests `actor=api.mcp-hub` on every exchange so each child retains `may_act.sub=api.mcp-hub`.

```sh
./tools/athenz/check-exchange-expiry.sh \
  ./keys/idjag-learner.crt ./keys/idjag-learner.key \
  ./keys/api-mcp-hub.crt ./keys/api-mcp-hub.key \
  'api:role.docs-getter api:role.mcp-accessor api:role.mcp-hub-accessor' \
  --audience api --actor api.mcp-hub
```

```sh
# Expected stable excerpts if delegated renewal succeeds; not captured output
#   ✔  Original token rejected specifically because it expired
#   ✔  Child exchange succeeded after original token was rejected as expired
#   ✔  The child kept the original subject, audience, and scopes
# Expected actor fields on every child:
# {
#   "act": {"sub": "api.mcp-hub"},
#   "may_act": {"sub": "api.mcp-hub"}
# }
```

The `act` excerpt shows the current actor only; later children also contain the preceding nested `act` chain. This growth can eventually encounter parser, token-size, or transport limits. Both exchange branches reset `auth_time` to the new issuance time and do not carry an original expiry deadline.

Delegation checks the input's `may_act.sub`, the actor's identity, and target-exchange permission. It does not perform impersonation's additional source-exchange permission check. Omitting `actor` makes the next delegated request fail with `code: 400`, `message: "Invalid subject token: missing may_act claim"`; naming a different next actor makes B's next delegated request fail with `code: 400`, `message: "Invalid subject token: may_act sub does not match actor token subject"`. Omitting `actor_token` instead selects impersonation, which is a separate authorized path.

## Clean-up 5. Delete the temporary exchange grants

Delete only the role and policies reserved for this experiment. The learner and MCP Hub identities and access roles are shared prerequisites for the Aug 29 patterns. After policy-cache refresh, an exchange without any remaining equivalent grant should be rejected.

```sh
./tools/athenz/delete-policy.sh api \
  expiry-mcp-hub-exchanger-261027_zts_token_target_exchange_api_role_docs-getter &&
./tools/athenz/delete-policy.sh api \
  expiry-mcp-hub-exchanger-261027_zts_token_target_exchange_api_role_mcp-accessor &&
./tools/athenz/delete-policy.sh api \
  expiry-mcp-hub-exchanger-261027_zts_token_target_exchange_api_role_mcp-hub-accessor &&
./tools/athenz/delete-policy.sh api \
  expiry-mcp-hub-exchanger-261027_zts_token_source_exchange_api &&
./tools/athenz/delete-role.sh api expiry-mcp-hub-exchanger-261027
```

```sh
# Expected success excerpts; not captured output
#   ✔  Policy deleted or already absent: api:policy.expiry-mcp-hub-exchanger-261027_zts_token_target_exchange_api_role_docs-getter
#   ✔  Policy deleted or already absent: api:policy.expiry-mcp-hub-exchanger-261027_zts_token_target_exchange_api_role_mcp-accessor
#   ✔  Policy deleted or already absent: api:policy.expiry-mcp-hub-exchanger-261027_zts_token_target_exchange_api_role_mcp-hub-accessor
#   ✔  Policy deleted or already absent: api:policy.expiry-mcp-hub-exchanger-261027_zts_token_source_exchange_api
#   ✔  Role deleted or already absent: api:role.expiry-mcp-hub-exchanger-261027
```

# Reference

- [Aug 29 X.509 impersonation → impersonation](./260829-x509-imp-imp-exchange.md)
- [X.509 delegation → delegation](./260613-x509-del-del-exchange.md)
- [Athenz v1.12.50: token lifetime selection](https://github.com/AthenZ/athenz/blob/v1.12.50/servers/zts/src/main/java/com/yahoo/athenz/zts/ZTSImpl.java#L1790-L1870)
- [Athenz v1.12.50: impersonation, scope checks, and delegation](https://github.com/AthenZ/athenz/blob/v1.12.50/servers/zts/src/main/java/com/yahoo/athenz/zts/ZTSImpl.java#L2841-L3246)
- [Athenz v1.12.50: subject-token and actor-token validation](https://github.com/AthenZ/athenz/blob/v1.12.50/servers/zts/src/main/java/com/yahoo/athenz/zts/token/AccessTokenRequest.java#L415-L460)
- [Athenz master inspected on Oct 27, 2026](https://github.com/AthenZ/athenz/blob/faa895dfc7d58345c63ba8eb974f7f1c6e02b05a/servers/zts/src/main/java/com/yahoo/athenz/zts/ZTSImpl.java#L2842-L3247)
- [RFC 8693 §2.1](https://www.rfc-editor.org/rfc/rfc8693.html#section-2.1): exchange does not generally invalidate the input token or impose its expiry on the output; lifetime extension alone is not proof of an RFC violation
