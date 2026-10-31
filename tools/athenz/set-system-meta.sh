#!/usr/bin/env bash
set -euo pipefail

TOOLS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${TOOLS_DIR}/color.sh"

usage() {
  printf '%s\n' \
    "Usage: $0 [--context <context>] [--service <service>] [--json] <domain> <field> <value>" \
    '' \
    'Set one domain or service system-metadata field through the athenz-cli pod.' \
    'Use the JSON field name, such as x509CertSignerKeyId; the URL attribute is lowercased.' \
    'Values are strings by default. Use --json for null, booleans, numbers, or other JSON values.' \
    'Without --context, kubectl uses its current context. The namespace is athenz.'
}

_athenz_meta_kubectl=(kubectl)
_athenz_meta_service=''
_athenz_meta_json=false
while [ $# -gt 0 ]; do
  case "$1" in
    --context)
      [ $# -ge 2 ] && [ -n "$2" ] || fatal 'Missing value for --context'
      _athenz_meta_kubectl+=(--context "$2")
      shift 2
      ;;
    --service)
      [ $# -ge 2 ] && [ -n "$2" ] || fatal 'Missing value for --service'
      _athenz_meta_service=$2
      shift 2
      ;;
    --json)
      _athenz_meta_json=true
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    --)
      shift
      break
      ;;
    -*) fatal "Unknown option: $1" ;;
    *) break ;;
  esac
done

if [ $# -ne 3 ]; then
  usage >&2
  fatal 'Expected a domain, metadata field, and value'
fi

_athenz_meta_domain=$1
_athenz_meta_field=$2
_athenz_meta_value=$3
[[ "${_athenz_meta_domain}" =~ ^[A-Za-z0-9][A-Za-z0-9.-]*$ ]] \
  || fatal "Invalid domain: ${_athenz_meta_domain}"
[[ "${_athenz_meta_field}" =~ ^[A-Za-z][A-Za-z0-9]*$ ]] \
  || fatal "Invalid metadata field: ${_athenz_meta_field}"
if [ -n "${_athenz_meta_service}" ]; then
  [[ "${_athenz_meta_service}" =~ ^[A-Za-z0-9][A-Za-z0-9-]*$ ]] \
    || fatal "Invalid service name: ${_athenz_meta_service}"
fi

command -v jq >/dev/null 2>&1 || fatal 'jq is required'
command -v kubectl >/dev/null 2>&1 || fatal 'kubectl is required'
if [ "${_athenz_meta_json}" = true ]; then
  _athenz_meta_payload=$(jq -cn --arg field "${_athenz_meta_field}" \
    --argjson value "${_athenz_meta_value}" '{($field): $value}') \
    || fatal 'The value must be valid JSON when --json is used'
else
  _athenz_meta_payload=$(jq -cn --arg field "${_athenz_meta_field}" \
    --arg value "${_athenz_meta_value}" '{($field): $value}')
fi

_athenz_meta_attribute=$(printf '%s' "${_athenz_meta_field}" | tr '[:upper:]' '[:lower:]')
_athenz_meta_path="domain/${_athenz_meta_domain}"
_athenz_meta_target="${_athenz_meta_domain}"
if [ -n "${_athenz_meta_service}" ]; then
  _athenz_meta_path+="/service/${_athenz_meta_service}"
  _athenz_meta_target+=".${_athenz_meta_service}"
fi

info "Setting system metadata ${_athenz_meta_target}: ${_athenz_meta_payload}..."
_athenz_meta_status=0
_athenz_meta_response=$("${_athenz_meta_kubectl[@]}" -n athenz exec deploy/athenz-cli -- curl \
  --silent --show-error --fail-with-body --noproxy '*' --connect-timeout 10 --max-time 45 \
  --cacert /etc/ssl/certs/ca-certificates.crt \
  --cert /var/run/athenz/athenz_admin.cert.pem \
  --key /var/run/athenz/athenz_admin.private.pem \
  --header 'Content-Type: application/json' --header 'Y-Audit-Ref: IDTHW set-system-meta' \
  --request PUT --data "${_athenz_meta_payload}" \
  --write-out '\nHTTP %{http_code}\n' \
  "https://athenz-zms-server.athenz:4443/zms/v1/${_athenz_meta_path}/meta/system/${_athenz_meta_attribute}") \
  || _athenz_meta_status=$?
printf '%s\n' "${_athenz_meta_response}"

if [ "${_athenz_meta_status}" -ne 0 ] || [ "${_athenz_meta_response##*$'\n'}" != 'HTTP 204' ]; then
  fatal "Failed to set system metadata for ${_athenz_meta_target} (command exit ${_athenz_meta_status})"
fi
ok "System metadata set: ${_athenz_meta_target} ${_athenz_meta_field}"
