# Athenz User Certificate PR 3239

This note is for testing Athenz PR 3239 locally with the Athenz and Keycloak Kubernetes deployments from this repo.

The PR adds a ZTS `POST /usercert` endpoint and a `zts-usercert` CLI. The flow is:

1. `zts-usercert` generates a CSR for a full Athenz user principal such as `user.idjag-learner`.
2. It opens the Keycloak authorization endpoint in your browser.
3. Keycloak redirects to `http://localhost:9213/oauth2/callback`.
4. `zts-usercert` sends the CSR and callback query string to ZTS `/usercert`.
5. ZTS exchanges the authorization code with Keycloak, validates the token subject, and signs the user certificate.

> [!NOTE]
> This creates an Athenz user principal such as `user.idjag-learner`. That is different from the earlier tutorial identity `human.idjag-learner`, which was modeled as an Athenz service.

<!-- TOC depthFrom:2 depthTo:2 -->

- [Prerequisites](#prerequisites)
- [Create a Keycloak Client for User Certificates](#create-a-keycloak-client-for-user-certificates)
- [Register the User Certificate Provider in Athenz](#register-the-user-certificate-provider-in-athenz)
- [Configure ZTS](#configure-zts)
- [Run `zts-usercert`](#run-zts-usercert)
- [Raw HTTP Fallback](#raw-http-fallback)
- [Use the New User Certificate](#use-the-new-user-certificate)
- [Troubleshooting](#troubleshooting)

<!-- /TOC -->

## Prerequisites

This FAQ assumes you have already completed the main tutorial flow through [ID-JAG](../tutorials/16-id-jag.md). That means you already have:

- Athenz running in the `athenz` namespace
- Keycloak running in the `idp` namespace
- the `idjag-learner` Keycloak user from [Identity Provider](../tutorials/13-identity-provider.md)
- the `api` domain and `docs-getter` role from the earlier authorization tutorials
- the local Kubernetes port-forwarder available from the tutorial tooling

This FAQ does not reinstall Athenz, Keycloak, `kind`, `kubectl`, Docker, Go, or the tutorial dependencies. It only covers the extra configuration needed to test PR 3239.

Before starting, make sure your ZTS server is already running code that contains PR 3239. The easiest check is that ZTS recognizes `/zts/v1/usercert`; without that PR code, all later configuration will still fail.

Keep the existing tutorial port-forwarder running:

```sh
./tools/keep-k8s-port-forward.sh
```

The examples below use the tutorial defaults:

- Keycloak realm: `master`
- Keycloak user: `idjag-learner`
- Athenz user principal to issue: `user.idjag-learner`
- ZTS local port: `$(./tools/port.sh zts)`
- Keycloak local port: `$(./tools/port.sh keycloak)`
- User cert callback port: `9213`

## Create a Keycloak Client for User Certificates

Create a separate public Keycloak client for this test. Public is intentional for the local test because the PR provider only sends a client secret when one is configured through Athenz `PrivateKeyStore`.

This client represents the Athenz user-certificate login flow, not one individual user. You can use the same `athenz-usercert` client for many users because Keycloak still authenticates each person separately and ZTS verifies the user claim in the returned token.

First, collect the Keycloak values from the tutorial config. The redirect URI must match the callback endpoint that `zts-usercert` or the raw HTTP fallback listens on.

```sh
_keycloak_port=$(./tools/port.sh keycloak)
_realm=$(./tools/config.sh keycloak realm)
_client_id="athenz-usercert"
_redirect_uri="http://localhost:9213/oauth2/callback"

echo "Keycloak port: $_keycloak_port"
echo "Keycloak realm: $_realm"
echo "Keycloak client ID: $_client_id"
echo "Keycloak redirect URI: $_redirect_uri"
```

```sh
# Keycloak port: 34443
# Keycloak realm: master
# Keycloak client ID: athenz-usercert
# Keycloak redirect URI: http://localhost:9213/oauth2/callback
```

Next, create or update the Keycloak client using the shared helper. The final `public` argument makes this a public OIDC client, which means Keycloak will not require a client secret during the local authorization-code exchange.

```sh
./tools/keycloak/create-client.sh \
  "${_client_id}" \
  "${_redirect_uri}" \
  "http://localhost:9213" \
  public
```


![new_client_athenz_usercert](./assets/new_client_athenz_usercert.png)

The helper sets the important client values for this flow:

- `publicClient: true`: no client secret is required for this local test.
- `standardFlowEnabled: true`: enables the OAuth authorization-code flow.
- `redirectUris`: allows Keycloak to redirect the browser back to `localhost:9213`.
- `webOrigins`: allows browser-based redirects from the local callback origin.

## Register the User Certificate Provider in Athenz

Register `sys.auth.user_cert` as a class-based instance provider:

```sh
kubectl -n athenz exec deployment/athenz-cli -- sh -c '
set -e

ZMS=https://athenz-zms-server.athenz:4443/zms/v1
KEY=/var/run/athenz/athenz_admin.private.pem
CERT=/var/run/athenz/athenz_admin.cert.pem

openssl rsa -in "${KEY}" -pubout -out /tmp/user_cert.public.pem >/dev/null 2>&1

if ! zms-cli -i user.athenz_admin -z "${ZMS}" -key "${KEY}" -cert "${CERT}" \
  -d sys.auth show-service user_cert >/dev/null 2>&1; then
  zms-cli -i user.athenz_admin -z "${ZMS}" -key "${KEY}" -cert "${CERT}" \
    -d sys.auth add-service user_cert athenz-zts-server.athenz /tmp/user_cert.public.pem
fi

zms-cli -i user.athenz_admin -z "${ZMS}" -key "${KEY}" -cert "${CERT}" \
  -d sys.auth set-service-endpoint user_cert \
  class://com.yahoo.athenz.instance.provider.impl.UserCertificateProvider

zms-cli -i user.athenz_admin -z "${ZMS}" -key "${KEY}" -cert "${CERT}" \
  -d sys.auth show-service user_cert
'
```

## Configure ZTS

Edit the ZTS ConfigMap:

```sh
kubectl edit configmap athenz-zts-conf -n athenz
```

Append these lines under `zts.properties`:

```properties
athenz.zts.user_cert_provider=sys.auth.user_cert
athenz.zts.user_cert_max_timeout=60
athenz.zts.user_cert_default_timeout=30
athenz.zts.user_cert.idp_token_endpoint=http://keycloak.idp:8080/realms/master/protocol/openid-connect/token
athenz.zts.user_cert.idp_jwks_endpoint=http://keycloak.idp:8080/realms/master/protocol/openid-connect/certs
athenz.zts.user_cert.idp_client_id=athenz-usercert
athenz.zts.user_cert.idp_redirect_uri=http://localhost:9213/oauth2/callback
athenz.zts.user_cert.user_name_claim=preferred_username
```

Restart ZTS:

```sh
kubectl -n athenz rollout restart deployment/athenz-zts-server
kubectl -n athenz rollout status deployment/athenz-zts-server
```

## Run `zts-usercert`

Use this path only if you already have a `zts-usercert` binary built from PR 3239 available on your host. If not, skip to [Raw HTTP Fallback](#raw-http-fallback); it tests the same ZTS endpoint without the CLI.

Generate a new private key for the real user certificate:

```sh
openssl genrsa -out ./keys/user-idjag-learner.key 2048
chmod 600 ./keys/user-idjag-learner.key
```

Run the flow from your host, not inside the `athenz-cli` pod. The browser callback is local to your workstation.

```sh
_zts_port=$(./tools/port.sh zts)
_keycloak_port=$(./tools/port.sh keycloak)
_zts_usercert_bin="${ZTS_USERCERT_BIN:-zts-usercert}"

"${_zts_usercert_bin}" \
  -zts "https://localhost:${_zts_port}/zts/v1" \
  -private-key ./keys/user-idjag-learner.key \
  -user user.idjag-learner \
  -idp-endpoint "http://localhost:${_keycloak_port}/realms/master/protocol/openid-connect/auth?scope=openid" \
  -idp-client-id athenz-usercert \
  -cert-file ./keys/user-idjag-learner.crt \
  -subj-o Athenz \
  -callback-port 9213 \
  -expiry-time 30 \
  -cacert ./athenz_dist/certs/ca.cert.pem \
  -proxy=false \
  -verbose
```

Sign in to Keycloak as:

- Username: `idjag-learner`
- Password: `password`

Inspect the issued certificate:

```sh
openssl x509 \
  -in ./keys/user-idjag-learner.crt \
  -noout \
  -subject \
  -issuer \
  -dates \
  -ext extendedKeyUsage \
  -ext subjectAltName
```

The subject should include `CN = user.idjag-learner`.

## Raw HTTP Fallback

Use this if the CLI path fails and you want to isolate ZTS `/usercert`.

Generate the private key if you did not already do it in the CLI section:

```sh
test -f ./keys/user-idjag-learner.key || openssl genrsa -out ./keys/user-idjag-learner.key 2048
chmod 600 ./keys/user-idjag-learner.key
```

Create a CSR whose CN matches the full Athenz user principal:

```sh
openssl req -new \
  -key ./keys/user-idjag-learner.key \
  -subj "/CN=user.idjag-learner/O=Athenz" \
  -out /tmp/user-idjag-learner.csr
```

Capture the Keycloak callback query string:

```sh
rm -f /tmp/usercert-callback.txt

(
  printf 'HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\n\r\nAuthentication captured. You can close this window.\n'
) | nc -l 9213 > /tmp/usercert-callback.txt &
```

Open the authorization URL:

```sh
_keycloak_port=$(./tools/port.sh keycloak)

./tools/open.sh "http://localhost:${_keycloak_port}/realms/master/protocol/openid-connect/auth?client_id=athenz-usercert&redirect_uri=http%3A%2F%2Flocalhost%3A9213%2Foauth2%2Fcallback&response_type=code&scope=openid&state=manual"
```

After login, extract the callback data:

```sh
_attestation_data=$(
  sed -n 's#GET /oauth2/callback?\([^ ]*\) HTTP.*#\1#p' /tmp/usercert-callback.txt | head -1
)

printf '%s\n' "${_attestation_data}"
```

POST directly to ZTS:

```sh
_zts_port=$(./tools/port.sh zts)

jq -n \
  --arg name "user.idjag-learner" \
  --arg csr "$(awk 'NF { sub(/\r/, ""); printf "%s\n", $0 }' /tmp/user-idjag-learner.csr)" \
  --arg attestationData "${_attestation_data}" \
  '{
    name: $name,
    csr: $csr,
    attestationData: $attestationData,
    expiryTime: 30
  }' > /tmp/usercert-request.json

curl -sk \
  -X POST "https://localhost:${_zts_port}/zts/v1/usercert" \
  -H "Content-Type: application/json" \
  --data @/tmp/usercert-request.json \
  | jq -r .x509Certificate \
  > ./keys/user-idjag-learner.crt
```

## Use the New User Certificate

The existing API roles grant access to `human.idjag-learner`. Add the new real user principal separately:

```sh
./tools/athenz/add-role-member.sh "api" "docs-getter" "user.idjag-learner"
```

Fetch an Athenz access token using the new user certificate:

```sh
./tools/athenz/fetch-access-token.sh \
  "./keys/user-idjag-learner.crt" \
  "./keys/user-idjag-learner.key" \
  "api:role.docs-getter" \
  "./keys/user-idjag-learner.jwt"
```

Decode the token and confirm the subject:

```sh
cat ./keys/user-idjag-learner.jwt \
  | jq -Rr 'split(".") | .[1] | @base64d' \
  | jq .
```

Expected subject:

```json
"sub": "user.idjag-learner"
```

## Troubleshooting

If ZTS rejects the request with `User authority configuration is not set`, confirm the PR image is running and `athenz.zts.user_cert_provider` is present in the mounted ZTS config.

```sh
kubectl -n athenz exec deployment/athenz-zts-server -c athenz-zts-server -- \
  grep -n "user_cert" /opt/athenz/zts/conf/zts.properties
```

If ZTS rejects the request with `User name is not valid for certificate request`, use the full principal `user.idjag-learner` for both the request `name` and CSR `CN`.

If the provider says `Subject token does not match requested user name`, confirm Keycloak's access token contains `preferred_username: "idjag-learner"` and ZTS has:

```properties
athenz.zts.user_cert.user_name_claim=preferred_username
```

If Keycloak's token endpoint returns `401`, the client is probably confidential. Set the `athenz-usercert` client to public for this local test, or configure the provider's client secret through Athenz `PrivateKeyStore`.
