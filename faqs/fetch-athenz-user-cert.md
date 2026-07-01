# Athenz User Certificate PR 3239

This note is for testing Athenz PR 3239 locally with the Athenz and Keycloak Kubernetes deployments from this repo.

The PR adds a ZTS `POST /usercert` endpoint and a `zts-usercert` CLI. The flow is:

1. `zts-usercert` generates a CSR for a full Athenz user principal such as `user.idjag-learner`.
2. It opens the Keycloak authorization endpoint in your browser.
3. Keycloak redirects to `http://127.0.0.1:9213/oauth2/callback`.
4. `zts-usercert` sends the CSR and callback query string to ZTS `/usercert`.
5. ZTS exchanges the authorization code with Keycloak, validates the token subject, and signs the user certificate.

> [!NOTE]
> This creates an Athenz user principal such as `user.idjag-learner`. That is different from the earlier tutorial identity `human.idjag-learner`, which was modeled as an Athenz service.

<!-- TOC depthFrom:2 depthTo:2 -->

- [Prerequisites](#prerequisites)
- [Create a Keycloak Client for User Certificates](#create-a-keycloak-client-for-user-certificates)
- [Register the User Certificate Provider in Athenz](#register-the-user-certificate-provider-in-athenz)
- [Configure ZTS](#configure-zts)
- [Create the User Certificate Private Key](#create-the-user-certificate-private-key)
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

Create or update the client with the shared Keycloak helper. The helper reads the Keycloak port, realm, admin user, and admin password from the tutorial config, so the only values you need to provide here are the client ID, the callback redirect URI, the browser origin, and the client type.

The redirect URI must match the local callback endpoint that `zts-usercert` or the raw HTTP fallback listens on. The PR CLI uses `127.0.0.1` for the callback host, so use that value here instead of `localhost`. The final `public` argument makes this a public OIDC client, which means Keycloak will not require a client secret during the local authorization-code exchange.

```sh
./tools/keycloak/create-client.sh \
  "athenz-usercert" \
  "http://127.0.0.1:9213/oauth2/callback" \
  "http://127.0.0.1:9213" \
  public
```

```sh
  # ·  Fetching Keycloak admin token...
  # ·  Looking up client athenz-usercert in realm master...
  # ·  Updating existing client athenz-usercert...
  # ✔  Client updated: athenz-usercert
  # ✔  Opened: http://localhost:34443/admin/master/console/#/master/clients/567425db-94c8-402d-8d01-0bfa94e94b11/settings
```

![new_client_athenz_usercert](./assets/new_client_athenz_usercert.png)

The helper sets the important client values for this flow:

- `publicClient: true`: no client secret is required for this local test.
- `standardFlowEnabled: true`: enables the OAuth authorization-code flow.
- `redirectUris`: allows Keycloak to redirect the browser back to `127.0.0.1:9213`.
- `webOrigins`: allows browser-based redirects from the local callback origin.

## Register the User Certificate Provider in Athenz

Register `sys.auth.usercert` as a class-based instance provider. This is an Athenz provider identity, not a Keycloak client and not a per-human-user object. ZTS uses this provider name from `athenz.zts.user_cert_provider` when it decides which provider implementation is allowed to issue user certificates.

The config property name contains underscores, but the service name cannot. Use `usercert` for the Athenz service name and `sys.auth.usercert` for the provider value.

```sh
./tools/athenz/create-service.sh \
  "sys.auth" \
  "usercert"
```

This registers the Athenz service identity `sys.auth.usercert` in ZMS. No public key is needed for this class-based provider marker because it is not used as a normal service identity that authenticates with its own private key. The helper uses the local tutorial admin certificate against the local ZMS port-forward, then opens the Athenz services page for `sys.auth` so you can confirm `usercert` appears in the UI.

```sh
./tools/athenz/set-service-endpoint.sh \
  "sys.auth" \
  "usercert" \
  "class://com.yahoo.athenz.instance.provider.impl.UserCertificateProvider"
```

> [!NOTE]
> The source code for [UserCertifcateProvider.java](https://github.com/AthenZ/athenz/blob/master/libs/java/instance_provider/src/main/java/com/yahoo/athenz/instance/provider/impl/UserCertificateProvider.java)

This changes the service endpoint from a network URL into a class endpoint. That tells Athenz this provider is implemented inside ZTS by `com.yahoo.athenz.instance.provider.impl.UserCertificateProvider`.

Verify the registered service:

```sh
./tools/athenz/show-service.sh "sys.auth" "usercert"
```

```sh
# ·  Showing service sys.auth.usercert...
# service:
#     - name: sys.auth.usercert
#       modified: 2026-07-01T23:19:32.295Z
#       providerEndpoint: class://com.yahoo.athenz.instance.provider.impl.UserCertificateProvider
#       publicKeys: []
```

## Configure ZTS

Edit the ZTS ConfigMap:

```sh
kubectl edit configmap athenz-zts-conf -n athenz
```

Append these lines under `zts.properties`:

```properties
athenz.zts.user_cert_provider=sys.auth.usercert
athenz.zts.user_cert_max_timeout=60
athenz.zts.user_cert_default_timeout=30
athenz.zts.user_cert.idp_token_endpoint=http://keycloak.idp:8080/realms/master/protocol/openid-connect/token
athenz.zts.user_cert.idp_jwks_endpoint=http://keycloak.idp:8080/realms/master/protocol/openid-connect/certs
athenz.zts.user_cert.idp_client_id=athenz-usercert
athenz.zts.user_cert.idp_redirect_uri=http://127.0.0.1:9213/oauth2/callback
athenz.zts.user_cert.user_name_claim=preferred_username
```

Restart ZTS:

```sh
kubectl -n athenz rollout restart deployment/athenz-zts-server
kubectl -n athenz rollout status deployment/athenz-zts-server
```

## Create the User Certificate Private Key

Generate a new private key for the real user certificate:

```sh
./tools/athenz/create-private-key.sh "./keys/user-idjag-learner"
```

```sh
  # ·  Generating RSA key pair for: ./keys/user-idjag-learner...
  # ✔  Keys generated: ./keys/user-idjag-learner.key, ./keys/user-idjag-learner.public.key
```

This creates `./keys/user-idjag-learner.key`, which `zts-usercert` uses to build the CSR, and `./keys/user-idjag-learner.public.key`, which is not registered in ZMS for this user-certificate flow.

## Run `zts-usercert`

Use the `zts-usercert` binary from the running `athenz-cli` deployment. This avoids installing or building the CLI on your host.

The helper checks that `zts-usercert` exists in `deployment/athenz-cli`, updates the `athenz-usercert` Keycloak client to allow the exact callback URI, copies your local private key into that pod, runs the pod-local CLI there, and writes the fetched certificate back to your local `./keys` directory.

Run the flow through the helper:

```sh
./tools/athenz/fetch-user-cert.sh \
  "./keys/user-idjag-learner.key" \
  "user.idjag-learner" \
  "./keys/user-idjag-learner.crt"
```

```sh
  # ·  Checking zts-usercert in athenz-cli...
  # ·  Ensuring Keycloak client allows callback URI http://127.0.0.1:9213/oauth2/callback...
  # ·  Fetching Keycloak admin token...
  # ·  Looking up client athenz-usercert in realm master...
  # ·  Updating existing client athenz-usercert...
  # ✔  Client updated: athenz-usercert
  # ·  Copying private key into athenz-cli...
  # ·  Preparing browser URL handoff inside athenz-cli...
  # ·  Forwarding local callback port 9213 to athenz-cli...
  # ·  Running zts-usercert inside athenz-cli...
  # ·  Opening the Keycloak authorization URL from your host browser...
  # ✔  Opened: http://127.0.0.1:34443/realms/master/protocol/openid-connect/auth?client_id=athenz-usercert&code_challenge=XUdxT5dzm3PG4Ij6je0AgOlco5Q3L3U4BLWJMQangEw&code_challenge_method=S256&nonce=yZk2bkcIWKTKoSEjpsy6mz5l_87MDbz-&redirect_uri=http%3A%2F%2F127.0.0.1%3A9213%2Foauth2%2Fcallback&response_type=code&scope=openid&state=GU16KRrV-nGBHp2HajdbE4yR3QQhKd4s
```

The helper opens the Keycloak authorization URL in your workstation browser with `tools/open.sh`. After the callback completes, it copies the issued certificate from the `athenz-cli` pod to `./keys/user-idjag-learner.crt`.

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

Use this if the CLI path fails and you want to isolate ZTS `/usercert`. Reuse `./keys/user-idjag-learner.key` from [Create the User Certificate Private Key](#create-the-user-certificate-private-key).

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

./tools/open.sh "http://127.0.0.1:${_keycloak_port}/realms/master/protocol/openid-connect/auth?client_id=athenz-usercert&redirect_uri=http%3A%2F%2F127.0.0.1%3A9213%2Foauth2%2Fcallback&response_type=code&scope=openid&state=manual"
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
