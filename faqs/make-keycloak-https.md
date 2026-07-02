# Make Keycloak HTTPS for ZTS User Certificates

This note is for the local Athenz and Keycloak Kubernetes deployments from this repo.

Recent Athenz OSS builds require the user-certificate IdP token and JWKS endpoints to use `https://`. The tutorial Keycloak deployment listens on plain HTTP, so ZTS can fail while initializing the user certificate provider:

```sh
# 09:45:33.719 ERROR c.y.a.zts.InstanceProviderManager - Unable to initialize class provider sys.auth.usercert: ResourceException (500): IdP token endpoint must be an https url
# 09:45:33.719 ERROR com.yahoo.athenz.zts.ZTSImpl - Error: postusercertificaterequest request-domain: user principal-domain: user code: 400 message: unable to get instance for provider: sys.auth.usercert
```

The fix is to put an Envoy TLS sidecar in front of Keycloak:

1. Keycloak keeps listening on `http://127.0.0.1:8080` inside its pod.
2. Envoy listens on `https://keycloak.idp:8443`.
3. Envoy forwards requests to Keycloak over localhost HTTP, injecting `X-Forwarded-Proto: https` so Keycloak generates correct redirect URIs.
4. The Envoy server certificate is signed by the existing Athenz tutorial CA.
5. ZTS uses the HTTPS Envoy endpoint for the back-channel token and JWKS calls.
6. The tutorial port-forwarder keeps `http://localhost:34443` for Keycloak HTTP and adds `https://localhost:34444` for Keycloak HTTPS.

Both ports remain active. `34443` (HTTP) and `34444` (HTTPS) are fully functional. Browser access to `https://localhost:34444` works without warnings after the certificate includes `localhost`, the Athenz CA is trusted by your browser, and the port-forwarder is forwarding the Keycloak HTTPS listener.

This does not create another root CA.

<!-- TOC depthFrom:2 depthTo:2 -->

- [Prerequisites](#prerequisites)
- [Create the Keycloak TLS Certificate](#create-the-keycloak-tls-certificate)
- [Create the Kubernetes TLS Secret](#create-the-kubernetes-tls-secret)
- [Patch the Keycloak Deployment](#patch-the-keycloak-deployment)
- [Create Envoy Config](#create-envoy-config)
- [Patch the Keycloak Service](#patch-the-keycloak-service)
- [Verify Both Endpoints](#verify-both-endpoints)
- [Trust the CA for Browser HTTPS Access](#trust-the-ca-for-browser-https-access)
- [Open Keycloak over Local HTTPS](#open-keycloak-over-local-https)
- [Update ZTS User Certificate Endpoints](#update-zts-user-certificate-endpoints)
- [Rerun `zts-usercert`](#rerun-zts-usercert)

<!-- /TOC -->

## Prerequisites

This FAQ assumes you have already completed the main tutorial flow through [Identity Provider](../tutorials/13-identity-provider.md), and that you are testing the user certificate flow from [Athenz User Certificate PR 3239](./fetch-athenz-user-cert.md).

You should already have:

- Athenz running in the `athenz` namespace
- Keycloak running in the `idp` namespace
- a Keycloak deployment named `keycloak`
- a Keycloak service named `keycloak`
- the existing Athenz tutorial CA files:
  - `./athenz_dist/certs/ca.cert.pem`
  - `./athenz_dist/keys/ca.private.pem`

Keep the existing tutorial port-forwarder running in another terminal:

```sh
./tools/keep-k8s-port-forward.sh
```

After this FAQ, both local ports will be active:

```sh
http://localhost:$(./tools/port.sh keycloak)         # HTTP  — 34443
https://localhost:$(./tools/port.sh keycloak-https)  # HTTPS — 34444
```

## Create the Keycloak TLS Certificate

Create one server certificate for the Envoy sidecar. It is signed by the existing Athenz tutorial CA, so ZTS can trust it through the same local trust chain.

```sh
./tools/athenz/create-tls-cert.sh \
  "keycloak.idp" \
  "./keys/keycloak-idp" \
  "keycloak" \
  "localhost" \
  "keycloak.idp" \
  "keycloak.idp.svc" \
  "keycloak.idp.svc.cluster.local"
```

```sh
# ·  Creating TLS certificate for keycloak.idp...
# ·  Using Athenz CA: /path/to/id_jag_the_hard_way_workspace/athenz_dist/certs/ca.cert.pem
# ✔  Private key saved to: ./keys/keycloak-idp.private.pem
# ✔  CSR saved to: ./keys/keycloak-idp.csr.pem
# ✔  Certificate saved to: ./keys/keycloak-idp.cert.pem
```

Check the certificate SANs:

```sh
openssl x509 \
  -in ./keys/keycloak-idp.cert.pem \
  -noout \
  -subject \
  -issuer \
  -ext subjectAltName
```

```sh
# issuer=CN=Test CA Certificate
# X509v3 Subject Alternative Name:
#     DNS:keycloak, DNS:localhost, DNS:keycloak.idp, DNS:keycloak.idp.svc, DNS:keycloak.idp.svc.cluster.local
```

The SAN list must include `DNS:keycloak.idp` because ZTS will call that hostname. It also includes `DNS:localhost` so the local `34444` port-forward can be tested without a hostname mismatch.

## Create the Kubernetes TLS Secret

Create or update the TLS secret in the `idp` namespace:

```sh
kubectl -n idp create secret tls keycloak-tls \
  --cert=./keys/keycloak-idp.cert.pem \
  --key=./keys/keycloak-idp.private.pem \
  --dry-run=client \
  -o yaml | kubectl apply -f -
```

```sh
# secret/keycloak-tls configured
```

## Patch the Keycloak Deployment

Add the Envoy sidecar container.

```sh
kubectl patch deploy keycloak -n idp --patch "$(cat <<'EOF'
spec:
  template:
    spec:
      containers:
        - name: keycloak-envoy
          image: docker.io/envoyproxy/envoy:v1.34-latest
          imagePullPolicy: IfNotPresent
          args:
            - -c
            - /etc/envoy/envoy.yaml
            - --log-level
            - info
          ports:
            - name: https
              containerPort: 8443
              protocol: TCP
          readinessProbe:
            tcpSocket:
              port: 8443
            initialDelaySeconds: 3
            periodSeconds: 5
          resources:
            limits:
              memory: 128Mi
              cpu: 250m
            requests:
              memory: 32Mi
              cpu: 50m
EOF
)"
```

```sh
# deployment.apps/keycloak patched
```

Add the Envoy config and TLS secret volumes to the Keycloak pod template.

```sh
kubectl patch deploy keycloak -n idp --patch "$(cat <<'EOF'
spec:
  template:
    spec:
      volumes:
        - name: keycloak-envoy-config
          configMap:
            name: keycloak-envoy-config
        - name: keycloak-tls
          secret:
            secretName: keycloak-tls
EOF
)"
```

```sh
# deployment.apps/keycloak patched
```

## Create Envoy Config

Create an Envoy config that terminates TLS on `8443` and forwards to the Keycloak container on `127.0.0.1:8080`.

```sh
cat <<'EOF' | kubectl apply -f -
apiVersion: v1
kind: ConfigMap
metadata:
  name: keycloak-envoy-config
  namespace: idp
data:
  envoy.yaml: |
    static_resources:
      listeners:
        - name: keycloak_https
          address:
            socket_address:
              address: 0.0.0.0
              port_value: 8443
          filter_chains:
            - transport_socket:
                name: envoy.transport_sockets.tls
                typed_config:
                  "@type": type.googleapis.com/envoy.extensions.transport_sockets.tls.v3.DownstreamTlsContext
                  common_tls_context:
                    tls_certificates:
                      - certificate_chain:
                          filename: /etc/keycloak/tls/tls.crt
                        private_key:
                          filename: /etc/keycloak/tls/tls.key
              filters:
                - name: envoy.filters.network.http_connection_manager
                  typed_config:
                    "@type": type.googleapis.com/envoy.extensions.filters.network.http_connection_manager.v3.HttpConnectionManager
                    stat_prefix: keycloak_https
                    route_config:
                      name: keycloak_route
                      virtual_hosts:
                        - name: keycloak
                          domains:
                            - "*"
                          routes:
                            - match:
                                prefix: "/"
                              route:
                                cluster: keycloak_http
                                timeout: 30s
                              request_headers_to_add:
                                - header:
                                    key: X-Forwarded-Proto
                                    value: https
                                  keep_empty_value: false
                    http_filters:
                      - name: envoy.filters.http.router
                        typed_config:
                          "@type": type.googleapis.com/envoy.extensions.filters.http.router.v3.Router
      clusters:
        - name: keycloak_http
          type: STATIC
          connect_timeout: 5s
          load_assignment:
            cluster_name: keycloak_http
            endpoints:
              - lb_endpoints:
                  - endpoint:
                      address:
                        socket_address:
                          address: 127.0.0.1
                          port_value: 8080
EOF
```

```sh
# configmap/keycloak-envoy-config created
```

Finally mount the Envoy config and TLS secret into the Envoy sidecar.

```sh
kubectl patch deploy keycloak -n idp --patch "$(cat <<'EOF'
spec:
  template:
    spec:
      containers:
        - name: keycloak-envoy
          volumeMounts:
            - name: keycloak-envoy-config
              mountPath: /etc/envoy
              readOnly: true
            - name: keycloak-tls
              mountPath: /etc/keycloak/tls
              readOnly: true
EOF
)"
```

```sh
# deployment.apps/keycloak patched
```

Tell Keycloak to keep its HTTP listener enabled and honor forwarded proxy headers from Envoy. This is what makes Keycloak generate browser URLs with `https://localhost:34444` when the request came through the local HTTPS port-forward.

```sh
kubectl patch deploy keycloak -n idp --patch "$(cat <<'EOF'
spec:
  template:
    spec:
      containers:
        - name: keycloak
          env:
            - name: KC_HTTP_ENABLED
              value: "true"
            - name: KC_PROXY_HEADERS
              value: xforwarded
            - name: KC_HOSTNAME_STRICT
              value: "false"
EOF
)"
```

```sh
# deployment.apps/keycloak patched
```

Wait for Keycloak to roll out with the Envoy sidecar configuration:

```sh
kubectl -n idp rollout status deployment/keycloak
```

```sh
# deployment "keycloak" successfully rolled out
```

## Patch the Keycloak Service

Expose the Envoy HTTPS port on the existing Keycloak service.

```sh
kubectl patch service keycloak -n idp --patch "$(cat <<'EOF'
spec:
  ports:
    - name: http
      port: 8080
      protocol: TCP
      targetPort: 8080
    - name: https
      port: 8443
      protocol: TCP
      targetPort: 8443
EOF
)"
```

```sh
# service/keycloak patched
```

Check the service:

```sh
kubectl -n idp get service keycloak
```

```sh
# NAME       TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)             AGE
# keycloak   ClusterIP   10.96.114.120   <none>        8080/TCP,8443/TCP   1d
```

If `./tools/keep-k8s-port-forward.sh` is running, it now also forwards the HTTPS listener to local port `34444` by default:

```sh
./tools/port.sh keycloak-https
```

```sh
# 34444
```

If the port-forwarder was already running before you added the Envoy sidecar, restart it after the Keycloak rollout. The script will start forwarding both Keycloak ports:

```sh
./tools/keep-k8s-port-forward.sh
```

## Verify Both Endpoints

**HTTP (34443)** — verify from your workstation:

```sh
_keycloak_port=$(./tools/port.sh keycloak)
curl -sS \
  "http://localhost:${_keycloak_port}/realms/master/protocol/openid-connect/certs" \
  | jq .
```

**HTTPS (34444)** — verify from your workstation:

```sh
_keycloak_https_port=$(./tools/port.sh keycloak-https)
curl -sS \
  --cacert ./athenz_dist/certs/ca.cert.pem \
  "https://localhost:${_keycloak_https_port}/realms/master/protocol/openid-connect/certs" \
  | jq .
```

Both should return the Keycloak JWKS response:

```sh
# {
#   "keys": [
#     {
#       "kid": "IRkJbssr_TpZAE8uZtnB781U4IGWN3O13vrKyRjRBwc",
#       "kty": "RSA",
#       "alg": "RSA-OAEP",
# ...
```

**HTTPS (in-cluster via athenz-cli)** — use the `athenz-cli` pod because it already has the Athenz CA mounted at `/etc/ssl/certs/ca-certificates.crt`:

```sh
kubectl -n athenz exec deploy/athenz-cli -- \
  curl -sS \
    --cacert /etc/ssl/certs/ca-certificates.crt \
    https://keycloak.idp:8443/realms/master/protocol/openid-connect/certs \
  | jq .
```

Verify that the token endpoint is reachable over HTTPS. This should return an OAuth error because the request intentionally omits grant parameters — TLS succeeding and Keycloak answering is what matters:

```sh
kubectl -n athenz exec deploy/athenz-cli -- \
  curl -sS \
    --cacert /etc/ssl/certs/ca-certificates.crt \
    -X POST \
    https://keycloak.idp:8443/realms/master/protocol/openid-connect/token \
  | jq .
```

Expected output:

```sh
# {
#   "error": "invalid_request",
#   ...
# }
```

If this fails with a certificate hostname error, check that the certificate SAN includes `keycloak.idp`.

If this fails with a trust error, check that the Envoy certificate was signed by `./athenz_dist/certs/ca.cert.pem` and that the caller is using the Athenz CA bundle.

If this fails with connection refused, check the Keycloak pod containers:

```sh
kubectl -n idp get pod -l app=keycloak
kubectl -n idp logs deploy/keycloak -c keycloak-envoy --tail=100
```

## Trust the CA for Browser HTTPS Access

`34444` uses a certificate signed by the Athenz tutorial CA, which browsers do not trust by default. To open `https://localhost:34444` without a warning, add the CA to your browser's trust store.

**macOS Chrome, Safari, and Edge:**

```sh
sudo security add-trusted-cert -d -r trustRoot \
  -k /Library/Keychains/System.keychain \
  ./athenz_dist/certs/ca.cert.pem
```

Restart the browser after running this command.

**Firefox on macOS:** Firefox may use its own certificate store. If `https://localhost:34444` still shows `SEC_ERROR_UNKNOWN_ISSUER`, import `./athenz_dist/certs/ca.cert.pem` in Firefox under Settings > Privacy & Security > Certificates > View Certificates > Authorities, and trust it for websites.

**Linux (Debian/Ubuntu):**

```sh
sudo cp ./athenz_dist/certs/ca.cert.pem \
  /usr/local/share/ca-certificates/athenz-tutorial-ca.crt
sudo update-ca-certificates
```

Restart the browser after updating the system CA store. Firefox on Linux may also need the same manual Authorities import as Firefox on macOS.

**Skipping this step** — browsers show a certificate warning, but `34444` still works. You can click through the warning, or use `curl --cacert ./athenz_dist/certs/ca.cert.pem` to bypass it in scripts. ZTS and in-cluster callers always use the CA bundle directly and are unaffected.

## Open Keycloak over Local HTTPS

Open Keycloak through the HTTPS port-forward:

```sh
./tools/open.sh "https://localhost:$(./tools/port.sh keycloak-https)"
```

Sign in with the tutorial admin credentials:

```text
username: admin
password: admin
```

Expected browser behavior:

- The address bar stays on `https://localhost:34444`.
- The browser does not show a certificate warning after the CA trust step.
- Keycloak pages and admin-console navigation keep using `https://localhost:34444`, not `http://localhost:34443` and not `http://keycloak.idp:8080`.

If the browser shows `NET::ERR_CERT_AUTHORITY_INVALID` or `SEC_ERROR_UNKNOWN_ISSUER`, the Athenz CA is not trusted by that browser yet.

If the browser shows a hostname or common-name error, recreate the certificate and confirm the SAN output includes `DNS:localhost`.

If the browser cannot connect to `localhost:34444`, restart `./tools/keep-k8s-port-forward.sh` and confirm the Keycloak deployment has both containers:

```sh
kubectl -n idp get deploy keycloak
kubectl -n idp get pod -l app=keycloak -o jsonpath='{.items[0].spec.containers[*].name}{"\n"}'
```

## Update ZTS User Certificate Endpoints

Update only the ZTS back-channel IdP endpoints. Keep the browser authorization endpoint in `fetch-user-cert.sh` as the local `127.0.0.1` URL.

Edit the ZTS ConfigMap:

```sh
kubectl edit configmap athenz-zts-conf -n athenz
```

Replace the old HTTP endpoint values:

```properties
    athenz.zts.user_cert.idp_token_endpoint=http://keycloak.idp:8080/realms/master/protocol/openid-connect/token
    athenz.zts.user_cert.idp_jwks_endpoint=http://keycloak.idp:8080/realms/master/protocol/openid-connect/certs
```

With the Envoy HTTPS endpoint:

```properties
    athenz.zts.user_cert.idp_token_endpoint=https://keycloak.idp:8443/realms/master/protocol/openid-connect/token
    athenz.zts.user_cert.idp_jwks_endpoint=https://keycloak.idp:8443/realms/master/protocol/openid-connect/certs
```

Restart ZTS:

```sh
kubectl -n athenz rollout restart deployment/athenz-zts-server
kubectl -n athenz rollout status deployment/athenz-zts-server
```

```sh
# deployment.apps/athenz-zts-server restarted
# deployment "athenz-zts-server" successfully rolled out
```

Verify the active config values:

```sh
kubectl -n athenz get configmap athenz-zts-conf -o yaml | \
  grep -E 'athenz.zts.user_cert.idp_(token|jwks)_endpoint'
```

Expected output:

```properties
athenz.zts.user_cert.idp_token_endpoint=https://keycloak.idp:8443/realms/master/protocol/openid-connect/token
athenz.zts.user_cert.idp_jwks_endpoint=https://keycloak.idp:8443/realms/master/protocol/openid-connect/certs
```

## Rerun `zts-usercert`

Rerun the user certificate helper:

```sh
./tools/athenz/fetch-user-cert.sh \
  "./keys/user-idjag-learner.key" \
  "user.idjag-learner" \
  "./keys/user-idjag-learner.crt"
```

The browser authorization step can use either the HTTP or HTTPS URL — both ports are now active. The script defaults to the local HTTP URL; replace it with `https://localhost:34444` if you prefer HTTPS in the browser.

If the request still fails, check the ZTS logs:

```sh
kubectl logs -n athenz deployment/athenz-zts-server -c athenz-zts-server --tail=200
```

You should no longer see:

```sh
# IdP token endpoint must be an https url
```
