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

step "Pattern Athenz identities + identityprovider mapping"

# The identityprovider is shared by all patterns.  Re-applying the upstream
# kustomization for every pattern would recreate identityprovider-policy from
# the checked-out source and discard mappings registered by earlier patterns.
# Keep the live policy config so an upgrade can restore those mappings too.
_policy_config="$(mktemp)"
_policy_configmap="$(mktemp)"
_existing_policy_config="$(mktemp)"
trap 'rm -f "${_policy_config}" "${_policy_configmap}" "${_existing_policy_config}"' EXIT

if kubectl -n athenz get configmap identityprovider-policy -o json \
  >"${_policy_configmap}" 2>/dev/null; then
  jq -r '.data["config.yaml"] // empty' "${_policy_configmap}" \
    >"${_existing_policy_config}"
fi

_identityprovider_needs_deploy=0
if ! kubectl -n athenz get deployment/identityprovider-deployment \
  >/dev/null 2>&1; then
  _identityprovider_needs_deploy=1
elif [ ! -s "${_policy_configmap}" ] || ! jq -e \
  '(.data["identityprovider.rego"] // "") | contains("athenz_domain_mappings")' \
  "${_policy_configmap}" >/dev/null; then
  # This also upgrades an identityprovider installed before the namespace
  # mapping patch was introduced.
  _identityprovider_needs_deploy=1
fi

if [ "${_identityprovider_needs_deploy}" -eq 1 ]; then
  make -C athenz_dist deploy-kubernetes-athenz-identityprovider
fi

kubectl -n athenz get configmap identityprovider-policy \
  -o jsonpath='{.data.config\.yaml}' >"${_policy_config}"

if [ -s "${_existing_policy_config}" ]; then
  EXISTING_POLICY_CONFIG="${_existing_policy_config}" yq -i \
    '.config.constraints.athenz.domain.mappings =
      ((.config.constraints.athenz.domain.mappings // {}) *
       (load(strenv(EXISTING_POLICY_CONFIG)).config.constraints.athenz.domain.mappings // {}))' \
    "${_policy_config}"
fi

PATTERN_NAMESPACE="${PATTERN_NAMESPACE}" ATHENZ_DOMAIN="${ATHENZ_DOMAIN}" yq -i \
  '.config.constraints.athenz.domain.mappings[strenv(PATTERN_NAMESPACE)] = strenv(ATHENZ_DOMAIN)' \
  "${_policy_config}"

_policy_config_json="$(jq -Rs . <"${_policy_config}")"
if ! cmp -s "${_policy_config}" <(kubectl -n athenz get configmap identityprovider-policy \
  -o jsonpath='{.data.config\.yaml}'); then
  kubectl -n athenz patch configmap identityprovider-policy --type=merge \
    --patch "{\"data\":{\"config.yaml\":${_policy_config_json}}}"
  kubectl -n athenz rollout restart deployment/identityprovider-deployment
  kubectl -n athenz rollout status deployment/identityprovider-deployment --timeout=120s
fi

./tools/athenz/set-domain-template.sh sys.auth instance_provider \
  provider=athenz.identityprovider dnssuffix=svc.cluster.local

if [[ "${ATHENZ_DOMAIN}" == "${ATHENZ_PARENT_DOMAIN}."* ]]; then
  ./tools/athenz/create-tld.sh "${ATHENZ_PARENT_DOMAIN}"
  ./tools/athenz/create-subdomain.sh "${ATHENZ_PARENT_DOMAIN}" "${ATHENZ_DOMAIN#${ATHENZ_PARENT_DOMAIN}.}"
else
  # A top-level domain such as mcp-hub has no parent subdomain to create.
  ./tools/athenz/create-tld.sh "${ATHENZ_DOMAIN}"
fi
for _svc in "${SERVICES[@]}"; do
  ./tools/athenz/create-private-key.sh "./keys/${_svc}"
  ./tools/athenz/create-service.sh "${ATHENZ_DOMAIN}" "${_svc}" "./keys/${_svc}.public.key"
  ./tools/athenz/set-domain-template.sh "${ATHENZ_DOMAIN}" "identity_provisioning" \
    "instanceprovider=athenz.identityprovider" "service=${_svc}"
done
ok "athenz-identityprovider ready"
