|                       Previous                       |         Current         | Next |
|:----------------------------------------------------:|:-----------------------:|:----:|
| [Authorization Server](./04-authorization-server.md) | **Athenz Access Token** |  -   |

# Athenz Access Token

In this tutorial, you will get Access Token that the API server requests.

<!-- TOC -->

- [Athenz Access Token](#athenz-access-token)
  - [Create Athenz Top-Level Domain (TLD) for API Service](#create-athenz-top-level-domain-tld-for-api-service)
  - [Create Athenz Role under the API domain](#create-athenz-role-under-the-api-domain)
  - [Create Policies](#create-policies)
  - [Add Root User as a member](#add-root-user-as-a-member)
  - [Get Access Token as Root User](#get-access-token-as-root-user)
  - [Send request to the protected server](#send-request-to-the-protected-server)

<!-- /TOC -->

## Create Athenz Top-Level Domain (TLD) for API Service

Now that the Athenz server is running and accessible, let's create a Top-Level Domain (TLD). We can achieve this by making a `POST` request to the Athenz ZMS API, authenticating with the admin certificates generated during the deployment.

Let's create a reusable script named `create-tld.sh` that takes the domain name as an argument:

```sh
cat > create-tld.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

if [ -z "${1:-}" ]; then
  echo "Usage: $0 <tld_name>"
  exit 1
fi

tld_name=$1
echo "Creating TLD: ${tld_name}..."

curl -s -k -X POST "https://localhost:4443/zms/v1/domain" \
  --cert ./athenz_dist/certs/athenz_admin.cert.pem \
  --key ./athenz_dist/keys/athenz_admin.private.pem \
  -H "Content-Type: application/json" \
  -d '{
    "name": "'"${tld_name}"'",
    "description": "TLD for '"${tld_name}"'",
    "org": "ajkimkim",
    "enabled": true,
    "adminUsers": ["user.athenz_admin"]
  }'

EOF

chmod +x create-tld.sh

```

Create a domain `api` that represents the API server domain:

```sh
./create-tld.sh "api"

# {"description":"TLD for api","org":"ajkimkim","auditEnabled":false,"ypmId":0,"autoDeleteTenantAssumeRoleAssertions":false,"name":"api","modified":"2026-05-10T07:56:23.059Z","id":"bce22e30-4c45-11f1-8af4-88f84977247b"}
```

You can verify that this domain is created successfully by refreshing the **Athenz UI** (`http://localhost:3000`):

![05_create_api_tld](./assets/05_create_api_tld.png)

And finally, the new domain (or TLD) `api` represents the following blue dotted line:

![05_create_api_domain](./assets/05_create_api_domain.png)

## Create Athenz Role under the API domain

Athenz uses **Role-Based Access Control (RBAC)**. When a user or service is added to a role, they are granted the permissions associated with that role.

Earlier, in our API server, we needed a way to check if a client has permission to perform a `get` (HTTP method) operation on the `api`'s resource `docs` (or `api:docs` in Athenz Grammar). Currently, there are no roles defined for this, so let's create them.

Let's create a script named `create-role.sh` that takes the domain name and the role name as arguments:

```sh
cat > create-role.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 2 ]; then
  echo "Usage: $0 <domain> <role>"
  exit 1
fi

domain=$1
role=$2
echo "Creating Role: ${domain}:role.${role}..."

curl -s -k -X PUT "https://localhost:4443/zms/v1/domain/${domain}/role/${role}" \
  --cert ./athenz_dist/certs/athenz_admin.cert.pem \
  --key ./athenz_dist/keys/athenz_admin.private.pem \
  -H "Content-Type: application/json" \
  -d '{
    "name": "'"${domain}:role.${role}"'"
  }'

EOF

chmod +x create-role.sh
```

Now, execute the script to create the `docs-getter` role inside the `api` domain:

```sh
./create-role.sh "api" "docs-getter"

# Creating Role: api:role.docs-getter...
```

You can verify the new role by navigating to the `api` domain in the **Athenz UI** (`http://localhost:3000/domain/api/role`):

![05_create_api_domain_role](./assets/05_create_api_domain_role.png)

## Create Policies

The role we just created (`docs-getter`) is a container for members. The actual permissions are defined as **Policies** in Athenz and then attached to roles. Once attached, a member of that role inherits the defined permissions.

Let's create a script named `add-policy.sh` that helps to create policy:

```sh
cat > add-policy.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 4 ]; then
  echo "Usage: $0 <domain> <role_name> <resource> <action>"
  exit 1
fi

domain=$1
role_name=$2
resource=$3
action=$4
policy_name="${resource}-${action}-policy"

echo "Creating Policy: ${domain}:policy.${policy_name}..."

curl -s -k -X PUT "https://localhost:4443/zms/v1/domain/${domain}/policy/${policy_name}" \
  --cert ./athenz_dist/certs/athenz_admin.cert.pem \
  --key ./athenz_dist/keys/athenz_admin.private.pem \
  -H "Content-Type: application/json" \
  -d '{
    "name": "'"${domain}:policy.${policy_name}"'",
    "assertions": [
      {
        "role": "'"${domain}:role.${role_name}"'",
        "resource": "'"${domain}:${resource}"'",
        "action": "'"${action}"'"
      }
    ]
  }'

EOF

chmod +x add-policy.sh
```

The API server has its own logic to translate the client request to Athenz resource and action.

- HTTP Action `get` -> Athenz Action `get`
- HTTP Resource `docs` -> Athenz Resource `docs`

Therefore, we need to create a policy like this:

```sh
./add-policy.sh "api" "docs-getter" "docs" "get"
```

The command above means, attach a policy `docs-get-policy` to the role `docs-getter` under the domain `api`. This policy grants the role `docs-getter` the permission to `get` the resource `docs` under the domain `api`, or `docs:api`. The `get` action on `docs:api` is equivalent to the `GET /docs` request to the API server.

You can verify these policies and their assertions by navigating to the **Policies** tab under the `api` domain in the **Athenz UI**.

http://localhost:3000/domain/api/role/docs-getter/policy

![05_add_policy_to_role](./assets/05_add_policy_to_role.png)

## Add Root User as a member

When we manifested Athenz server, it gives us the root user certificate by default. For now, we will use the root user to get the access token. To get the Access Token for the specific role (or scope), we first need to add the root user as a member of the role.

```sh
cat > add-role-member.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 3 ]; then
  echo "Usage: $0 <domain> <role_name> <member_name>"
  exit 1
fi

domain=$1
role_name=$2
member_name=$3

echo "Adding Member ${member_name} to Role: ${domain}:role.${role_name}..."

curl -s -k -X PUT "https://localhost:4443/zms/v1/domain/${domain}/role/${role_name}/member/${member_name}" \
  --cert ./athenz_dist/certs/athenz_admin.cert.pem \
  --key ./athenz_dist/keys/athenz_admin.private.pem \
  -H "Content-Type: application/json" \
  -d '{
    "memberName": "'"${member_name}"'",
    "roleName": "'"${role_name}"'"
  }'

EOF

chmod +x add-role-member.sh
```

The default service name for the root user is `user.athenz_admin`. We can add the admin user as a member of the `docs-getter` role in the `api` domain:

```sh
./add-role-member.sh "api" "docs-getter" "user.athenz_admin"

# Adding Member user.athenz_admin to Role: api:role.docs-getter...
```

You can see that `user.athenz_admin` is added to the `docs-getter` role in the `api` domain:

http://localhost:3000/domain/api/role/docs-getter/members

![05_add_role_member](./assets/05_add_role_member.png)

## Get Access Token as Root User

At this point, we have the necessary ingredients to get the access token as `user.athenz_admin`. Let's create a script named `fetch-access-token.sh`:

```sh
cat > fetch-access-token.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 3 ]; then
  echo "Usage: $0 <cert_path> <key_path> <scope>"
  exit 1
fi

cert_path=$1
key_path=$2
scope=$3
zts_url="https://localhost:8443/zts/v1/oauth2/token"

# Print logs to stderr so stdout only outputs the pure token string
echo "Fetching Access Token for scope: ${scope}..." >&2

response=$(curl -s -k -X POST "${zts_url}" \
  --cert "${cert_path}" \
  --key "${key_path}" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&scope=${scope}&expires_in=3600")

token=$(echo "${response}" | jq -r '.access_token // empty')

if [ -z "${token}" ]; then
  echo "🔥 [ERROR] Failed to issue an access token. ZTS Response:" >&2
  echo "${response}" | jq . >&2
  exit 1
else
  echo "✅ [SUCCESS] Issued the following access token:" >&2
  echo "${token}" | jq -R 'split(".") | .[0] | @base64d | fromjson' >&2
  echo "${token}" | jq -R 'split(".") | .[1] | @base64d | fromjson' >&2
  echo "${token}"
fi
EOF

chmod +x fetch-access-token.sh
```

Execute the script, using your newly generated certificate and key, and save the output directly into a variable named `_root_user_at`.

```sh
_scope="api:role.docs-getter"
_root_user_at=$(./fetch-access-token.sh \
  "./athenz_dist/certs/athenz_admin.cert.pem" \
  "./athenz_dist/keys/athenz_admin.private.pem" \
  "${_scope}")

# Fetching Access Token for scope: api:role.docs-getter...
# ✅ [SUCCESS] Issued the following access token:
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

## Send request to the protected server

Last time we tried to access the `docs` resource of the API server, but we got a 401 Unauthorized error. With the Access Token, let's see if we can access it now.

```sh
curl -H "Authorization: Bearer $_root_user_at" http://localhost:14443/api/docs

# { "message": "Access token is valid, but the principal does not have permission to access the resource." }
```