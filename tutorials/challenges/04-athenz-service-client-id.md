|                   Previous                   |                Current                 | Next |
|:--------------------------------------------:|:--------------------------------------:|:----:|
| [ID-JAG with Curl](./02-id-jag-with-curl.md) | **List all errors in ID_JAG Exchange** | n/a  |

# Challenge: ID_JAG with Human User Certificate

Athenz offers to have a customized Oauth2 client_id for a specific service name ([Code](https://github.com/AthenZ/athenz/blob/master/core/zms/src/main/rdl/ServiceIdentity.tdl#L61))

You can get `id_token` with the following:

```sh
_id_token=$(curl -s -X POST "http://localhost:9090/realms/master/protocol/openid-connect/token" \
  -d "client_id=ai.open-webui" \
  -d "client_secret=wdoKE9MBkgjLayZLg9Q6xU2oP2IOZKXv" \
  -d "username=idjag-learner" \
  -d "password=password" \
  -d "scope=openid email profile" \
  -d "grant_type=password" | jq -r '.id_token')

echo $_id_token | jq -R 'split(".") | .[1] | @base64d | fromjson'
```

And you can get `ID_JAG` with the following:

```sh
local _cert_path="./ai_client_gateway/certs/open-webui.crt"
local _key_path="./ai_client_gateway/certs/open-webui.key"
local _ca_cert="./athenz_dist/certs/ca.cert.pem"
local _zts_url="https://localhost:8443/zts/v1/oauth2/token"
local _role_scope="api:role.mcp-accessor api:role.docs-getter"
local _id_jag_aud="https://athenz-zts-server.athenz:4443/zts/v1"

_id_jag=$(curl -sS -X POST "$_zts_url" \
  --cert "$_cert_path" \
  --key "$_key_path" \
  --cacert "$_ca_cert" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "grant_type=urn:ietf:params:oauth:grant-type:token-exchange" \
  --data-urlencode "requested_token_type=urn:ietf:params:oauth:token-type:id-jag" \
  --data-urlencode "subject_token_type=urn:ietf:params:oauth:token-type:id_token" \
  --data-urlencode "subject_token=$_id_token" \
  --data-urlencode "scope=$_role_scope" \
  --data-urlencode "audience=$_id_jag_aud" | jq -r .access_token)

echo $_id_jag | jq -R 'split(".") | .[0] | @base64d | fromjson'
echo $_id_jag | jq -R 'split(".") | .[1] | @base64d | fromjson'
```

Note that we have used the `open-webui.crt`, not `human.idjag-learner`. And this is correct because AI Agent will do on behalf of you. But, do you think you can pass this:

```sh
local _cert_path="./keys/idjag-learner.crt"
local _key_path="./keys/idjag-learner.key"
local _ca_cert="./athenz_dist/certs/ca.cert.pem"
local _zts_url="https://localhost:8443/zts/v1/oauth2/token"
local _role_scope="api:role.mcp-accessor api:role.docs-getter"
local _id_jag_aud="https://athenz-zts-server.athenz:4443/zts/v1"

curl -sS -X POST "$_zts_url" \
  --cert "$_cert_path" \
  --key "$_key_path" \
  --cacert "$_ca_cert" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "grant_type=urn:ietf:params:oauth:grant-type:token-exchange" \
  --data-urlencode "requested_token_type=urn:ietf:params:oauth:token-type:id-jag" \
  --data-urlencode "subject_token_type=urn:ietf:params:oauth:token-type:id_token" \
  --data-urlencode "subject_token=$_id_token" \
  --data-urlencode "scope=$_role_scope" \
  --data-urlencode "audience=$_id_jag_aud"
```

You will get this:

```sh
# {"code":400,"message":"Invalid subject token audience"}
```

How to actually get `ID_JAG`, without modifying code but instead interacting directly with Athenz Server?

<details>
<summary>Click to expand the solution</summary>
<br>

ZTS Server will output this kind of error:

```sh
# ERROR com.yahoo.athenz.zts.ZTSImpl - The subject token does not have expected audience: human.idjag-learner/ai.client-gateway
```



Get service account metadata:

```sh
local _domain="human"
local _service="idjag-learner"

local _ca_cert="./athenz_dist/certs/ca.cert.pem"
local _cert="./athenz_dist/certs/athenz_admin.cert.pem"
local _key="./athenz_dist/keys/athenz_admin.private.pem"

curl -s -k -X GET "https://localhost:4443/zms/v1/domain/${_domain}/service/${_service}" \
  --cert "$_cert" \
  --key "$_key" \
  -H "Content-Type: application/json" | jq .
```

```sh
# {
#   "name": "human.idjag-learner",
#   "publicKeys": [
#     {
#       "key": "....Redacted...",
#       "id": "v1"
#     }
#   ],
#   "modified": "2026-05-17T07:19:14.418Z"
# }
```

## Set Permission

> [!NOTE]
> You need `authorize ("update", "sys.auth:meta.service.{attribute}.{domain}")`, but if you use `athenz_admin.cert.pem`, you can bypass permission setting

Run the following command:

```sh
_zms_url="https://localhost:4443/zms/v1"

_domain="human"
_service="idjag-learner"
_new_client_id="ai.open-webui"

_admin_cert="./athenz_dist/certs/athenz_admin.cert.pem"
_admin_key="./athenz_dist/keys/athenz_admin.private.pem"
_ca_cert="./athenz_dist/certs/ca.cert.pem"

curl -si "%{http_code}\n" -X PUT "$_zms_url/domain/$_domain/service/$_service/meta/system/clientId" \
  --cert "$_admin_cert" \
  --key "$_admin_key" \
  --cacert "$_ca_cert" \
  -H "Content-Type: application/json" \
  -H "Y-Audit-Ref: set-client-id-for-id-jag" \
  -d "{\"clientId\":\"$_new_client_id\"}"
```

```sh
# HTTP/1.1 204 No Content
# Host: athenz-zms-server-568d4cfd89-9z2bz
```

Then check once again with `clientId`:

```sh
_domain="human"
_service="idjag-learner"
local _ca_cert="./athenz_dist/certs/ca.cert.pem"
local _cert="./athenz_dist/certs/athenz_admin.cert.pem"
local _key="./athenz_dist/keys/athenz_admin.private.pem"

curl -s -k -X GET "https://localhost:4443/zms/v1/domain/${_domain}/service/${_service}" \
  --cert "$_cert" \
  --key "$_key" \
  -H "Content-Type: application/json" | jq .
```

New field `"clientId": "ai.open-webui"`

```sh
# {
#   "name": "human.idjag-learner",
#   "publicKeys": [
#     {
#       "key": "...Redacted...",
#       "id": "v1"
#     }
#   ],
#   "modified": "2026-06-09T02:39:49.001Z",
#   "clientId": "ai.open-webui"
# }
```

> [!NOTE]
> [Source Code](https://github.com/AthenZ/athenz/blob/master/core/zms/src/main/rdl/ServiceIdentity.rdli#L148-L164)


Then try to get `ID_JAG` Once again:


```sh
local _cert_path="./keys/idjag-learner.crt"
local _key_path="./keys/idjag-learner.key"
local _ca_cert="./athenz_dist/certs/ca.cert.pem"
local _zts_url="https://localhost:8443/zts/v1/oauth2/token"
local _role_scope="api:role.mcp-accessor api:role.docs-getter"
local _id_jag_aud="https://athenz-zts-server.athenz:4443/zts/v1"

curl -sS -X POST "$_zts_url" \
  --cert "$_cert_path" \
  --key "$_key_path" \
  --cacert "$_ca_cert" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "grant_type=urn:ietf:params:oauth:grant-type:token-exchange" \
  --data-urlencode "requested_token_type=urn:ietf:params:oauth:token-type:id-jag" \
  --data-urlencode "subject_token_type=urn:ietf:params:oauth:token-type:id_token" \
  --data-urlencode "subject_token=$_id_token" \
  --data-urlencode "scope=$_role_scope" \
  --data-urlencode "audience=$_id_jag_aud"
```


</details>

