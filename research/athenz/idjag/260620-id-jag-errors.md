# Goal

The goal of this document is to reproduce each known error response from Athenz ZTS during the `id_token` → `ID_JAG` token exchange, with the following steps:

<!-- TOC depthFrom:2 depthTo:2 -->

- [Step 1. Prepare ID_JAG exchange inputs](#step-1-prepare-id_jag-exchange-inputs)
- [Step 2. Expired JWT](#step-2-expired-jwt)
- [Step 3. Invalid subject token audience](#step-3-invalid-subject-token-audience)
- [Step 4. Missing dot delimiter](#step-4-missing-dot-delimiter)
- [Step 5. Invalid JSON header](#step-5-invalid-json-header)
- [Step 6. No subject token provided](#step-6-no-subject-token-provided)
- [Clean-up 7. Disable temporary Direct Access Grants](#clean-up-7-disable-temporary-direct-access-grants)

<!-- /TOC -->

<details>
<summary>Last verified on Jul 10, 2026 — ✅ Success</summary>

| # | Date         | Confirmed Working                         |
|---|--------------|-------------------------------------------|
| 1 | Jun 20, 2026 | ✅ — all 5 errors reproduced as documented |
| 2 | Jul 10, 2026 | ✅ — error cases verified again with the Claude Keycloak client |

</details>

# Steps

Here is the procedure to get to the goals.

## Step 1. Prepare ID_JAG exchange inputs

Complete the main tutorial through [16-id-jag.md](../../../tutorials/16-id-jag.md), then enable Direct Access Grants for `human.idjag-learner.claude`.

Fetch a valid `_id_token` and set the shared ZTS variables used in the error cases below:

```sh
./tools/keycloak/set-direct-access-grants.sh human.idjag-learner.claude true
_client_secret=$(./tools/keycloak/get-client-secret.sh human.idjag-learner.claude)
_id_token=$(./tools/keycloak/get-id-token.sh human.idjag-learner.claude "$_client_secret" idjag-learner)
_cert_path="./keys/human-idjag-learner-claude.crt"
_key_path="./keys/human-idjag-learner-claude.key"
_role_scope="api:role.mcp-accessor api:role.docs-getter"
```

## Step 2. Expired JWT

For this step, replace the valid `_id_token` from Step 1 with a previously obtained one that has already expired (older than the token TTL):

```sh
./tools/athenz/exchange-id-token-for-id-jag.sh \
  "$_cert_path" \
  "$_key_path" \
  "$_id_token" \
  "$_role_scope" | jq .
```

```sh
# {"code":400,"message":"Invalid subject token: Unable to parse token: Expired JWT"}
```

## Step 3. Invalid subject token audience

Use `idjag-learner.crt` instead of `human-idjag-learner-claude.crt`. The certificate CN is `human.idjag-learner`, not the Claude service identity `human.idjag-learner.claude`, so ZTS rejects the `id_token` audience:

```sh
_wrong_cert_path="./keys/idjag-learner.crt"
_wrong_key_path="./keys/idjag-learner.key"

./tools/athenz/exchange-id-token-for-id-jag.sh \
  "$_wrong_cert_path" \
  "$_wrong_key_path" \
  "$_id_token" \
  "$_role_scope" | jq .
```

```sh
# {"code":400,"message":"Invalid subject token audience"}
```

> [!TIP]
> The ZTS log shows an expected-audience mismatch for the certificate principal.
> The correct certificate is `./keys/human-idjag-learner-claude.crt` whose CN is `human.idjag-learner.claude`; that service is mapped to Keycloak client ID `human.idjag-learner.claude`.

## Step 4. Missing dot delimiter

Pass a non-JWT string with no `.` separators as the subject token:

```sh
./tools/athenz/exchange-id-token-for-id-jag.sh \
  "$_cert_path" \
  "$_key_path" \
  malformed \
  "$_role_scope" | jq .
```

```sh
# {"code":400,"message":"Invalid subject token: Unable to parse token: Invalid JWT serialization: Missing dot delimiter(s)"}
```

## Step 5. Invalid JSON header

Pass a string with a `.` but a non-JSON first segment:

```sh
./tools/athenz/exchange-id-token-for-id-jag.sh \
  "$_cert_path" \
  "$_key_path" \
  malformed.malformed \
  "$_role_scope" | jq .
```

```sh
# {"code":400,"message":"Invalid subject token: Unable to parse token: Invalid unsecured/JWS/JWE header: Invalid JSON object"}
```

## Step 6. No subject token provided

Pass an empty string as the subject token:

```sh
./tools/athenz/exchange-id-token-for-id-jag.sh \
  "$_cert_path" \
  "$_key_path" \
  "" \
  "$_role_scope" | jq .
```

```sh
# {"code":400,"message":"Invalid request: no subject token provided"}
```

## Clean-up 7. Disable temporary Direct Access Grants

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

- [Athenz ZTSImpl source — audience validation](https://github.com/AthenZ/athenz/blob/fed5efe72c772874ab654205589a1d7947b2e8ad/servers/zts/src/main/java/com/yahoo/athenz/zts/ZTSImpl.java#L3139-L3149)
