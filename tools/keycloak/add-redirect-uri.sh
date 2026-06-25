#!/usr/bin/env bash
set -euo pipefail

TOOLS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${TOOLS_DIR}/color.sh"
_keycloak_port=$("$TOOLS_DIR/port.sh" keycloak)
_realm=$("$TOOLS_DIR/config.sh" keycloak realm)
_admin=$("$TOOLS_DIR/config.sh" keycloak admin)
_admin_password=$("$TOOLS_DIR/config.sh" keycloak admin-password)

if [ $# -lt 2 ]; then
  fatal "Usage: $0 <client_id> <redirect_uri> [<redirect_uri> ...]"
fi

client_id=$1
shift
new_uris=("$@")

token=$(curl -s -X POST \
  "http://localhost:${_keycloak_port}/realms/master/protocol/openid-connect/token" \
  -d "client_id=admin-cli" \
  -d "username=${_admin}" \
  -d "password=${_admin_password}" \
  -d "grant_type=password" \
  | sed 's/.*"access_token":"\([^"]*\)".*/\1/')

if [ -z "$token" ] || [ "$token" = "null" ]; then
  fatal "Failed to obtain admin token"
fi

client_uuid=$(curl -s \
  "http://localhost:${_keycloak_port}/admin/realms/${_realm}/clients?clientId=${client_id}" \
  -H "Authorization: Bearer ${token}" \
  | sed 's/.*"id":"\([^"]*\)".*/\1/' | head -1)

if [ -z "$client_uuid" ] || [ "$client_uuid" = "null" ]; then
  fatal "Client not found: ${client_id}"
fi

# Build JSON array from all provided URIs
uris_json=$(printf '"%s",' "${new_uris[@]}" | sed 's/,$//')

info "Setting redirect URIs for ${client_id}: ${new_uris[*]}"

http_code=$(curl -s -o /dev/null -w "%{http_code}" -X PUT \
  "http://localhost:${_keycloak_port}/admin/realms/${_realm}/clients/${client_uuid}" \
  -H "Authorization: Bearer ${token}" \
  -H "Content-Type: application/json" \
  -d "{\"redirectUris\": [${uris_json}]}")

if [ "$http_code" != "204" ]; then
  fatal "Failed to update redirect URIs (HTTP ${http_code})"
fi

ok "Redirect URIs updated for ${client_id}"
