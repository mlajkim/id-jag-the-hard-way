# Goal

Help ZTS clients decide whether Athenz #3512 affects their integration by inspecting how ID-token-to-ID-token exchange handles a dedicated OIDC port and a role-qualified audience.

<!-- TOC depthFrom:2 depthTo:2 -->

- [Step 1. Identify the requested token type](#step-1-identify-the-requested-token-type)
- [Step 2. Inspect the dedicated OIDC port check](#step-2-inspect-the-dedicated-oidc-port-check)
- [Step 3. Compare audience behavior](#step-3-compare-audience-behavior)
- [Step 4. Inspect the upstream regression coverage](#step-4-inspect-the-upstream-regression-coverage)

<!-- /TOC -->

<details>
<summary>Last verified on Nov 6, 2026 — 🟡 Source inspected; runtime verification pending</summary>

| # | Date | Confirmed Working |
|---|---|---|
| 1 | Nov 6, 2026 | ✅ Captured the source-inspection command results below at PR head `42c3b85ee3d2d85f219aca893dd5dd85ba070d2b` |
| 2 | Nov 6, 2026 | 🟡 Inspected the four added regression tests; did not execute them or verify a deployed listener and issued tokens |

The PR merged on Sep 24, 2026 and is listed in the [v1.12.49 release notes](https://github.com/AthenZ/athenz/releases/tag/v1.12.49), published on Oct 6, 2026. The preceding v1.12.48 release predates the merge. The commands use the immutable PR head so later source changes do not change this record.

</details>

# Prerequisites

This tutorial requires the following to be completed:

1. Install `gh` and provide GitHub API access

# Steps

Here is the procedure to get to the goals.

## Step 1. Identify the requested token type

Run these read-only checks from the IDTHW repository root. This page inspects upstream source and requires no running lab.

The exchange affected by #3512 submits `grant_type=urn:ietf:params:oauth:grant-type:token-exchange`, with both `subject_token_type` and `requested_token_type` set to `urn:ietf:params:oauth:token-type:id_token`. Its `audience` identifies the target Athenz service. Inspect the parser to distinguish this from an exchange requesting an ID-JAG or access token:

```sh
gh api 'repos/AthenZ/athenz/contents/servers/zts/src/main/java/com/yahoo/athenz/zts/token/AccessTokenRequest.java?ref=42c3b85ee3d2d85f219aca893dd5dd85ba070d2b' \
  -H 'Accept: application/vnd.github.raw+json' |
  sed -n '224,232p;326,340p'
```

```sh
# Captured source output — Nov 6, 2026
#                 if (ZTSConsts.OAUTH_TOKEN_TYPE_JAG.equals(requestedTokenType)) {
#                     requestType = RequestType.JAG_TOKEN_EXCHANGE;
#                     validateJAGTokenExchangeRequest(options);
#                 } else if (ZTSConsts.OAUTH_TOKEN_TYPE_ID.equals(requestedTokenType)) {
#                     requestType = RequestType.ID_TOKEN_EXCHANGE;
#                     validateIdTokenExchangeRequest(options);
#                 } else if (ZTSConsts.OAUTH_TOKEN_TYPE_ACCESS.equals(requestedTokenType) || StringUtil.isEmpty(requestedTokenType)) {
#                     requestType = RequestType.ACCESS_TOKEN_EXCHANGE;
#                     validateAccessTokenExchangeRequest(options);
#     void validateIdTokenExchangeRequest(TokenConfigOptions options) {
#
#         // we must have audience specified
#
#         if (StringUtil.isEmpty(audience)) {
#             throw new IllegalArgumentException("Invalid request: no audience provided");
#         }
#
#         // for id token exchange requests subject token must be an id token
#
#         if (!ZTSConsts.OAUTH_TOKEN_TYPE_ID.equals(subjectTokenType)) {
#             throw new IllegalArgumentException("Invalid subject token type: " + subjectTokenType);
#         }
#         validateSubjectToken(options);
#     }
```

The request type follows the requested output token. Supplying an ID token as input does not make every exchange an `ID_TOKEN_EXCHANGE`.

<details>
<summary>FAQ: How does this relate to OAuth, OIDC, and ID-JAG?</summary>

OAuth 2.0 provides delegated authorization for accessing resources. OpenID Connect (OIDC) adds an authentication layer, including ID tokens that tell a client about an authenticated user. An access token is presented to a resource server; an ID token is intended for its client audience.

[OAuth Token Exchange (RFC 8693)](https://www.rfc-editor.org/rfc/rfc8693.html) provides a request framework for obtaining a new security token using an existing token. The requested output can vary with the server's supported flows and policies.

The IDTHW flow obtains an ID-JAG from an ID token, then uses that grant to obtain an access token. Its [ID-JAG exchange helper](../../../tools/athenz/exchange-id-token-for-id-jag.sh) requests `urn:ietf:params:oauth:token-type:id-jag`, which selects `JAG_TOKEN_EXCHANGE`. #3512 changes the OIDC-port classification of `ID_TOKEN_EXCHANGE` and the audience of the ID token it issues. It does not classify ID-JAG requests as OIDC requests.

For an IDTHW integration that only uses the existing ID-JAG flow, this feature is a low-priority research topic. It becomes relevant when a client needs ID-token-to-ID-token exchange through a dedicated OIDC listener, or needs the role-qualified audience described below. That priority is an integration judgment based on the request types, rather than a claim that Token Exchange itself is unimportant.

</details>

## Step 2. Inspect the dedicated OIDC port check

Before #3512, the access-token endpoint applied its ordinary request validation before parsing the exchange request, so an ID-token exchange reaching a dedicated OIDC port was rejected. The change parses the request first, then marks `ID_TOKEN_EXCHANGE` as an OIDC request for port validation:

```sh
gh api 'repos/AthenZ/athenz/contents/servers/zts/src/main/java/com/yahoo/athenz/zts/ZTSImpl.java?ref=42c3b85ee3d2d85f219aca893dd5dd85ba070d2b' \
  -H 'Accept: application/vnd.github.raw+json' |
  sed -n '2804,2805p;7478,7486p'
```

```sh
# Captured source output — Nov 6, 2026
#         validateRequest(ctx.request(), principalDomain, caller, false,
#             accessTokenRequest.getRequestType() == RequestType.ID_TOKEN_EXCHANGE);
#         if (oidcPort > 0 && oidcPort != httpsPort) {
#
#             // non oidc requests must not take place on the oidc port
#
#             if (!oidcRequest && request.getLocalPort() == oidcPort) {
#                 throw requestError("incorrect port number for a non-oidc request",
#                         caller, ZTSConsts.ZTS_UNKNOWN_DOMAIN, principalDomain);
#             }
#         }
```

The dedicated-port restriction applies when `athenz.oidc_port` is positive and differs from the regular HTTPS port. A separate OIDC port is an Athenz deployment option; OAuth and OIDC do not require separate ports.

| Parsed request | Dedicated OIDC port after #3512 |
|---|---|
| ID-token exchange | Passes this port check; authentication, token validation, and authorization must still succeed |
| Client-credentials access-token request | Rejected with HTTP 400 and message `incorrect port number for a non-oidc request` |
| ID-JAG or access-token exchange | Remains classified as a non-OIDC request and is subject to the same rejection |

The upstream test directly covers the client-credentials rejection. The ID-JAG and access-token exchange entries follow from the parser and port-check conditions above; they were not added as separate live tests in this research.

## Step 3. Compare audience behavior

Previously, the exchanged ID token copied the requested audience directly. #3512 calls the existing ID-token audience helper so exchange honors `role_in_aud_claim`:

```sh
gh api 'repos/AthenZ/athenz/contents/servers/zts/src/main/java/com/yahoo/athenz/zts/ZTSImpl.java?ref=42c3b85ee3d2d85f219aca893dd5dd85ba070d2b' \
  -H 'Accept: application/vnd.github.raw+json' |
  sed -n '2405,2408p;3404,3406p'
```

```sh
# Captured source output — Nov 6, 2026
#     String getIdTokenAudience(final String clientId, Boolean includeGroup, List<String> idTokenGroups) {
#         return (includeGroup == Boolean.TRUE && idTokenGroups != null && idTokenGroups.size() == 1) ?
#                 clientId + ":" + idTokenGroups.get(0) : clientId;
#     }
#         IdToken idToken = new IdToken();
#         idToken.setVersion(1);
#         idToken.setAudience(getIdTokenAudience(accessTokenRequest.getAudience(), accessTokenRequest.isRoleInAudClaim(), idTokenGroups));
```

For the upstream test's requested audience `coretech.storage`, the helper produces these results:

| `role_in_aud_claim` | Resulting `groups` | ID-token `aud` |
|---|---|---|
| Omitted or `false` | One group, `coretech:role.writers` | `coretech.storage` |
| `true` | One group, `coretech:role.writers` | `coretech.storage:coretech:role.writers` |
| `true` | Multiple groups | `coretech.storage` |
| `true` | No groups | `coretech.storage` |

The condition checks the resulting group count, not merely how many scopes the client submitted. The two new audience tests cover one role and multiple roles with the flag enabled. The omitted/false and no-group entries follow from the helper condition.

A relying service using the flag must validate the resulting role-qualified audience. This option affects audience construction; the existing subject-token audience and exchange-authorization checks still apply.

## Step 4. Inspect the upstream regression coverage

List the four test methods added by #3512. This command inspects their names; it does not run the tests:

```sh
gh api repos/AthenZ/athenz/pulls/3512/files \
  --jq '.[] | select(.filename == "servers/zts/src/test/java/com/yahoo/athenz/zts/ZTSImplIDTokenTest.java") | .patch' |
  sed -n 's/^+    public void /public void /p'
```

```sh
# Captured source output — Nov 6, 2026
# public void testIdTokenExchangeRoleInAudClaimSingleRole() throws JOSEException {
# public void testIdTokenExchangeRoleInAudClaimMultipleRoles() throws JOSEException {
# public void testIdTokenExchangeOnOidcPort() {
# public void testAccessTokenRequestOnOidcPortRejected() {
```

| Test | Assertion inspected |
|---|---|
| `testIdTokenExchangeRoleInAudClaimSingleRole` | Verifies the issued JWT signature, `aud=coretech.storage:coretech:role.writers`, and `groups=[coretech:role.writers]` |
| `testIdTokenExchangeRoleInAudClaimMultipleRoles` | Verifies the issued JWT signature, unchanged `aud=coretech.storage`, and at least two groups |
| `testIdTokenExchangeOnOidcPort` | Configures HTTPS port 4443 and OIDC port 443, simulates a request on 443, and asserts an ID-token response |
| `testAccessTokenRequestOnOidcPortRejected` | Uses the same ports and asserts HTTP 400 with the non-OIDC-port error for a client-credentials request |

These tests document the intended regression cases. Runtime verification would additionally require a deployed ZTS with a separate OIDC listener, an authenticated caller, a valid subject ID token, and the existing ID-token-exchange permissions.

# Reference

- [Athenz PR #3512](https://github.com/AthenZ/athenz/pull/3512)
- [Request parser at the inspected PR head](https://github.com/AthenZ/athenz/blob/42c3b85ee3d2d85f219aca893dd5dd85ba070d2b/servers/zts/src/main/java/com/yahoo/athenz/zts/token/AccessTokenRequest.java#L224)
- [OIDC-port classification at the inspected PR head](https://github.com/AthenZ/athenz/blob/42c3b85ee3d2d85f219aca893dd5dd85ba070d2b/servers/zts/src/main/java/com/yahoo/athenz/zts/ZTSImpl.java#L2804)
- [ID-token audience helper](https://github.com/AthenZ/athenz/blob/42c3b85ee3d2d85f219aca893dd5dd85ba070d2b/servers/zts/src/main/java/com/yahoo/athenz/zts/ZTSImpl.java#L2405)
- [Added regression tests](https://github.com/AthenZ/athenz/blob/42c3b85ee3d2d85f219aca893dd5dd85ba070d2b/servers/zts/src/test/java/com/yahoo/athenz/zts/ZTSImplIDTokenTest.java#L1659)
- [OAuth 2.0 Token Exchange — RFC 8693](https://www.rfc-editor.org/rfc/rfc8693.html)
- [Understanding token exchange in OAuth/OIDC — Logto](https://blog.logto.io/token-exchange)
