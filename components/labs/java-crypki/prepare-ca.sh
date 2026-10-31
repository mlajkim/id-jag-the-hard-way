#!/usr/bin/env bash
# Operator-run: generates, reads, and transfers disposable CA credentials.
set -euo pipefail
umask 077

_crypki_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${_crypki_dir}/../../../tools/color.sh"
[[ "$(kubectl config current-context)" == kind-kind ]] || fatal "Select the local kind-kind context first"
mkdir -p "${_crypki_dir}/.state"
mkdir "${_crypki_dir}/.state/ca" || fatal "CA directory already exists; preserve it and inspect the previous run"

info "Creating two disposable CA/key pairs with the CLI container's OpenSSL..."
if ! kubectl -n athenz exec -i deploy/athenz-cli -- sh <<'SH' \
  | tar -xf - -C "${_crypki_dir}/.state/ca"; then
set -eu
umask 077
crypki_ca=$(mktemp -d /tmp/idthw-crypki-ca.XXXXXX)
for crypki_name in default special; do
  case "${crypki_name}" in
    default) crypki_subject='/O=IDTHW Crypki Lab/CN=IDTHW Default CA' ;;
    special) crypki_subject='/O=IDTHW Crypki Lab/CN=IDTHW Special CA' ;;
  esac
  openssl genrsa -traditional -out "${crypki_ca}/${crypki_name}.key" 2048
  openssl req -new -x509 -sha256 -days 7 \
    -key "${crypki_ca}/${crypki_name}.key" \
    -subj "${crypki_subject}" \
    -addext 'basicConstraints=critical,CA:TRUE,pathlen:0' \
    -addext 'keyUsage=critical,keyCertSign,cRLSign' \
    -out "${crypki_ca}/${crypki_name}-ca.crt"
  openssl verify -check_ss_sig -no-CApath -no-CAstore \
    -CAfile "${crypki_ca}/${crypki_name}-ca.crt" "${crypki_ca}/${crypki_name}-ca.crt" >&2
  openssl x509 -in "${crypki_ca}/${crypki_name}-ca.crt" \
    -noout -subject -fingerprint -sha256 >&2
done
printf 'CA preparation directory in athenz-cli: %s\n' "${crypki_ca}" >&2
tar -C "${crypki_ca}" -cf - default.key special.key default-ca.crt special-ca.crt
SH
  fatal "CA preparation failed; partial files are retained for inspection"
fi
chmod 600 "${_crypki_dir}/.state/ca/"{default.key,special.key,default-ca.crt,special-ca.crt}
ok "Prepared default-ca and special-ca; local files are under components/labs/java-crypki/.state/ca"
