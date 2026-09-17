# IDTHW Demo API

A small document API for `idthw-demo-api-mcp` and the existing API MCP adapter. It uses TypeScript, Node's HTTP server, and [jose](https://github.com/panva/jose) for JWT verification and JWKS caching. `jose` is also used by this repository's MCP gateway.

This is a separate component and image, `ghcr.io/mlajkim/idthw-demo-api:latest`. The existing Java `components/api_server` and `api-server` image keep their current behavior.

## Authorization

The API verifies RS256 access tokens against trusted ZTS signing keys, requires `typ=at+jwt`, nonempty issuer and subject, an unexpired token, any `nbf` restriction, and audience `api`. It then checks the scope for the operation:

| Operation | Required scope | Response |
|---|---|---|
| `GET /api/docs` | `api:role.docs-getter` | `200`, `{ "docs": [...] }` |
| `POST /api/docs` | `api:role.docs-poster` | `201`, `{ "success": true, "doc": {...} }` |
| `DELETE /api/docs/{doc_id}` | `api:role.docs-deleter` | `200`, `{ "success": true, "message": "..." }` |

Both `scope` and `scp` accept strings or arrays. Short role names such as `docs-getter` are accepted only when `api` is the sole audience. Missing or invalid tokens receive `401`, insufficient scopes receive `403`, and unavailable signing keys receive `503`.

The API needs no local policy files or service certificate. ZTS controls token issuance; the API enforces the issued scopes. Removing role membership does not revoke an already-issued token before its expiry.

Documents are stored in memory, start with the same two sample documents as the Java API, and reset on restart. Creation requires nonempty `name` and `content` strings and a JSON body of at most 64 KiB. `GET /healthz` is public and checks only that the process is running. Request logs contain HTTP methods, status codes, and durations; they do not include tokens or request bodies.

## Configuration

| Environment variable | Default | Purpose |
|---|---|---|
| `PORT` | `8080`; `14444` with `make local` | HTTP listening port |
| `ATHENZ_JWKS_URL` | `https://athenz-zts-server.athenz:4443/zts/v1/oauth2/keys?rfc=true` | Trusted ZTS JWKS endpoint |
| `NODE_EXTRA_CA_CERTS` | Unset | CA bundle added to Node's TLS trust store at startup |
| `ATHENZ_EXPECTED_ISSUER` | Unset | Optional exact `iss` check in addition to trusting ZTS signing keys |
| `ATHENZ_JWKS_ALLOW_INSECURE_HTTP` | `false` | Enable HTTP JWKS for local tests only |

The tutorial ZTS uses its pod hostname as the issuer. Its JWKS endpoint is the default trust anchor; deployments with a stable issuer can also set `ATHENZ_EXPECTED_ISSUER`. Signing keys are loaded on the first token check and cached by `jose` for five minutes, with key refresh and a 30-second refresh cooldown handled by the library.

## Local development

From this directory, using Node.js 22.6 or later:

```sh
npm ci
make check test
```

With ZTS forwarded to port 8443, run this API on a separate local port:

```sh
NODE_EXTRA_CA_CERTS="$PWD/../../athenz_dist/certs/ca.cert.pem" make local
```

`make local` sets the JWKS endpoint to `https://localhost:8443/zts/v1/oauth2/keys?rfc=true`. Set the MCP adapter's `UPSTREAM_BASE_URL=http://127.0.0.1:14444` to try the new API locally.

## Image and Kubernetes

Build the new image locally:

```sh
make build-image
```

The separate `publish-idthw-demo-api.yml` workflow tests and builds this component on pull requests, and publishes its own image on main-branch pushes. It does not publish the existing `api-server` image.

After the new image is available, these commands deploy it alongside the existing API. Run them from the repository root with the tutorial's `api` namespace and Athenz installation already present:

```sh
kubectl -n api create configmap idthw-demo-api-ca \
  --from-file=ca.crt=./athenz_dist/certs/ca.cert.pem \
  --dry-run=client -o yaml | kubectl apply -f -
kubectl apply -f components/idthw-demo-api/deployment.yaml
kubectl -n api rollout status deployment/idthw-demo-api
```

For an MCP instance using this API, set:

```text
UPSTREAM_BASE_URL=http://idthw-demo-api.api:8080
```

The deployment uses its own Service name. Existing MCP instances continue using their configured upstream until you change it.
