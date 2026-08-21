#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../../.." && pwd)"
cd "${SCRIPT_DIR}"

source "${REPO_ROOT}/tools/color.sh"

PATTERN_NAMESPACE="${PATTERN_NAMESPACE:-mcp-pattern-2b}"
ATHENZ_DOMAIN="${ATHENZ_DOMAIN:-mcp.pattern2b}"
KEYCLOAK_CLIENT_ID="${KEYCLOAK_CLIENT_ID:-human.idjag-learner.pattern2b-client}"
KEYCLOAK_ISSUER="${KEYCLOAK_ISSUER:-http://localhost:34443/realms/master}"
export PATTERN_NAMESPACE ATHENZ_DOMAIN KEYCLOAK_CLIENT_ID KEYCLOAK_ISSUER

step "Removing Pattern 2b resources"
if kubectl get namespace "${PATTERN_NAMESPACE}" >/dev/null 2>&1; then
  command -v envsubst >/dev/null || fatal "envsubst is required: brew install gettext (and brew link --force gettext)"
  if kubectl get namespace athenz >/dev/null 2>&1; then
    ./cleanup-athenz.sh
  else
    info "Athenz namespace is absent; skipping Pattern 2b Athenz cleanup"
  fi
  if kubectl get namespace idp >/dev/null 2>&1; then
    "${REPO_ROOT}/tools/keycloak/delete-client.sh" "${KEYCLOAK_CLIENT_ID}"
  else
    info "Keycloak namespace is absent; skipping Pattern 2b Keycloak cleanup"
  fi
  for _file in k8s/agentgateway-routes/*.yaml; do
    envsubst '$PATTERN_NAMESPACE $ATHENZ_DOMAIN $KEYCLOAK_ISSUER $KEYCLOAK_CLIENT_ID' < "${_file}" | kubectl delete --ignore-not-found -f -
  done
  envsubst '$PATTERN_NAMESPACE $KEYCLOAK_ISSUER $KEYCLOAK_CLIENT_ID' < k8s/dpop-verifier-deployment.yaml | kubectl delete --ignore-not-found -f -
  envsubst '$PATTERN_NAMESPACE' < k8s/gateway.yaml | kubectl delete --ignore-not-found -f -
  kubectl -n "${PATTERN_NAMESPACE}" delete secret pattern-2b-gateway-mtls --ignore-not-found
  kubectl -n "${PATTERN_NAMESPACE}" delete configmap athenz-ca --ignore-not-found
  kubectl delete namespace "${PATTERN_NAMESPACE}" --ignore-not-found
else
  info "Pattern 2b namespace is absent; skipping namespaced Pattern 2b cleanup"
fi

# agentgateway is installed by deploy-gateway.sh and is not part of the
# Pattern 2b Gateway manifest. Remove its Helm releases and controller
# namespace, while leaving the shared Gateway API CRDs intact.
if command -v helm >/dev/null 2>&1; then
  helm uninstall agentgateway --namespace agent-gateway --ignore-not-found || true
  helm uninstall agentgateway-crds --namespace agent-gateway --ignore-not-found || true
else
  info "helm is absent; skipping agentgateway Helm release cleanup"
fi
kubectl delete gatewayclass agentgateway --ignore-not-found
kubectl delete namespace agent-gateway --ignore-not-found
rm -f "${REPO_ROOT}/keys/pattern-2b-gateway.key" "${REPO_ROOT}/keys/pattern-2b-gateway.public.key" "${REPO_ROOT}/keys/pattern-2b-gateway.crt"
ok "Pattern 2b resources removed"
