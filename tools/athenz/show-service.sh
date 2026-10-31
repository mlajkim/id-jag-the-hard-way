#!/usr/bin/env bash
set -euo pipefail

TOOLS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${TOOLS_DIR}/color.sh"

_athenz_service_context=''
if [ "${1:-}" = '--context' ]; then
  [ $# -ge 2 ] && [ -n "$2" ] || fatal 'Missing value for --context'
  _athenz_service_context=$2
  shift 2
fi

if [ $# -lt 2 ] || [ $# -gt 3 ]; then
  fatal "Usage: $0 [--context <context>] <domain> <service_name> [--summary]"
fi

domain=$1
service_name=$2
summary_output=false

if [ "${3:-}" = "--summary" ]; then
  summary_output=true
elif [ $# -eq 3 ]; then
  fatal "Unknown option: $3"
fi

[[ "${domain}" =~ ^[A-Za-z0-9][A-Za-z0-9.-]*$ ]] || fatal "Invalid domain: ${domain}"
if [[ "${service_name}" == *"_"* ]]; then
  fatal "Invalid service name '${service_name}': Athenz service names cannot contain underscores. Remove '_' from the service name, for example '${service_name//_/}'."
fi
[[ "${service_name}" =~ ^[A-Za-z0-9][A-Za-z0-9-]*$ ]] || fatal "Invalid service name: ${service_name}"

info "Showing service ${domain}.${service_name}..." >&2

if [ -n "${_athenz_service_context}" ]; then
  _athenz_service_request=(kubectl --context "${_athenz_service_context}" -n athenz exec deploy/athenz-cli --
    curl --cacert /etc/ssl/certs/ca-certificates.crt
    --cert /var/run/athenz/athenz_admin.cert.pem
    --key /var/run/athenz/athenz_admin.private.pem)
  _athenz_service_zms=https://athenz-zms-server.athenz:4443/zms/v1
else
  _zms_port=$("$TOOLS_DIR/port.sh" zms)
  _athenz_service_request=(curl -k --cacert ./athenz_dist/certs/ca.cert.pem
    --cert ./athenz_dist/certs/athenz_admin.cert.pem
    --key ./athenz_dist/keys/athenz_admin.private.pem)
  _athenz_service_zms="https://localhost:${_zms_port}/zms/v1"
fi

read_service_response() {
  curl_status=0
  response=$("${_athenz_service_request[@]}" --silent --show-error --noproxy '*' \
    --connect-timeout 10 --max-time 45 --write-out '\n%{http_code}' \
    "${_athenz_service_zms}/domain/${domain}/service/${service_name}$1") || curl_status=$?
  http_code=${response##*$'\n'}
  response=${response%$'\n'*}
}

read_service_response ''

if [ "${curl_status}" -ne 0 ] || [ "${http_code}" != "200" ]; then
  err "ZMS error response (HTTP ${http_code:-000}, curl ${curl_status}):"
  if [ -n "${response}" ]; then
    printf '%s\n' "${response}" >&2
  else
    err "No response body returned by ZMS."
  fi
  fatal "Failed to show service ${domain}.${service_name}"
fi

service_response="${response}"
client_id=""
client_id_present=false
client_id=$(echo "${service_response}" | jq -r '.clientId // .service.clientId // empty')
if [ "$(echo "${service_response}" | jq -r 'if (has("clientId") or ((.service? | type) == "object" and (.service | has("clientId")))) then "true" else "false" end')" = "true" ]; then
  client_id_present=true
fi

if [ "${client_id_present}" != "true" ]; then
  read_service_response '/meta/system/clientId'
  metadata_response=${response}

  if [ "${curl_status}" -eq 0 ] && [ "${http_code}" = "200" ] && [ -n "${metadata_response}" ]; then
    client_id=$(echo "${metadata_response}" | jq -r '.clientId // .value // .service.clientId // empty')
    if [ "$(echo "${metadata_response}" | jq -r 'if (has("clientId") or has("value") or ((.service? | type) == "object" and (.service | has("clientId")))) then "true" else "false" end')" = "true" ]; then
      client_id_present=true
    fi
  fi
fi

if [ "${summary_output}" != "true" ]; then
  if [ "${client_id_present}" = "true" ]; then
    echo "${service_response}" | jq --arg client_id "${client_id}" '
      if has("service") and (.service | type == "object") then
        .service += {clientId: $client_id}
      else
        . + {clientId: $client_id}
      end
    '
  else
    echo "${service_response}" | jq .
  fi
  exit 0
fi

service_id=$(echo "${service_response}" | jq -r '.name // .service.name // empty')
public_key_ids=$(echo "${service_response}" | jq -r '[.publicKeys[]?.id, .publicKeys[]?.keyId, .service.publicKeys[]?.id, .service.publicKeys[]?.keyId] | map(select(. != null)) | unique | join(", ")')

printf "service: %s\n" "${service_id:-${domain}.${service_name}}"
if [ "${client_id_present}" = "true" ]; then
  printf "client-id: %s\n" "${client_id}"
fi
if [ -n "${public_key_ids:-}" ]; then
  printf "public-key-ids: %s\n" "${public_key_ids}"
fi
