#!/usr/bin/env bash
set -euo pipefail

TOOLS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${TOOLS_DIR}/color.sh"

_athenz_domain_context=''
if [ "${1:-}" = '--context' ]; then
  [ $# -ge 2 ] && [ -n "$2" ] || fatal 'Missing value for --context'
  _athenz_domain_context=$2
  shift 2
fi

if [ $# -ne 1 ]; then
  fatal "Usage: $0 [--context <context>] <domain>"
fi

domain=$1
[[ "${domain}" =~ ^[A-Za-z0-9][A-Za-z0-9.-]*$ ]] || fatal "Invalid domain: ${domain}"

info "Showing domain ${domain}..." >&2

if [ -n "${_athenz_domain_context}" ]; then
  _athenz_domain_request=(kubectl --context "${_athenz_domain_context}" -n athenz exec deploy/athenz-cli --
    curl --cacert /etc/ssl/certs/ca-certificates.crt
    --cert /var/run/athenz/athenz_admin.cert.pem
    --key /var/run/athenz/athenz_admin.private.pem)
  _athenz_domain_zms=https://athenz-zms-server.athenz:4443/zms/v1
else
  _zms_port=$("${TOOLS_DIR}/port.sh" zms)
  _athenz_domain_request=(curl --cacert ./athenz_dist/certs/ca.cert.pem
    --cert ./athenz_dist/certs/athenz_admin.cert.pem
    --key ./athenz_dist/keys/athenz_admin.private.pem)
  _athenz_domain_zms="https://localhost:${_zms_port}/zms/v1"
fi

curl_status=0
response=$("${_athenz_domain_request[@]}" --silent --show-error --noproxy '*' \
  --connect-timeout 10 --max-time 45 --write-out '\n%{http_code}' \
  "${_athenz_domain_zms}/domain/${domain}") || curl_status=$?
http_code=${response##*$'\n'}
response=${response%$'\n'*}

if [ "${curl_status}" -ne 0 ] || [ "${http_code:-000}" != "200" ]; then
  err "ZMS error response (HTTP ${http_code:-000}, curl ${curl_status}):"
  if [ -n "${response}" ]; then
    printf '%s\n' "${response}" >&2
  else
    err "No response body returned by ZMS."
  fi
  fatal "Failed to show domain ${domain}"
fi

if command -v jq >/dev/null 2>&1; then
  printf '%s\n' "${response}" | jq .
else
  printf '%s\n' "${response}"
fi
