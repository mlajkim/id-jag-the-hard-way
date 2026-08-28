# Goal

The goal of this document is to enumerate and manually verify the audience, scope, authorization, configuration, and token-exchange edge cases for X.509 multi-domain access tokens, using the isolated `mcp-hub.multi-scoped` and `api.multi-scoped` domains, with the following steps:

<!-- TOC depthFrom:2 depthTo:2 -->

- [Setup 1. Prepare the reusable scopes and unassigned role](#setup-1-prepare-the-reusable-scopes-and-unassigned-role)
- [Step 1. Review the complete edge-case inventory](#step-1-review-the-complete-edge-case-inventory)
- [Step 2. Verify initial audience-selection failures](#step-2-verify-initial-audience-selection-failures)
- [Step 3. Change the audience while retaining both domain scopes](#step-3-change-the-audience-while-retaining-both-domain-scopes)
- [Step 4. Verify issuance parsing and authorization boundaries](#step-4-verify-issuance-parsing-and-authorization-boundaries)
- [Step 5. Prepare subject tokens for exchange edge cases](#step-5-prepare-subject-tokens-for-exchange-edge-cases)
- [Step 6. Verify exchange audience and scope mismatches](#step-6-verify-exchange-audience-and-scope-mismatches)
- [Step 7. Verify exchange inference and policy direction](#step-7-verify-exchange-inference-and-policy-direction)
- [Clean-up 8. Remove the edge-case-only role](#clean-up-8-remove-the-edge-case-only-role)

<!-- /TOC -->

<details>
<summary>Last verified on Aug 26, 2026 — ✅ Success</summary>

| # | Date         | Confirmed Working |
|---|--------------|-------------------|
| 1 | Aug 26, 2026 | ✅ — either domain in a two-domain scope can be selected as audience; its roles become short scopes and the other domain's roles remain fully qualified |
| 2 | Aug 26, 2026 | 👍 — missing, unrelated, or stale audience/scope combinations failed with the expected 400 responses |
| 3 | Aug 26, 2026 | ✅ — partial issuance, duplicate removal, unknown-item handling, per-domain `:domain` behavior, and audience normalization were observed |
| 4 | Aug 26, 2026 | ✅ — omitted exchange scope inferred the carried target role; 👍 scope escalation and missing source/target exchange policies failed as expected |
| 5 | Aug 26, 2026 | 🟡 — a mixed source-plus-target exchange request succeeded but silently emitted only the target-audience role; this behavior should be reviewed before relying on it |

</details>

# Prerequisites

This tutorial requires the following to be completed:

1. Complete the main [ID-JAG The Hard Way tutorial](../../../tutorials/16-id-jag.md).
1. Complete [Setup multi-domain-scoped ZTS](./260825-setup-multi-domain-scoped-zts.md), including `athenz.zts.access_token_max_domains=10`.
1. Complete the setup and successful flow in [X.509 multi-domain AT to AT](./260826-x509-multiat-at.md), without running its cleanup step.

# Steps

Here is the procedure to get to the goals.

## Setup 1. Prepare the reusable scopes and unassigned role

Define the two valid role scopes and their combined form:

```sh
_source_domain=mcp-hub.multi-scoped
_target_domain=api.multi-scoped
_source_scope="${_source_domain}:role.core-mcp-proxy-accessors"
_target_scope="${_target_domain}:role.docs-getter"
_delete_scope="${_target_domain}:role.docs-deleter"
_two_domain_scope="${_source_scope} ${_target_scope}"
```

Create a real target role without adding the learner. This distinguishes an existing-but-unauthorized role from a nonexistent role:

```sh
./tools/athenz/create-role.sh api.multi-scoped unassigned
```

```sh
#   ✔  Role created: api.multi-scoped:role.unassigned
```

## Step 1. Review the complete edge-case inventory

The following inventory covers the multi-domain-specific branches in the feature implementation and the generic token-validity boundaries that can affect the same flow.

Initial request parsing and configuration:

| ID | Case | Expected behavior | Coverage |
|----|------|-------------------|----------|
| I01 | Two or more domains with no `audience` | 400, `Multiple scope domains require an audience` | 👍 Live |
| I02 | Requested domain count exceeds `athenz.zts.access_token_max_domains` | 400, `Domain limit: N has been reached` | 👍 Live with 11 domains and limit 10 |
| I03 | Server retains the default limit of one | 400, `Multiple domains in scope` | 🟡 Implementation test; requires configuration rollback |
| I04 | Empty scope | 400, `Invalid request: no scope provided` | 👍 Live |
| I05 | Scope has no recognized domain-bearing item | 400; no usable scope domain | 🟡 Listed |
| I06 | Empty or malformed domain/role syntax | 400 invalid scope | 🟡 Listed |
| I07 | Duplicate role or domain items | Duplicates are removed | ✅ Live |
| I08 | Unknown plain scope item accompanies valid Athenz scopes | Unknown item is ignored | ✅ Live |
| I09 | `openid` with multiple domains | 400, `Multiple domains not supported with openid scope` | 👍 Live |
| I10 | `authorization_details` with multiple domains | 400, `Authorization details cannot be requested for multiple domains` | 👍 Live |
| I11 | One domain uses `:domain`; another requests explicit roles | Domain scope expands only its own domain | ✅ Live |
| I12 | `:domain` and explicit roles target the same domain | `:domain` wins only for that domain | 🟡 Branch unit test |
| I13 | Configured maximum is zero or negative | 400, `Invalid value specified for max domains` | 🟡 Implementation path |
| I14 | Configured maximum is not an integer | ZTS cannot initialize `AccessTokenScope`; treat this as a deployment configuration failure | 🟡 Implementation path |
| I15 | Requested unique-domain count equals the configured maximum | Accepted; only the next unique domain exceeds the limit | 🟡 Branch unit test |
| I16 | Repeated spaces surround valid scopes | Empty items are ignored and valid scopes are still parsed | 🟡 Branch unit test |

Audience selection and output claims:

| ID | Case | Expected behavior | Coverage |
|----|------|-------------------|----------|
| A01 | Multi-domain scope selects the first domain as audience | Success | ✅ Main flow |
| A02 | Same scope selects the second domain as audience | Success; short and fully qualified scopes reverse | ✅ Live |
| A03 | Audience is not one of the scope domains | 400, `Audience domain must be one of the scope domains` | 👍 Live |
| A04 | Audience changes but scope contains only the old audience domain | Same 400 audience/scope mismatch | 👍 Live |
| A05 | Single-domain scope omits audience | Scope domain becomes audience | 🟡 Existing behavior |
| A06 | Single-domain scope specifies another audience | 400 audience/scope mismatch | 👍 Covered by A04 |
| A07 | Uppercase audience names | Audience is normalized to lowercase | ✅ Live |
| A08 | Audience is in scope but the domain does not exist | 404, `No such domain` | 👍 Covered through a nonexistent scope domain |
| A09 | Roles belonging to the audience domain | Emitted as short role names | ✅ Live |
| A10 | Roles belonging to other domains | Emitted as `<domain>:role.<role>` | ✅ Live |
| A11 | Scope order or duplicates vary | Output is de-duplicated and deterministically ordered | ✅ Live |
| A12 | Scope domain itself uses uppercase or otherwise violates the Athenz domain schema | Request fails domain-name validation; audience normalization does not rewrite scope items | 🟡 Implementation path |
| A13 | `role_in_aud_claim=true` accompanies a successful multi-domain request | Audience remains the selected domain because a valid multi-domain token necessarily contains at least two roles | 🟡 Implementation path |

Domain and role authorization:

| ID | Case | Expected behavior | Coverage |
|----|------|-------------------|----------|
| R01 | A requested domain does not exist or is not loaded by ZTS | 404, `No such domain` | 👍 Live |
| R02 | Principal has at least one requested role in every domain | Token is issued | ✅ Live |
| R03 | Some requested roles are unauthorized but each domain still contributes one authorized role | Token is issued with unauthorized roles omitted | ✅ Live; important partial-grant behavior |
| R04 | Any requested domain contributes zero authorized roles | Entire request fails with 403 | 👍 Live |
| R05 | Domain scope is used | All accessible roles in that domain are included | ✅ Live |
| R06 | Proxy principal is used | Each domain is reduced to the intersection accessible to both principals | 🟡 Implementation path |
| R07 | Request uses a role certificate | Returned roles cannot exceed the certificate's roles | 🟡 Implementation path |
| R08 | Roles have different maximum token lifetimes | Issued lifetime uses the shortest domain/role limit | 🟡 Implementation path |
| R09 | Domain or membership was just created and ZTS cache is stale | A transient 404/403 may occur until the normal domain refresh completes | 👍 Observed during setup |
| R10 | Requested role does not exist | It is omitted when another authorized role remains in that domain; otherwise that domain's zero-role result fails the request | 🟡 Implementation path |
| R11 | Membership is expired or removed | It is treated as inaccessible; R03 or R04 then applies depending on whether another role remains | 🟡 Generic authorization boundary |
| R12 | Caller is an authorized-service principal restricted to one domain | Each requested scope domain is checked; a second unauthorized domain fails | 🟡 Implementation path |

AT-to-AT exchange scope and audience validation:

| ID | Case | Expected behavior | Coverage |
|----|------|-------------------|----------|
| E01 | Target audience role is carried fully qualified in the subject token | Downscope succeeds | ✅ Main flow |
| E02 | Requested scope is absent from the subject token | 400, `Invalid scope for token exchange` | 👍 Main negative flow |
| E03 | Audience changes but request keeps only the old audience's scope | Same 400 invalid scope | 👍 Live |
| E04 | Audience and scope point to a domain absent from the subject token | Same 400 invalid scope | 👍 Live |
| E05 | Exchange scope is omitted or empty | Infer only carried roles for the requested target audience | ✅ Live |
| E06 | `target:domain` is requested | Infer only target roles already carried by the subject token; do not widen | 🟡 Implementation path |
| E07 | Subject token has no roles for target and exchange scope is omitted | 400 invalid scope | 🟡 Branch unit test |
| E08 | A short subject scope is reused across domains | Rejected; short roles belong only to the subject token audience | 👍 Branch unit test |
| E09 | Request contains valid target scope plus unrelated source-domain scope | Exchange succeeds but ignores the unrelated source scope | 🟡 Live; review behavior |
| E10 | Subject token lacks `aud` or `scope` claim | 400 invalid scope/token | 🟡 Branch unit test |
| E11 | Subject token is malformed, expired, tampered, wrong type, or from an untrusted issuer | Token validation fails | 🟡 Generic OAuth/JWT boundary |
| E12 | Subject had target role at issuance, but membership was later removed | Current target membership check fails | 🟡 Implementation path |
| E13 | Requested target audience domain does not exist | 404, `No such target domain` | 🟡 Implementation path |
| E14 | Exchange omits its target audience | 400 invalid audience/request | 🟡 Implementation path |
| E15 | Subject token audience names a domain ZTS no longer has | 404, `No such source domain` | 🟡 Implementation path |
| E16 | Subject token's standard `scope` claim has leading, trailing, or repeated whitespace | Whitespace is normalized before subset checks | 🟡 Branch unit test |
| E17 | Subject token's standard `scope` claim is empty or whitespace-only | 400 invalid scope/token | 🟡 Branch unit test |
| E18 | Subject token carries only non-role items such as `openid` or a service scope for the target | Non-role items are ignored; with no target role, exchange fails | 🟡 Branch unit test |
| E19 | Subject token carries an empty fully qualified role such as `api.multi-scoped:role.` | The empty role is ignored and cannot authorize exchange | 🟡 Branch unit test |
| E20 | Signed token has `scp` but lacks the standard `scope` string used by exchange | Exchange fails; this path reads the standard `scope` claim | 🟡 Implementation path |

Exchange policy, direction, and actor boundaries:

| ID | Case | Expected behavior | Coverage |
|----|------|-------------------|----------|
| P01 | Source policy permits `<source>:<target>` and target policy permits `<target>:<source>:role.<role>` | Exchange succeeds | ✅ Main flow |
| P02 | Source exchange policy is absent | 403, source-domain impersonation not authorized | 👍 Live through reverse direction |
| P03 | Role is carried, but target exchange policy is absent | 403, requested-role exchange not authorized | 👍 Live with `docs-deleter` |
| P04 | Forward policies exist but audience direction is reversed | Reverse exchange fails; policies are directional | 👍 Live |
| P05 | Actor token is omitted | Impersonation exchange path is used | ✅ Main flow |
| P06 | Actor token subject differs from the mTLS caller | 403 principal/actor mismatch | 🟡 Delegation path |
| P07 | Subject token `may_act.sub` differs from actor token subject | Actor validation fails | 🟡 Delegation path |
| P08 | Next actor is supplied | Output receives `may_act`; existing actor history is nested under `act` | 🟡 Delegation path |
| P09 | Authorized-service authentication attempts exchange | Exchange is forbidden | 🟡 Implementation path |
| P10 | Subject token contains a ZTS-issued SPIFFE identity | SPIFFE identity must match the Athenz subject before propagation | 🟡 Implementation path |
| P11 | Exchange requests the same source and target audience | It still requires matching source and target exchange policy resources | 🟡 Implementation path |
| P12 | Policy action exists on the wrong source/target resource shape | Authorization fails; similarly named roles do not broaden the resource match | 🟡 Branch unit test |
| P13 | Actor token is supplied without matching `may_act.sub` authority in the subject token | Actor validation fails | 🟡 Delegation path |
| P14 | Actor token is malformed, expired, tampered, the wrong token type, or from an untrusted issuer | Token validation fails before exchange authorization | 🟡 Generic OAuth/JWT boundary |

Transport and token-binding boundaries:

| ID | Case | Expected behavior | Coverage |
|----|------|-------------------|----------|
| T01 | Missing, expired, revoked, or untrusted client certificate | mTLS authentication fails | 🟡 Generic mTLS boundary |
| T02 | Certificate and private key do not match | TLS handshake fails | 🟡 Generic mTLS boundary |
| T03 | Issued access token is used with another certificate where `cnf` is enforced | Certificate-bound token validation fails | 🟡 Resource-server boundary |
| T04 | Port-forward reconnects to a replaced ZTS pod | New ZTS signing `kid` may differ; consumers must refresh keys | 🟡 Operational boundary |

## Step 2. Verify initial audience-selection failures

Omit the audience from a two-domain request:

```sh
./tools/athenz/fetch-access-token.sh \
  ./keys/idjag-learner.crt \
  ./keys/idjag-learner.key \
  "$_two_domain_scope"
```

```sh
# {
#   "code": 400,
#   "message": "Multiple scope domains require an audience"
# }
```

Select an existing domain that is not in the scope:

```sh
./tools/athenz/fetch-access-token.sh \
  ./keys/idjag-learner.crt \
  ./keys/idjag-learner.key \
  "$_two_domain_scope" \
  --audience mcp-hub
```

```sh
# {
#   "code": 400,
#   "message": "Audience domain must be one of the scope domains"
# }
```

Change the audience to `api.multi-scoped` while retaining only the old audience's scope. The new audience is still outside the requested scope and is rejected:

```sh
./tools/athenz/fetch-access-token.sh \
  ./keys/idjag-learner.crt \
  ./keys/idjag-learner.key \
  "$_source_scope" \
  --audience api.multi-scoped
```

```sh
# {
#   "code": 400,
#   "message": "Audience domain must be one of the scope domains"
# }
```

## Step 3. Change the audience while retaining both domain scopes

Changing the audience is valid when that domain remains in the requested scope. Reuse the exact two-domain scope but select `api.multi-scoped`:

```sh
_api_audience_at=$(./tools/athenz/fetch-access-token.sh \
  ./keys/idjag-learner.crt \
  ./keys/idjag-learner.key \
  "$_two_domain_scope" \
  --audience api.multi-scoped)
```

```sh
#   ✔  Access token issued for scope: mcp-hub.multi-scoped:role.core-mcp-proxy-accessors api.multi-scoped:role.docs-getter
# {
#   "aud": "api.multi-scoped",
#   "scp": [
#     "docs-getter",
#     "mcp-hub.multi-scoped:role.core-mcp-proxy-accessors"
#   ],
#   ...
# }
```

The same roles are carried, but qualification reverses: `docs-getter` is short because `api.multi-scoped` is now the audience, while the former audience role becomes fully qualified.

## Step 4. Verify issuance parsing and authorization boundaries

Requesting `openid` with multiple domains is unsupported even when the access-token domain limit permits both domains:

```sh
_openid_scope="openid mcp-hub.multi-scoped:service.core-mcp-proxy $_two_domain_scope"

./tools/athenz/fetch-access-token.sh \
  ./keys/idjag-learner.crt \
  ./keys/idjag-learner.key \
  "$_openid_scope" \
  --audience mcp-hub.multi-scoped
```

```sh
# {
#   "code": 400,
#   "message": "Multiple domains not supported with openid scope"
# }
```

With the live limit set to ten, an eleven-domain parser-only request fails before domain lookup:

```sh
_limit_scope="d01:role.reader d02:role.reader d03:role.reader d04:role.reader d05:role.reader d06:role.reader d07:role.reader d08:role.reader d09:role.reader d10:role.reader d11:role.reader"

curl -sS -k -X POST https://localhost:8443/zts/v1/oauth2/token \
  --cert ./keys/idjag-learner.crt \
  --key ./keys/idjag-learner.key \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode 'grant_type=client_credentials' \
  --data-urlencode "scope=$_limit_scope" \
  --data-urlencode 'audience=d01' \
  | jq '{code, message}'
```

```sh
# {
#   "code": 400,
#   "message": "Domain limit: 10 has been reached"
# }
```

Request one authorized and one unauthorized role in `api.multi-scoped`. Because that domain still contributes `docs-getter`, issuance succeeds and silently omits `unassigned`:

```sh
_partial_scope="$_two_domain_scope api.multi-scoped:role.unassigned"

_partial_at=$(./tools/athenz/fetch-access-token.sh \
  ./keys/idjag-learner.crt \
  ./keys/idjag-learner.key \
  "$_partial_scope" \
  --audience mcp-hub.multi-scoped)
```

```sh
# {
#   "aud": "mcp-hub.multi-scoped",
#   "scp": [
#     "api.multi-scoped:role.docs-getter",
#     "core-mcp-proxy-accessors"
#   ],
#   ...
# }
```

If `unassigned` is the only requested role from `api.multi-scoped`, that domain contributes no authorized role and the whole request fails:

```sh
_unauthorized_domain_scope="$_source_scope api.multi-scoped:role.unassigned"

./tools/athenz/fetch-access-token.sh \
  ./keys/idjag-learner.crt \
  ./keys/idjag-learner.key \
  "$_unauthorized_domain_scope" \
  --audience mcp-hub.multi-scoped
```

```sh
# {
#   "code": 403,
#   "message": "postaccesstokenrequest: principal human.idjag-learner is not included in the requested role(s) in domain api.multi-scoped"
# }
```

Duplicate roles and an unknown plain scope item do not change the issued claims:

```sh
_duplicate_scope="$_source_scope $_source_scope $_target_scope unknown-scope"

_duplicate_at=$(./tools/athenz/fetch-access-token.sh \
  ./keys/idjag-learner.crt \
  ./keys/idjag-learner.key \
  "$_duplicate_scope" \
  --audience mcp-hub.multi-scoped)
```

```sh
# {
#   "aud": "mcp-hub.multi-scoped",
#   "scp": [
#     "api.multi-scoped:role.docs-getter",
#     "core-mcp-proxy-accessors"
#   ],
#   ...
# }
```

A domain scope widens only its own domain. It includes both source-domain roles available to the learner but does not add `api.multi-scoped:role.docs-deleter`:

```sh
_domain_scope="mcp-hub.multi-scoped:domain $_target_scope"

_domain_at=$(./tools/athenz/fetch-access-token.sh \
  ./keys/idjag-learner.crt \
  ./keys/idjag-learner.key \
  "$_domain_scope" \
  --audience mcp-hub.multi-scoped)
```

```sh
# {
#   "aud": "mcp-hub.multi-scoped",
#   "scp": [
#     "api.multi-scoped:role.docs-getter",
#     "core-mcp-proxy-accessors",
#     "to-api-exchanger"
#   ],
#   ...
# }
```

## Step 5. Prepare subject tokens for exchange edge cases

Fetch the normal source-audience token:

```sh
_multi_at=$(./tools/athenz/fetch-access-token.sh \
  ./keys/idjag-learner.crt \
  ./keys/idjag-learner.key \
  "$_two_domain_scope" \
  --audience mcp-hub.multi-scoped)
```

Also fetch a source-audience token that explicitly carries `docs-deleter`. This allows the policy test to distinguish a missing target-exchange policy from a missing subject-token scope:

```sh
_with_deleter_scope="$_two_domain_scope $_delete_scope"

_with_deleter_at=$(./tools/athenz/fetch-access-token.sh \
  ./keys/idjag-learner.crt \
  ./keys/idjag-learner.key \
  "$_with_deleter_scope" \
  --audience mcp-hub.multi-scoped)
```

Keep `_api_audience_at` from Step 3 for the reverse-direction policy test.

## Step 6. Verify exchange audience and scope mismatches

Change the exchange audience to `api.multi-scoped` but request only the old audience's scope:

```sh
./tools/athenz/exchange-access-token.sh \
  ./keys/idjag-learner.crt \
  ./keys/idjag-learner.key \
  "$_multi_at" \
  "$_source_scope" \
  --audience api.multi-scoped
```

```sh
# {
#   "code": 400,
#   "message": "Invalid scope for token exchange"
# }
```

Point both the audience and requested role at the parent `api` domain, which is absent from the subject token:

```sh
./tools/athenz/exchange-access-token.sh \
  ./keys/idjag-learner.crt \
  ./keys/idjag-learner.key \
  "$_multi_at" \
  "api:role.docs-getter" \
  --audience api
```

```sh
# {
#   "code": 400,
#   "message": "Invalid scope for token exchange"
# }
```

Request `docs-deleter` from the normal subject token. The learner owns the role, but the subject token does not carry it:

```sh
./tools/athenz/exchange-access-token.sh \
  ./keys/idjag-learner.crt \
  ./keys/idjag-learner.key \
  "$_multi_at" \
  "$_delete_scope" \
  --audience api.multi-scoped
```

```sh
# {
#   "code": 400,
#   "message": "Invalid scope for token exchange"
# }
```

## Step 7. Verify exchange inference and policy direction

An omitted or empty exchange scope infers the roles carried for the requested target audience. Pass an empty string through the shared exchange tool:

```sh
_inferred_at=$(./tools/athenz/exchange-access-token.sh \
  ./keys/idjag-learner.crt \
  ./keys/idjag-learner.key \
  "$_multi_at" \
  "" \
  --audience api.multi-scoped \
  --token-only)
```

```sh
# {
#   "aud": "api.multi-scoped",
#   "scp": [
#     "docs-getter"
#   ],
#   ...
# }
```

A mixed request containing both the target scope and the old source scope currently succeeds, but the old source scope is ignored in the output:

```sh
_mixed_at=$(./tools/athenz/exchange-access-token.sh \
  ./keys/idjag-learner.crt \
  ./keys/idjag-learner.key \
  "$_multi_at" \
  "$_two_domain_scope" \
  --audience api.multi-scoped \
  --token-only)
```

```sh
# {
#   "aud": "api.multi-scoped",
#   "scp": [
#     "docs-getter"
#   ],
#   ...
# }
```

> [!CAUTION]
> Do not treat the ignored source scope as authorization in the output token. Consumers should request only scopes belonging to the target audience. Consider whether ZTS should reject unrelated exchange scopes instead of ignoring them.

The valid forward policies do not authorize the reverse direction. Use the `api.multi-scoped` audience token from Step 3 as the subject and attempt to exchange back to `mcp-hub.multi-scoped`:

```sh
./tools/athenz/exchange-access-token.sh \
  ./keys/idjag-learner.crt \
  ./keys/idjag-learner.key \
  "$_api_audience_at" \
  "$_source_scope" \
  --audience mcp-hub.multi-scoped
```

```sh
# {
#   "code": 403,
#   "message": "Principal not authorized for token impersonation from source domain"
# }
```

Finally, use a subject token that does carry `docs-deleter`. Scope validation passes, but the missing target-exchange policy fails separately:

```sh
./tools/athenz/exchange-access-token.sh \
  ./keys/idjag-learner.crt \
  ./keys/idjag-learner.key \
  "$_with_deleter_at" \
  "$_delete_scope" \
  --audience api.multi-scoped
```

```sh
# {
#   "code": 403,
#   "message": "Principal not authorized for token exchange for the requested role"
# }
```

The 400 and 403 cases prove different boundaries: the requested role must first be present in the subject token, and then the caller must have the matching source and target exchange policies.

## Clean-up 8. Remove the edge-case-only role

Delete only the `unassigned` role created by this document. Keep both subdomains and the base roles for continued manual testing:

```sh
./tools/athenz/delete-role.sh api.multi-scoped unassigned
```

# Reference

- [Athenz PR #3407 — Support scopes with domain names](https://github.com/AthenZ/athenz/pull/3407)
- [Athenz `AccessTokenScope` feature tests](https://github.com/mlajkim/athenz/blob/feat/scope-with-domain-name/servers/zts/src/test/java/com/yahoo/athenz/zts/token/AccessTokenScopeTest.java)
- [Athenz ZTS access-token and exchange tests](https://github.com/mlajkim/athenz/blob/feat/scope-with-domain-name/servers/zts/src/test/java/com/yahoo/athenz/zts/ZTSImplAccessTokenTest.java)
- [OAuth 2.0 Token Exchange (RFC 8693)](https://www.rfc-editor.org/rfc/rfc8693.html)
