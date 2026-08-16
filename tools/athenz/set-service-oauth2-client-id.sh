#!/usr/bin/env bash
set -euo pipefail

TOOLS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${TOOLS_DIR}/color.sh"
_zms_port=$("$TOOLS_DIR/port.sh" zms)

if [ $# -lt 3 ]; then
  fatal "Usage: $0 <domain> <service_name> <oauth2_client_id>"
fi

domain=$1
service_name=$2
client_id=$3

info "Setting OAuth2 client id for ${domain}.${service_name} -> ${client_id}..."

tmp_response=$(mktemp)
trap 'rm -f "${tmp_response}"' EXIT

status=$(curl -s -k -o "${tmp_response}" -w "%{http_code}" -X PUT \
  "https://localhost:${_zms_port}/zms/v1/domain/${domain}/service/${service_name}/meta/system/clientid" \
  --cert ./athenz_dist/certs/athenz_admin.cert.pem \
  --key ./athenz_dist/keys/athenz_admin.private.pem \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "'"${client_id}"'"
  }')

if [ "${status}" != "200" ] && [ "${status}" != "204" ]; then
  err "ZMS error response (HTTP ${status}):"
  cat "${tmp_response}" >&2
  fatal "Failed to set OAuth2 client id for ${domain}.${service_name}"
fi

ok "OAuth2 client id set: ${domain}.${service_name} -> ${client_id}"
