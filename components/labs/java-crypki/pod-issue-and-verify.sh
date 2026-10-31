#!/bin/sh
# Invoked by issue-and-verify.sh inside a private directory in athenz-cli.
set -eu
umask 077
. ./color.sh

crypki_domain=$1
crypki_service=$2
crypki_expected=$3
case "${crypki_expected}" in
  default-ca) crypki_wrong=special-ca ;;
  special-ca) crypki_wrong=default-ca ;;
  *) fatal "Unknown expected CA" ;;
esac
crypki_name="${crypki_domain}.${crypki_service}"
crypki_instance="crypki-$(date -u +%Y%m%d%H%M%S)-$$"
crypki_ip=$(hostname -i | awk '{print $1}')
printf '%s\n' "${crypki_ip}" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' \
  || fatal "The local lab requires an IPv4 CLI pod address"

zts_request() {
  crypki_method=$1
  crypki_path=$2
  crypki_response=$3
  crypki_expected_status=$4
  shift 4
  crypki_http=$(curl --silent --show-error --noproxy '*' --connect-timeout 10 --max-time 45 \
    --cacert /etc/ssl/certs/ca-certificates.crt \
    --connect-to athenz-zts-server.athenz:4443:athenz-zts-crypki-lab.athenz:4443 \
    --request "${crypki_method}" --header 'Content-Type: application/json' \
    --output "${crypki_response}" --write-out '%{http_code}' \
    "$@" "https://athenz-zts-server.athenz:4443/zts/v1/${crypki_path}") \
    || fatal "ZTS transport failed; curl diagnostics are above"
  info "ZTS ${crypki_method} ${crypki_path} -> HTTP ${crypki_http}"
  if [ "${crypki_http}" != "${crypki_expected_status}" ]; then
    jq '{code, message}' "${crypki_response}" >&2 \
      || warn "No JSON error body; raw response retained locally"
    fatal "Expected HTTP ${crypki_expected_status}, received ${crypki_http}; inspect $(pwd)"
  fi
}

info "Creating the service key and CSR in athenz-cli..."
openssl genrsa -traditional -out service.key 2048
zts-svccert -csr -private-key service.key \
  -domain "${crypki_domain}" -service "${crypki_service}" \
  -provider sys.auth.zts -instance "${crypki_instance}" \
  -ip "${crypki_ip}" -dns-domain zts.athenz.cloud > request.csr

zts_request GET "instance/sys.auth.zts/${crypki_domain}/${crypki_service}/${crypki_instance}/token" \
  registration-token.json 200 \
  --cert /var/run/athenz/athenz_admin.cert.pem --key /var/run/athenz/athenz_admin.private.pem
jq -e --arg domain "${crypki_domain}" --arg service "${crypki_service}" \
  '.provider == "sys.auth.zts" and .domain == $domain and .service == $service
   and (.attestationData | type == "string" and length > 0)' registration-token.json >/dev/null \
  || fatal "Unexpected registration-token response; inspect private files locally"
jq -n --arg domain "${crypki_domain}" --arg service "${crypki_service}" \
  --rawfile csr request.csr --slurpfile token registration-token.json \
  '{provider: "sys.auth.zts", domain: $domain, service: $service,
    attestationData: $token[0].attestationData, csr: $csr, expiryTime: 30}' > registration-request.json
zts_request POST instance identity.json 201 --data-binary @registration-request.json
jq -e --arg name "${crypki_name}" \
  '.name == $name and (.x509Certificate | type == "string" and length > 0)
   and (.x509CertificateSigner | type == "string" and length > 0)' identity.json >/dev/null \
  || fatal "Missing certificate/signer or unexpected service identity; inspect private files locally"
jq -r '.x509Certificate' identity.json > service.crt
jq -r '.x509CertificateSigner' identity.json > returned-ca.crt

crypki_cn=$(openssl x509 -in service.crt -noout -subject -nameopt RFC2253 \
  | sed 's/^subject=//' | tr ',' '\n' | sed -n 's/^CN=//p')
[ "${crypki_cn}" = "${crypki_name}" ] || fatal "Issued certificate CN does not match ${crypki_name}"
openssl x509 -in service.crt -noout -subject -issuer -fingerprint -sha256
crypki_expected_fp=$(openssl x509 -in "${crypki_expected}.crt" -noout -fingerprint -sha256)
crypki_wrong_fp=$(openssl x509 -in "${crypki_wrong}.crt" -noout -fingerprint -sha256)
crypki_returned_fp=$(openssl x509 -in returned-ca.crt -noout -fingerprint -sha256)
[ "${crypki_expected_fp}" != "${crypki_wrong_fp}" ] || fatal "The two lab CAs are identical"
[ "$(grep -c '^-----BEGIN CERTIFICATE-----$' returned-ca.crt)" -eq 1 ] \
  || fatal "Expected exactly one returned CA certificate"
[ "${crypki_expected_fp}" = "${crypki_returned_fp}" ] \
  || fatal "ZTS returned a different CA; check global/provider CA-bundle overrides in the clone"
ok "Returned CA fingerprint matches ${crypki_expected}"

info "Verifying with ${crypki_expected} as the only trusted CA..."
openssl verify -no-CApath -no-CAstore -CAfile "${crypki_expected}.crt" service.crt
openssl verify -no-CApath -no-CAstore -CAfile returned-ca.crt service.crt

info "Verifying that ${crypki_wrong} rejects this certificate..."
crypki_verify_status=0
openssl verify -no-CApath -no-CAstore -CAfile "${crypki_wrong}.crt" service.crt \
  > wrong-ca.log 2>&1 || crypki_verify_status=$?
cat wrong-ca.log
if [ "${crypki_verify_status}" -ne 2 ] \
  || ! grep -q '^error 20 at 0 depth lookup: unable to get local issuer certificate$' wrong-ca.log; then
  fatal "Expected OpenSSL error 20 with exit status 2; a different failure does not pass this test"
fi
ok "PASS: ${crypki_name} -> ${crypki_expected}; returned CA matches; ${crypki_wrong} rejected (error 20)"
info "Private request/response files remain in athenz-cli: $(pwd)"
