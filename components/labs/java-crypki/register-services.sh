#!/usr/bin/env bash
# Operator-run: authenticates with the IDTHW admin certificate.
set -euo pipefail

_crypki_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_crypki_root="$(cd "${_crypki_dir}/../../.." && pwd)"
source "${_crypki_root}/tools/color.sh"
[[ "$(kubectl config current-context)" == kind-kind ]] || fatal "Select the local kind-kind context first"
cd "${_crypki_root}"
_crypki_remote=$(kubectl -n athenz exec deploy/athenz-cli -- mktemp -d /tmp/idthw-crypki-meta.XXXXXX)

zms_request() {
  local crypki_method=$1 crypki_path=$2
  shift 2
  _crypki_http=$(kubectl -n athenz exec deploy/athenz-cli -- curl \
    --silent --show-error --noproxy '*' --connect-timeout 10 --max-time 45 \
    --cacert /etc/ssl/certs/ca-certificates.crt \
    --cert /var/run/athenz/athenz_admin.cert.pem \
    --key /var/run/athenz/athenz_admin.private.pem \
    --request "${crypki_method}" --header 'Content-Type: application/json' \
    --output "${_crypki_remote}/response.json" --write-out '%{http_code}' \
    "$@" "https://athenz-zms-server.athenz:4443/zms/v1/${crypki_path}") \
    || fatal "ZMS transport failed; curl diagnostics are above"
  info "ZMS ${crypki_method} ${crypki_path} -> HTTP ${_crypki_http}"
}

expect_status() {
  if [[ "${_crypki_http}" != "$1" ]]; then
    kubectl -n athenz exec deploy/athenz-cli -- jq '{code, message}' "${_crypki_remote}/response.json" >&2 \
      || warn "No JSON error body; raw response retained in ${_crypki_remote}"
    fatal "Expected HTTP $1, received ${_crypki_http}"
  fi
}

check_signer() {
  zms_request GET "$1"
  expect_status 200
  kubectl -n athenz exec deploy/athenz-cli -- jq -e --arg expected "$2" \
    '(.x509CertSignerKeyId // "") == $expected' "${_crypki_remote}/response.json" >/dev/null \
    || fatal "Unexpected signer metadata on $1"
}

info "Checking that both research domains are unused..."
for _crypki_domain in crypki-lab crypki-lab-special; do
  zms_request GET "domain/${_crypki_domain}"
  [[ "${_crypki_http}" != 200 ]] || fatal "${_crypki_domain} already exists; no existing domain will be changed"
  expect_status 404
done

for _crypki_domain in crypki-lab crypki-lab-special; do
  ./tools/athenz/create-tld.sh "${_crypki_domain}"
  ./tools/athenz/create-service.sh "${_crypki_domain}" api
  ./tools/athenz/create-role.sh "${_crypki_domain}" crypki-lab-provider
  ./tools/athenz/add-role-member.sh "${_crypki_domain}" crypki-lab-provider sys.auth.zts
  ./tools/athenz/add-policy.sh "${_crypki_domain}" crypki-lab-provider launch service.api
done
./tools/athenz/create-service.sh crypki-lab-special override
./tools/athenz/add-policy.sh crypki-lab-special crypki-lab-provider launch service.override

zms_request PUT domain/crypki-lab-special/meta/system/x509certsignerkeyid \
  --data '{"x509CertSignerKeyId":"special-ca"}'
expect_status 204
zms_request PUT domain/crypki-lab-special/service/override/meta/system/x509certsignerkeyid \
  --data '{"x509CertSignerKeyId":"default-ca"}'
expect_status 204

check_signer domain/crypki-lab ''
check_signer domain/crypki-lab/service/api ''
check_signer domain/crypki-lab-special special-ca
check_signer domain/crypki-lab-special/service/api ''
check_signer domain/crypki-lab-special/service/override default-ca
ok "crypki-lab.api: no domain/service signer ID (default-ca fallback)"
ok "crypki-lab-special.api: domain=special-ca, service unset"
ok "crypki-lab-special.override: domain=special-ca, service=default-ca"
