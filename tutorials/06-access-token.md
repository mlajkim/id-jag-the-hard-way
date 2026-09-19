|             Previous             |         Current         |                        Next                        |
|:--------------------------------:|:-----------------------:|:--------------------------------------------------:|
| [Authorization Server](./05-authorization-server.md) | **Access Token** | [Granular Permission](./07-granular-permission.md) |

# Access Token

In chapter 04, you enabled access-token enforcement and saw an unauthenticated request fail. Now configure the API to trust Athenz, request an access token, and use it to read documents.

<!-- TOC depthFrom:2 depthTo:2 -->

- [Create the API domain](#create-the-api-domain)
- [Trust the ZTS signing-key endpoint](#trust-the-zts-signing-key-endpoint)
- [Create the Document-Reading Role](#create-the-document-reading-role)
- [Understand the required API scopes](#understand-the-required-api-scopes)
- [Add the Administrator to the Role](#add-the-administrator-to-the-role)
- [Request a Token as the Administrator](#request-a-token-as-the-administrator)
- [Call the Protected API](#call-the-protected-api)
- [Review the Result](#review-the-result)
- [Next Steps](#next-steps)

<!-- /TOC -->

## Create the API domain

Create the Athenz domain that represents the API:

```sh
./tools/athenz/create-tld.sh "api"
```

```sh
#   ·  Creating TLD: api...
#   ✔  TLD created: api
```

This domain is separate from the Kubernetes namespace `api` created in chapter 04.

## Trust the ZTS signing-key endpoint

The API verifies access tokens using ZTS's public signing keys. Mount the tutorial CA so Node.js can authenticate the HTTPS connection to ZTS:

```sh
kubectl -n api create configmap api-zts-ca \
  --from-file=ca.crt=./athenz_dist/certs/ca.cert.pem

kubectl patch deploy api-server -n api --patch "$(cat <<'EOF'
spec:
  template:
    spec:
      containers:
        - name: idthw-demo-api
          env:
            - name: NODE_EXTRA_CA_CERTS
              value: /var/run/athenz/ca.crt
          volumeMounts:
            - name: zts-ca
              mountPath: /var/run/athenz
              readOnly: true
      volumes:
        - name: zts-ca
          configMap:
            name: api-zts-ca
EOF
)"
kubectl rollout status deploy/api-server -n api
```

The container is named `idthw-demo-api`, matching the image used in chapter 04. The Deployment and Service are named `api-server`.

<a id="create-athenz-role-under-the-api-domain"></a>

## Create the Document-Reading Role

Athenz uses **Role-Based Access Control (RBAC)**. ZTS checks role membership before issuing the requested role scope. The API checks that signed scope against the requested operation.

Reading documents requires the `api:role.docs-getter` scope. Create that role first.

> [!NOTE]
> `create-role.sh` — PUTs an empty role definition to the ZMS API, creating a named role under a given domain. Run `cat ./tools/athenz/create-role.sh` to inspect.

Now, execute the script to create the `docs-getter` role inside the `api` domain:

```sh
UI_OPEN=true ./tools/athenz/create-role.sh "api" "docs-getter"
```

```sh
#   ·  Creating Role: api:role.docs-getter...
#   ✔  Role created: api:role.docs-getter
#   ✔  Opened: http://localhost:3000/domain/api/role
```

This creates the role and opens the role page in the Athenz UI.

![07_create_api_domain_role](./assets/07_create_api_domain_role.png)

## Understand the required API scopes

The API validates the token's signature against trusted ZTS signing keys, its expiry, and audience `api`. Each operation requires an exact scope:

| Operation | Required scope |
|---|---|
| `GET /api/docs` | `api:role.docs-getter` |
| `POST /api/docs` | `api:role.docs-poster` |
| `DELETE /api/docs/{doc_id}` | `api:role.docs-deleter` |

The API accepts `scope` or `scp` claims and also accepts short role names, such as `docs-getter`, when `api` is the sole audience. A read token cannot create or delete documents.

These mappings live in the API; it does not download or evaluate Athenz action/resource policies. ZTS still controls token issuance, and later chapters configure the policies needed for token exchange and ID-JAG. Removing role membership stops new grants after ZTS observes the change; an already-issued token can remain usable until it expires.

<a id="add-root-user-as-a-member"></a>

## Add the Administrator to the Role

The Athenz deployment provides a certificate for the administrator principal, `user.athenz_admin`. Use it for this first token request. ZTS requires the requester to be a member of the role specified in the requested scope.

> [!NOTE]
> `add-role-member.sh` — PUTs a member entry to a role via the ZMS API, granting that principal the permissions associated with the role. Run `cat ./tools/athenz/add-role-member.sh` to inspect.

Add `user.athenz_admin` to the `docs-getter` role in the `api` domain:

```sh
./tools/athenz/add-role-member.sh "api" "docs-getter" "user.athenz_admin"
```

You can see that `user.athenz_admin` is added to the `docs-getter` role in the `api` domain:

```sh
_athenz_ui_port=$(./tools/port.sh athenz-ui)
./tools/open.sh "http://localhost:${_athenz_ui_port}/domain/api/role/docs-getter/members"
```

![07_add_role_member](./assets/07_add_role_member.png)

<a id="get-access-token-as-root-user"></a>

## Request a Token as the Administrator

> [!NOTE]
> `fetch-access-token.sh` — POSTs a `client_credentials` grant to the ZTS token endpoint and returns a signed Athenz access token scoped to the requested role. Run `cat ./tools/athenz/fetch-access-token.sh` to inspect.

Execute the script, using the administrator certificate and key generated by the Athenz distribution, and save the output directly into a variable named `_root_user_at`.

```sh
_scope="api:role.docs-getter"
_root_user_at=$(./tools/athenz/fetch-access-token.sh \
  "./athenz_dist/certs/athenz_admin.cert.pem" \
  "./athenz_dist/keys/athenz_admin.private.pem" \
  "${_scope}" \
  "./keys/api_docs-getter.jwt")
```

```sh
#   ·  Fetching Access Token for scope: api:role.docs-getter...
#   ✔  Access token issued for scope: api:role.docs-getter
# {
#   "kid": "athenz-zts-server-6966ff7f66-4j67d",
#   "typ": "at+jwt",
#   "alg": "RS256"
# }
# {
#   "sub": "user.athenz_admin",
#   "scp": [
#     "docs-getter"
#   ],
#   "ver": 1,
#   "iss": "athenz-zts-server-6966ff7f66-4j67d",
#   "client_id": "user.athenz_admin",
#   "aud": "api",
#   "uid": "user.athenz_admin",
#   "auth_time": 1778407550,
#   "scope": "docs-getter",
#   "cnf": {
#     "x5t#S256": "ify-xpF2OH2YWreL9ollKhZZt6xM35BPhli-dNnt19Y"
#   },
#   "exp": 1778411150,
#   "iat": 1778407550,
#   "jti": "b5836abf-3033-439d-82cd-0c02a662862d"
# }
```

<a id="send-request-to-the-protected-server"></a>

## Call the Protected API

In chapter 04, the API rejected the request without an access token. Now pass the issued token as `Authorization: Bearer <token>`:

> [!NOTE]
> If you see `curl: (52) Empty reply from server`, wait a few seconds and try again.

```sh
curl -sS -k -H "Authorization: Bearer $_root_user_at" http://localhost:14443/api/docs | jq .
```

```sh
# {
#   "docs": [
#     {
#       "name": "first default doc",
#       "id": 1,
#       "content": "hello world"
#     },
#     {
#       "name": "second default doc",
#       "id": 2,
#       "content": "how are you?"
#     }
#   ]
# }
```

<a id="whats-done"></a>

## Review the Result

We have successfully retrieved an Athenz access token as `user.athenz_admin` and used it to access the protected API.

![Administrator requests an Athenz access token and calls the protected API](./assets/core_06_admin_access.svg)

<a id="whats-next"></a>

## Next Steps

The administrator can also manage Athenz domains and policies. Routine API calls do not need those privileges. In the next chapter, you will create a dedicated learner identity and grant it the document-reading role.

Next: [Granular Permission](./07-granular-permission.md)
