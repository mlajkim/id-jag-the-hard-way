#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../../.." && pwd)"
cd "${SCRIPT_DIR}"

source "${REPO_ROOT}/tools/color.sh"

command -v kubectl >/dev/null || fatal "kubectl is required"
command -v envsubst >/dev/null || fatal "envsubst is required: brew install gettext (and brew link --force gettext)"

PATTERN_NAMESPACE="${PATTERN_NAMESPACE:-mcp-pattern-2b}"
ATHENZ_DOMAIN="${ATHENZ_DOMAIN:-mcp.pattern2b}"
KEYCLOAK_CLIENT_ID="${KEYCLOAK_CLIENT_ID:-human.idjag-learner.pattern2b-client}"
KEYCLOAK_ISSUER="${KEYCLOAK_ISSUER:-http://localhost:$("${REPO_ROOT}/tools/port.sh" keycloak)/realms/master}"
export PATTERN_NAMESPACE ATHENZ_DOMAIN KEYCLOAK_CLIENT_ID KEYCLOAK_ISSUER

step "Applying Pattern 2b agentgateway routes/policies"
kubectl create ns "${PATTERN_NAMESPACE}" --dry-run=client -o yaml | kubectl apply -f -
for _file in k8s/agentgateway-routes/*.yaml; do
  info "Applying ${_file}"
  envsubst '$PATTERN_NAMESPACE $ATHENZ_DOMAIN $KEYCLOAK_ISSUER $KEYCLOAK_CLIENT_ID' < "${_file}" | kubectl apply -f -
done
ok "Pattern 2b routes/policies applied"
