#!/bin/sh
# Operator-run inside athenz-cli: verify an existing response; never request an identity.
set -eu

_crypki_verifier_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "${_crypki_verifier_dir}/color.sh"
[ "$#" -eq 3 ] || fatal "Usage: $0 <response-directory> <domain.service> <expected-ca>"
_crypki_run=$1
_crypki_name=$2
_crypki_expected=$3
case "${_crypki_name}/${_crypki_expected}" in
  crypki-lab.default.api/default-ca|crypki-lab.override/default-ca) _crypki_wrong=special-ca ;;
  crypki-lab.api/special-ca) _crypki_wrong=default-ca ;;
  *) fatal "Use one of the three service/CA combinations in the research guide" ;;
esac
cd "${_crypki_run}"

_crypki_cn=$(openssl x509 -in service.crt -noout -subject -nameopt RFC2253 \
  | sed 's/^subject=//' | tr ',' '\n' | sed -n 's/^CN=//p')
[ "${_crypki_cn}" = "${_crypki_name}" ] || fatal "Issued certificate CN does not match ${_crypki_name}"
openssl x509 -in service.crt -noout -subject -issuer -fingerprint -sha256
_crypki_expected_fp=$(openssl x509 -in "/tmp/idthw-java-crypki-ca/${_crypki_expected}.crt" \
  -noout -fingerprint -sha256)
_crypki_wrong_fp=$(openssl x509 -in "/tmp/idthw-java-crypki-ca/${_crypki_wrong}.crt" \
  -noout -fingerprint -sha256)
_crypki_returned_fp=$(openssl x509 -in returned-ca.crt -noout -fingerprint -sha256)
[ "${_crypki_expected_fp}" != "${_crypki_wrong_fp}" ] || fatal "The two lab CAs are identical"
[ "$(grep -c '^-----BEGIN CERTIFICATE-----$' returned-ca.crt)" -eq 1 ] \
  || fatal "Expected exactly one returned CA certificate"
[ "${_crypki_expected_fp}" = "${_crypki_returned_fp}" ] \
  || fatal "ZTS returned a different CA; check global/provider CA-bundle overrides on athenz-zts-server"
ok "Returned CA fingerprint matches ${_crypki_expected}"

info "Verifying with ${_crypki_expected} as the only trusted CA..."
openssl verify -no-CApath -no-CAstore \
  -CAfile "/tmp/idthw-java-crypki-ca/${_crypki_expected}.crt" service.crt
openssl verify -no-CApath -no-CAstore -CAfile returned-ca.crt service.crt

info "Verifying that ${_crypki_wrong} rejects this certificate..."
_crypki_verify_status=0
openssl verify -no-CApath -no-CAstore \
  -CAfile "/tmp/idthw-java-crypki-ca/${_crypki_wrong}.crt" service.crt \
  > wrong-ca.log 2>&1 || _crypki_verify_status=$?
cat wrong-ca.log
if [ "${_crypki_verify_status}" -ne 2 ] \
  || ! grep -q '^error 20 at 0 depth lookup: unable to get local issuer certificate$' wrong-ca.log; then
  fatal "Expected OpenSSL error 20 with exit status 2; a different failure does not pass this test"
fi
ok "PASS: ${_crypki_name} -> ${_crypki_expected}; returned CA matches; ${_crypki_wrong} rejected (error 20)"
info "Private request/response files remain in athenz-cli: $(pwd)"
