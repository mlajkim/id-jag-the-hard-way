#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
cd "${REPO_ROOT}"

source "${REPO_ROOT}/tools/color.sh"

command -v kubectl >/dev/null || fatal "kubectl is required"
command -v kind >/dev/null || fatal "kind is required: go install sigs.k8s.io/kind@latest"
command -v docker >/dev/null || fatal "docker is required and must be running"
docker info >/dev/null 2>&1 || fatal "Docker daemon is not running"
command -v envsubst >/dev/null || fatal "envsubst is required: brew install gettext (and brew link --force gettext)"
command -v jq >/dev/null || fatal "jq is required"

CLUSTER_NAME="${CLUSTER_NAME:-kind}"
MCP_HUB_NAMESPACE="${MCP_HUB_NAMESPACE:-mcp-hub}"
MCP_HUB_ATHENZ_DOMAIN="${MCP_HUB_ATHENZ_DOMAIN:-mcp-hub}"
MCP_HUB_DIR="${REPO_ROOT}/mcp_hub"
MCP_HUB_CONFIG_SECRET="${MCP_HUB_CONFIG_SECRET:-idthw-mcp-hub-local-auth-secret}"
MCP_HUB_CLIENT_SECRET="${MCP_HUB_CLIENT_SECRET:-mcp-hub-local-secret}"
MCP_HUB_CONNECTOR_REPOSITORY_ROOT="${MCP_HUB_CONNECTOR_REPOSITORY_ROOT:-${REPO_ROOT}}"
export MCP_HUB_NAMESPACE MCP_HUB_ATHENZ_DOMAIN MCP_HUB_CONNECTOR_REPOSITORY_ROOT

step "Building and loading MCP Hub"
docker build -t mcp-hub:local "${MCP_HUB_DIR}"
kind load docker-image mcp-hub:local --name "${CLUSTER_NAME}"

step "Registering MCP Hub Keycloak client"
KEYCLOAK_CLIENT_SECRET="${MCP_HUB_CLIENT_SECRET}" KEYCLOAK_OPEN_UI=false \
  ./tools/keycloak/create-client.sh \
  "mcp-hub.hub-ui" \
  "http://localhost:3102/api/auth/callback/idp" \
  "http://localhost:3102" \
  confidential

kubectl create ns "${MCP_HUB_NAMESPACE}" --dry-run=client -o yaml | kubectl apply -f -

_mcp_hub_sia_env=$(mktemp)
trap 'rm -f "${_mcp_hub_sia_env}"' EXIT
ATHENZ_DOMAIN="${MCP_HUB_ATHENZ_DOMAIN}" envsubst '$ATHENZ_DOMAIN' \
  < "${REPO_ROOT}/showcases/mcp_x_idjag/k8s-common/mcp-sia.env" \
  > "${_mcp_hub_sia_env}"
kubectl -n "${MCP_HUB_NAMESPACE}" create configmap mcp-hub-sia \
  --from-env-file="${_mcp_hub_sia_env}" --dry-run=client -o yaml | kubectl apply -f -
rm -f "${_mcp_hub_sia_env}"
trap - EXIT

kubectl get secret athenz-cacert -n athenz -o json \
  | jq 'del(.metadata.namespace,.metadata.resourceVersion,.metadata.uid,.metadata.creationTimestamp,.metadata.annotations,.metadata.managedFields)' \
  | kubectl -n "${MCP_HUB_NAMESPACE}" apply -f -

kubectl -n "${MCP_HUB_NAMESPACE}" create secret generic mcp-hub-config \
  --from-literal=auth-secret="${MCP_HUB_CONFIG_SECRET}" \
  --from-literal=client-secret="${MCP_HUB_CLIENT_SECRET}" \
  --dry-run=client -o yaml | kubectl apply -f -

envsubst '$MCP_HUB_NAMESPACE $MCP_HUB_CONNECTOR_REPOSITORY_ROOT' \
  < "${REPO_ROOT}/showcases/mcp_x_idjag/k8s-common/mcp-hub-deployment.yaml" \
  | kubectl apply -f -
kubectl -n "${MCP_HUB_NAMESPACE}" rollout restart deployment/mcp-hub
kubectl -n "${MCP_HUB_NAMESPACE}" rollout status deployment/mcp-hub --timeout=180s
ok "MCP Hub ready at http://localhost:3102"
