#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
cd "${REPO_ROOT}"

source "${REPO_ROOT}/tools/color.sh"

[ "$#" -ge 1 ] || fatal "Usage: $0 <service-name> [<service-name> ...]"
SERVICES=("$@")
ATHENZ_DOMAIN="${ATHENZ_DOMAIN:-mcp.pattern3a}"
ATHENZ_PARENT_DOMAIN="${ATHENZ_PARENT_DOMAIN:-mcp}"
PATTERN_NAMESPACE="${PATTERN_NAMESPACE:-mcp-pattern-3a}"

command -v kubectl >/dev/null || fatal "kubectl is required"
command -v jq >/dev/null || fatal "jq is required"
command -v yq >/dev/null || fatal "yq is required: brew install yq"

_identityprovider_policy_path="kubernetes/athenz-identityprovider/kustomize/athenz-identityprovider-policy"
_identityprovider_policy_dir="${REPO_ROOT}/athenz_dist/${_identityprovider_policy_path}"
_identityprovider_policy_patch="${REPO_ROOT}/showcases/mcp_x_idjag/identityprovider-policy.patch"

# Keep the upstream identityprovider-policy submodule untouched in the parent
# repository. The showcase carries only the small compatibility patch needed
# for namespace-specific Athenz domains and applies it to the checked-out
# submodule before the upstream deployment target renders its ConfigMap.
git -C "${REPO_ROOT}/athenz_dist" submodule update --init -- "${_identityprovider_policy_path}"
if git -C "${_identityprovider_policy_dir}" apply --check "${_identityprovider_policy_patch}" 2>/dev/null; then
  git -C "${_identityprovider_policy_dir}" apply "${_identityprovider_policy_patch}"
elif git -C "${_identityprovider_policy_dir}" apply --reverse --check "${_identityprovider_policy_patch}" 2>/dev/null; then
  : # The patch is already applied.
else
  fatal "identityprovider-policy.patch does not match the checked-out policy submodule"
fi

step "[5/6] athenz-identityprovider (k8s-athenz-sia infra)"
make -C athenz_dist deploy-kubernetes-athenz-identityprovider

_policy_config="$(mktemp)"
trap 'rm -f "${_policy_config}"' EXIT
kubectl -n athenz get configmap identityprovider-policy \
  -o jsonpath='{.data.config\.yaml}' >"${_policy_config}"
yq -i \
  ".config.constraints.athenz.domain.mappings[\"${PATTERN_NAMESPACE}\"] = \"${ATHENZ_DOMAIN}\"" \
  "${_policy_config}"
_policy_config_json="$(jq -Rs . <"${_policy_config}")"
kubectl -n athenz patch configmap identityprovider-policy --type=merge \
  --patch "{\"data\":{\"config.yaml\":${_policy_config_json}}}"
kubectl -n athenz rollout restart deployment/identityprovider-deployment
kubectl -n athenz rollout status deployment/identityprovider-deployment --timeout=120s

./tools/athenz/set-domain-template.sh sys.auth instance_provider \
  provider=athenz.identityprovider dnssuffix=svc.cluster.local

./tools/athenz/create-tld.sh "${ATHENZ_PARENT_DOMAIN}"
if [[ "${ATHENZ_DOMAIN}" == "${ATHENZ_PARENT_DOMAIN}."* ]]; then
  ./tools/athenz/create-subdomain.sh "${ATHENZ_PARENT_DOMAIN}" "${ATHENZ_DOMAIN#${ATHENZ_PARENT_DOMAIN}.}"
fi
for _svc in "${SERVICES[@]}"; do
  ./tools/athenz/create-private-key.sh "./keys/${_svc}"
  ./tools/athenz/create-service.sh "${ATHENZ_DOMAIN}" "${_svc}" "./keys/${_svc}.public.key"
  ./tools/athenz/set-domain-template.sh "${ATHENZ_DOMAIN}" "identity_provisioning" \
    "instanceprovider=athenz.identityprovider" "service=${_svc}"
done
ok "athenz-identityprovider ready"
