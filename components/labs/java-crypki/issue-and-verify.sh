#!/usr/bin/env bash
# Operator-run: transfers the two lab CA certificates and requests a new service identity.
set -euo pipefail

_crypki_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_crypki_root="$(cd "${_crypki_dir}/../../.." && pwd)"
source "${_crypki_root}/tools/color.sh"
[[ "$(kubectl config current-context)" == kind-kind ]] || fatal "Select the local kind-kind context first"
[[ $# -eq 3 ]] || fatal "Usage: $0 <domain> <service> <expected-ca>"
case "$1/$2/$3" in
  crypki-lab/api/default-ca|crypki-lab-special/api/special-ca|crypki-lab-special/override/default-ca) ;;
  *) fatal "Use one of the three domain/service/CA combinations in the research guide" ;;
esac

info "Issuing and verifying $1.$2 through the isolated Java Crypki ZTS..."
tar --no-xattrs -cf - \
  -C "${_crypki_dir}" pod-issue-and-verify.sh \
  -C "${_crypki_root}/tools" color.sh \
  -C "${_crypki_dir}/.state/ca" default-ca.crt special-ca.crt \
  | kubectl -n athenz exec -i deploy/athenz-cli -- sh -c '
    set -eu
    umask 077
    crypki_run=$(mktemp -d /tmp/idthw-java-crypki.XXXXXX)
    tar -xf - -C "${crypki_run}"
    cd "${crypki_run}"
    sh ./pod-issue-and-verify.sh "$@"
  ' sh "$1" "$2" "$3"
