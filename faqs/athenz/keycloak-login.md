# Sign in to the Athenz UI with the IDTHW Keycloak IdP

The goal of this FAQ is to protect the local Athenz UI with the Keycloak IdP already deployed by IDTHW. After this setup, opening the Athenz UI redirects the browser to Keycloak and the UI receives the signed-in user's `preferred_username` instead of falling back to the static `athenz_admin` user.

<!-- TOC depthFrom:1 depthTo:2 -->

- [Sign in to the Athenz UI with the IDTHW Keycloak IdP](#sign-in-to-the-athenz-ui-with-the-idthw-keycloak-idp)
- [Prerequisites](#prerequisites)
- [Steps](#steps)
  - [Step 1. Register the Athenz UI in Keycloak](#step-1-register-the-athenz-ui-in-keycloak)
  - [Step 2. Store the OAuth2 Proxy secrets](#step-2-store-the-oauth2-proxy-secrets)
  - [Step 3. Align the Athenz authentication header](#step-3-align-the-athenz-authentication-header)
  - [Step 4. Put OAuth2 Proxy in front of the Athenz UI](#step-4-put-oauth2-proxy-in-front-of-the-athenz-ui)
  - [Step 5. Verify the Keycloak login](#step-5-verify-the-keycloak-login)
  - [Step 6. Grant Athenz permissions separately](#step-6-grant-athenz-permissions-separately)
- [How it works](#how-it-works)
- [Reference](#reference)

<!-- /TOC -->

<details>
<summary>Verification status — 🟡 Pending human verification</summary>

| # | Date | Status                                              |
|---|------|-----------------------------------------------------|
| 1 | TBD  | 🟡 Pending — human has not confirmed this procedure |

</details>

# Prerequisites

- Complete [Authorization Server](../../tutorials/05-authorization-server.md) so the Athenz UI is running.
- Complete [Identity Provider](../../tutorials/13-identity-provider.md) so Keycloak and the `idjag-learner` user exist.
- Keep `./tools/keep-k8s-port-forward.sh` running in another terminal.
- Have `jq` available for updating the existing generated ConfigMaps without dropping their other data.

# Steps

## Step 1. Register the Athenz UI in Keycloak

Register a confidential Keycloak client whose callback points to the local Athenz UI port:

```sh
_athenz_ui_port="$(./tools/port.sh athenz-ui)"

KEYCLOAK_OPEN_UI=false \
  ./tools/keycloak/create-client.sh \
  athenz-ui \
  "http://localhost:${_athenz_ui_port}/oauth2/callback" \
  "http://localhost:${_athenz_ui_port}" \
  confidential
```

The default callback is `http://localhost:3000/oauth2/callback`. Using `tools/port.sh` also supports a port overridden in `tools/config.local.yaml`.

## Step 2. Store the OAuth2 Proxy secrets

Copy the generated Keycloak client ID and secret into the `athenz` namespace:

```sh
./tools/keycloak/create-client-k8s-secret.sh \
  athenz-ui \
  athenz \
  athenz-ui-keycloak
```

Create a separate random secret for encrypting the OAuth2 Proxy session cookie:

```sh
_cookie_secret="$(openssl rand -base64 32 | tr -d '\n')"

kubectl -n athenz create secret generic athenz-ui-oauth2-proxy \
  --from-literal=cookie-secret="${_cookie_secret}" \
  --dry-run=client \
  -o yaml | kubectl apply -f -

unset _cookie_secret
```

## Step 3. Align the Athenz authentication header

OAuth2 Proxy sends `X-Forwarded-Preferred-Username` and `X-Forwarded-Email` to a proxied upstream. Update the Athenz UI to read those headers, and update ZMS to trust the same username header forwarded by the UI:

```sh
_ui_config="$(
  kubectl -n athenz get configmap athenz-ui-config \
    -o jsonpath='{.data.extended-config\.js}'
)"
_ui_config="${_ui_config//X-Auth-Request-Preferred-Username/X-Forwarded-Preferred-Username}"
_ui_config="${_ui_config//X-Auth-Request-Email/X-Forwarded-Email}"

kubectl -n athenz patch configmap athenz-ui-config \
  --type merge \
  --patch "$(jq -n --arg config "${_ui_config}" '{data:{"extended-config.js":$config}}')"

_zms_properties="$(
  kubectl -n athenz get configmap athenz-zms-conf \
    -o jsonpath='{.data.zms\.properties}'
)"
_zms_properties="${_zms_properties//athenz.auth.principal.auth.header.user=X-Auth-Request-Preferred-Username/athenz.auth.principal.auth.header.user=X-Forwarded-Preferred-Username}"

kubectl -n athenz patch configmap athenz-zms-conf \
  --type merge \
  --patch "$(jq -n --arg properties "${_zms_properties}" '{data:{"zms.properties":$properties}}')"

unset _ui_config _zms_properties
```

Confirm the active header names:

```sh
kubectl -n athenz get configmap athenz-ui-config \
  -o jsonpath='{.data.extended-config\.js}' \
  | grep -E 'authUser(Name|Email)Header'

kubectl -n athenz get configmap athenz-zms-conf \
  -o jsonpath='{.data.zms\.properties}' \
  | grep 'athenz.auth.principal.auth.header.user'
```

## Step 4. Put OAuth2 Proxy in front of the Athenz UI

The existing `ghostunnel` sidecar listens on port `3000`. Move it to loopback port `3001`, add OAuth2 Proxy on port `3000`, and clear `STATIC_USER_NAME` so a missing identity header cannot silently become `athenz_admin`:

```sh
_athenz_ui_port="$(./tools/port.sh athenz-ui)"
_keycloak_port="$(./tools/port.sh keycloak)"

kubectl -n athenz patch deployment athenz-ui --patch "$(cat <<EOF
spec:
  template:
    spec:
      containers:
        - name: athenz-ui
          env:
            - name: STATIC_USER_NAME
              value: ""
          readinessProbe:
            exec:
              command:
                - curl
                - -s
                - -H
                - "X-Forwarded-Preferred-Username: readiness_probe"
                - -H
                - "X-Forwarded-Email: readiness_probe@www.athenz.io"
                - --fail
                - --resolve
                - athenz-ui.athenz:4443:127.0.0.1
                - https://athenz-ui.athenz:4443/
          livenessProbe:
            exec:
              command:
                - curl
                - -s
                - -H
                - "X-Forwarded-Preferred-Username: liveness_probe"
                - -H
                - "X-Forwarded-Email: liveness_probe@www.athenz.io"
                - --fail
                - --resolve
                - athenz-ui.athenz:4443:127.0.0.1
                - https://athenz-ui.athenz:4443/
        - name: ghostunnel
          args:
            - client
            - --listen
            - 127.0.0.1:3001
            - --target
            - localhost:4443
            - --override-server-name
            - athenz-ui.athenz
            - --cacert
            - /etc/ssl/certs/ca-certificates.crt
            - --disable-authentication
          ports:
            - name: upstream-http
              containerPort: 3001
              protocol: TCP
        - name: oauth2-proxy
          image: quay.io/oauth2-proxy/oauth2-proxy:v7.9.0
          imagePullPolicy: IfNotPresent
          args:
            - --http-address=0.0.0.0:3000
            - --upstream=http://127.0.0.1:3001
            - --provider=oidc
            - --provider-display-name=Keycloak
            - --oidc-issuer-url=http://keycloak.idp:8080/realms/master
            - --skip-oidc-discovery=true
            - --login-url=http://localhost:${_keycloak_port}/realms/master/protocol/openid-connect/auth
            - --redeem-url=http://keycloak.idp:8080/realms/master/protocol/openid-connect/token
            - --oidc-jwks-url=http://keycloak.idp:8080/realms/master/protocol/openid-connect/certs
            - --insecure-oidc-skip-issuer-verification=true
            - --insecure-oidc-allow-unverified-email=true
            - --skip-claims-from-profile-url=true
            - --scope=openid profile email
            - --email-domain=*
            - --redirect-url=http://localhost:${_athenz_ui_port}/oauth2/callback
            - --cookie-name=_idthw_athenz_ui
            - --cookie-secure=false
            - --cookie-samesite=lax
            - --pass-user-headers=true
            - --reverse-proxy=true
            - --skip-provider-button=true
          env:
            - name: OAUTH2_PROXY_CLIENT_ID
              valueFrom:
                secretKeyRef:
                  name: athenz-ui-keycloak
                  key: client-id
            - name: OAUTH2_PROXY_CLIENT_SECRET
              valueFrom:
                secretKeyRef:
                  name: athenz-ui-keycloak
                  key: client-secret
            - name: OAUTH2_PROXY_COOKIE_SECRET
              valueFrom:
                secretKeyRef:
                  name: athenz-ui-oauth2-proxy
                  key: cookie-secret
          ports:
            - name: oauth2-http
              containerPort: 3000
              protocol: TCP
          readinessProbe:
            httpGet:
              path: /ping
              port: 3000
            initialDelaySeconds: 3
            periodSeconds: 5
          resources:
            limits:
              memory: 128Mi
              cpu: 100m
            requests:
              memory: 32Mi
              cpu: 10m
EOF
)"
```

Wait for the updated pod:

```sh
kubectl -n athenz rollout restart deployment/athenz-zms-server
kubectl -n athenz rollout status deployment/athenz-zms-server --timeout=180s
kubectl -n athenz rollout status deployment/athenz-ui --timeout=180s
kubectl -n athenz get pods -l app.kubernetes.io/name=athenz-ui
```

The pod should now show `3/3` containers ready.

## Step 5. Verify the Keycloak login

Open the Athenz UI:

```sh
_athenz_ui_port="$(./tools/port.sh athenz-ui)"
./tools/open.sh "http://localhost:${_athenz_ui_port}"
```

Keycloak should request the tutorial user's credentials:

- Username: `idjag-learner`
- Password: `password`

After login, Keycloak redirects to `/oauth2/callback` and then back to the Athenz UI. The UI should show `idjag-learner` as the current user instead of `athenz_admin`.

If the browser still has an admin Keycloak session, clear both the OAuth2 Proxy cookie and the Keycloak session before repeating the check:

```sh
_athenz_ui_port="$(./tools/port.sh athenz-ui)"
_keycloak_port="$(./tools/port.sh keycloak)"

./tools/open.sh "http://localhost:${_athenz_ui_port}/oauth2/sign_out"
./tools/open.sh "http://localhost:${_keycloak_port}/realms/master/protocol/openid-connect/logout"
```

## Step 6. Grant Athenz permissions separately

Successful Keycloak login authenticates the user as the Athenz principal `user.idjag-learner`; it does not automatically make that principal an administrator. Grant only the domain roles the user needs. For example, to let this user administer the tutorial `api` domain:

```sh
./tools/athenz/add-role-member.sh \
  api \
  admin \
  user.idjag-learner
```

This UI principal is separate from the `human.idjag-learner` service identity used by the ID-JAG token-exchange tutorials.

# How it works

The browser reaches OAuth2 Proxy on the existing Athenz UI port. OAuth2 Proxy redirects unauthenticated users to Keycloak, validates the returned OIDC tokens, and forwards `X-Forwarded-Preferred-Username` and `X-Forwarded-Email` to the Athenz UI. The UI then forwards the configured username header to ZMS for local authentication.

The split public and in-cluster Keycloak URLs are intentional: the browser must use `localhost`, while OAuth2 Proxy exchanges the authorization code and reads JWKS through `keycloak.idp:8080`. Issuer verification is skipped because the local port-forward and the in-cluster service expose the same tutorial Keycloak realm under different hostnames. Unverified email is allowed because the local `create-user.sh` helper does not mark its tutorial email as verified. Do not carry either setting into production.

# Reference

- [IDTHW Identity Provider tutorial](../../tutorials/13-identity-provider.md)
- [Athenz distribution OIDC auth-proxy compatibility](../../athenz_dist/docs/DISTRIBUTIONS.md)
- [OAuth2 Proxy OIDC provider configuration](https://oauth2-proxy.github.io/oauth2-proxy/configuration/providers/oidc)
- [OAuth2 Proxy configuration overview](https://oauth2-proxy.github.io/oauth2-proxy/configuration/overview)
