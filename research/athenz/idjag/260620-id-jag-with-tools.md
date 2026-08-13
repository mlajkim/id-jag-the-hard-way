# Goal

The goal of this document is to obtain an `id_token` from Keycloak and exchange it into an `ID_JAG` token via Athenz ZTS using shared tools, with the following steps:

<!-- TOC depthFrom:2 depthTo:2 -->

- [Step 1. Start from the tutorial baseline](#step-1-start-from-the-tutorial-baseline)
- [Step 2. Enable Direct Access Grants in Keycloak](#step-2-enable-direct-access-grants-in-keycloak)
- [Step 3. Get id_token from Keycloak](#step-3-get-id_token-from-keycloak)
- [Step 4. Exchange id_token for ID_JAG](#step-4-exchange-id_token-for-id_jag)
- [Clean-up 5. Disable temporary Direct Access Grants](#clean-up-5-disable-temporary-direct-access-grants)

<!-- /TOC -->

<details>
<summary>Last verified on Jul 10, 2026 — ✅ Success</summary>

| # | Date | Confirmed Working |
|---|------|-------------------|
| 1 | Jun 20, 2026 | ✅ — id_token and ID_JAG both obtained |
| 2 | Jul 10, 2026 | ✅ — Direct Access Grants, id_token fetch, and ID_JAG exchange verified again |

</details>

# Steps

Here is the procedure to get to the goals.

## Step 1. Start from the tutorial baseline

Complete the main tutorial through [16-id-jag.md](../../../tutorials/16-id-jag.md). This research flow uses the Keycloak client `human.idjag-learner.claude` and Keycloak username `idjag-learner`.

## Step 2. Enable Direct Access Grants in Keycloak

Use the Keycloak helper to enable Direct Access Grants for the existing `human.idjag-learner.claude` client:

```sh
./tools/keycloak/set-direct-access-grants.sh human.idjag-learner.claude true
```

```sh
#   ·  Fetching Keycloak admin token...
#   ·  Looking up UUID for client human.idjag-learner.claude...
#   ·  Fetching client human.idjag-learner.claude...
#   ·  Setting Direct Access Grants for human.idjag-learner.claude: true...
#   ✔  Direct Access Grants set for human.idjag-learner.claude: true
```

Without this setting, the next step fails with:

```sh
# {"error":"unauthorized_client","error_description":"Client not allowed for direct access grants"}
```

## Step 3. Get id_token from Keycloak

```sh
_client_secret=$(./tools/keycloak/get-client-secret.sh human.idjag-learner.claude)
_id_token=$(./tools/keycloak/get-id-token.sh human.idjag-learner.claude "$_client_secret" idjag-learner)

echo $_id_token | jq -R 'split(".") | .[0] | @base64d | fromjson'
echo $_id_token | jq -R 'split(".") | .[1] | @base64d | fromjson'
```

```sh
# {
#   "alg": "RS256",
#   "typ": "JWT",
#   "kid": "<key-id>"
# }
# {
#   "iss": "http://localhost:34443/realms/master",
#   "aud": "human.idjag-learner.claude",
#   "typ": "ID",
#   "preferred_username": "idjag-learner",
#   "email": "idjag-learner@athenz.io",
#   ...
# }
```

The Keycloak `id_token` carries the username as `preferred_username: idjag-learner`; it does not contain the Athenz `human.` prefix. Athenz maps it to `human.idjag-learner` in the ID-JAG token.

## Step 4. Exchange id_token for ID_JAG

```sh
_cert_path="./keys/human-idjag-learner-claude.crt"
_key_path="./keys/human-idjag-learner-claude.key"
_role_scope="api:role.mcp-accessor api:role.docs-getter"

_id_jag=$(./tools/athenz/exchange-id-token-for-id-jag.sh \
  "$_cert_path" \
  "$_key_path" \
  "$_id_token" \
  "$_role_scope" \
  --token-only)

echo $_id_jag | jq -R 'split(".") | .[0] | @base64d | fromjson'
echo $_id_jag | jq -R 'split(".") | .[1] | @base64d | fromjson'
```

```sh
# {
#   "typ": "oauth-id-jag+jwt",
#   "alg": "RS256",
#   "kid": "<key-id>"
# }
# {
#   "sub": "human.idjag-learner",
#   "aud": "https://athenz-zts-server.athenz:4443/zts/v1",
#   "scp": [
#     "api:role.docs-getter",
#     "api:role.mcp-accessor"
#   ],
#   "ver": 1,
#   "scope": "api:role.docs-getter api:role.mcp-accessor",
#   "iss": "https://athenz-zts-server.athenz:4443/zts/v1",
#   "client_id": "human.idjag-learner.claude",
#   ...
# }
```

## Clean-up 5. Disable temporary Direct Access Grants

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

*None*
