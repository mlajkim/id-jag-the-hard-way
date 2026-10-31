#!/usr/bin/env bash
# Operator-run: reads live configuration and copies disposable credentials into a new Secret.
set -euo pipefail
umask 077

_crypki_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${_crypki_dir}/../../../tools/color.sh"
[[ "$(kubectl config current-context)" == kind-kind ]] || fatal "Select the local kind-kind context first"
for _crypki_file in target/idthw-java-crypki-lab.jar .state/ca/default.key .state/ca/special.key \
  .state/ca/default-ca.crt .state/ca/special-ca.crt; do
  [[ -f "${_crypki_dir}/${_crypki_file}" ]] || fatal "Missing ${_crypki_file}; complete the build and CA setup first"
done

info "Checking that the isolated Kubernetes resource names are unused..."
for _crypki_resource in secret/idthw-java-crypki-ca configmap/idthw-java-crypki-code \
  configmap/athenz-zts-crypki-lab-conf deployment/athenz-zts-crypki-lab service/athenz-zts-crypki-lab; do
  _crypki_existing=$(kubectl -n athenz get "${_crypki_resource}" --ignore-not-found -o name)
  [[ -z "${_crypki_existing}" ]] || fatal "${_crypki_resource} already exists; existing resources are preserved"
done

mkdir -p "${_crypki_dir}/.state"
_crypki_state=$(mktemp -d "${_crypki_dir}/.state/deployment.XXXXXX")
info "Rendering a separate Deployment, Service, and ZTS ConfigMap..."
kubectl -n athenz get deployment athenz-zts-server -o json > "${_crypki_state}/source-deployment.json"
_crypki_conf=$(python3 -c '
import json, sys
with open(sys.argv[1]) as source:
    volumes = json.load(source)["spec"]["template"]["spec"]["volumes"]
print(next(v["configMap"]["name"] for v in volumes if v["name"] == "athenz-zts-conf"))
' "${_crypki_state}/source-deployment.json")
kubectl -n athenz get configmap "${_crypki_conf}" -o json > "${_crypki_state}/source-configmap.json"
python3 "${_crypki_dir}/render-lab.py" \
  --deployment "${_crypki_state}/source-deployment.json" \
  --configmap "${_crypki_state}/source-configmap.json" \
  --output "${_crypki_state}/lab-resources.json"

kubectl -n athenz create secret generic idthw-java-crypki-ca \
  --from-file="default.key=${_crypki_dir}/.state/ca/default.key" \
  --from-file="special.key=${_crypki_dir}/.state/ca/special.key" \
  --from-file="default-ca.crt=${_crypki_dir}/.state/ca/default-ca.crt" \
  --from-file="special-ca.crt=${_crypki_dir}/.state/ca/special-ca.crt"
kubectl -n athenz create configmap idthw-java-crypki-code \
  --from-file="idthw-java-crypki-lab.jar=${_crypki_dir}/target/idthw-java-crypki-lab.jar" \
  --from-file="ca-map.json=${_crypki_dir}/ca-map.json"
kubectl -n athenz create -f "${_crypki_state}/lab-resources.json"
kubectl -n athenz rollout status deployment/athenz-zts-crypki-lab --timeout=180s
ok "athenz-zts-crypki-lab is ready; the original deployment and Service were not patched"
info "Private configuration snapshots are retained under ${_crypki_state}"
