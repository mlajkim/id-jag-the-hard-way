|                                Previous                                 |                 Current                 |                                         Next                                          |
|:-----------------------------------------------------------------------:|:---------------------------------------:|:-------------------------------------------------------------------------------------:|
| [List all errors in ID_JAG exchange](./03-list-all-errors-in-id-jag.md) | **Access Token with ID-JAG using curl** | [List all errors in Access Token Exchange](./05-list-all-errors-in-token-exchange.md) |

# Challenge: Get Access Token with curl

Coming soon.


```sh
_get_access_token() {
  local scope="${1}"
  local _cert_path="./ai_client_gateway/certs/open-webui.crt"
  local _key_path="./ai_client_gateway/certs/open-webui.key"
  local zts_url="https://localhost:8443/zts/v1/oauth2/token"

  local response
  response=$(curl -s -k -X POST "$zts_url" \
    --cert "$_cert_path" \
    --key "$_key_path" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "grant_type=client_credentials&scope=$scope&expires_in=3600")

  local token
  token=$(echo "$response" | jq -r '.access_token // empty')

  if [ -z "$token" ]; then
    echo "🔥 [ERROR] Failed to issue an access token. Please check the response from the ZTS server:"
    echo "$response" | jq .
    return 1
  else
    _at="$token"
    echo "✅ [SUCCESS] Successfully issued access token and stored in _at=$_at"
    return 0
  fi
}

_get_access_token "api:role.docs-getter api:role.mcp-accessor"
```

# Next Challenge

[List all errors in Access Token Exchange](./05-list-all-errors-in-token-exchange.md)
