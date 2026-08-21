#!/usr/bin/env bash
# Usage: ./07-mcp-server.sh <as-issuer-url> [public-base-url]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
cd "${REPO_ROOT}"

source "${REPO_ROOT}/tools/color.sh"

[ "$#" -ge 1 ] || fatal "Usage: $0 <as-issuer-url> [public-base-url]"
AS_ISSUER_URL="$1"
PUBLIC_BASE_URL="${2:-http://localhost:3001}"

command -v kubectl >/dev/null || fatal "kubectl is required"
command -v kind >/dev/null || fatal "kind is required: go install sigs.k8s.io/kind@latest"
command -v docker >/dev/null || fatal "docker is required and must be running"
docker info >/dev/null 2>&1 || fatal "Docker daemon is not running"
command -v jq >/dev/null || fatal "jq is required"
command -v envsubst >/dev/null || fatal "envsubst is required: brew install gettext (and brew link --force gettext)"

CLUSTER_NAME="${CLUSTER_NAME:-kind}"
MCP_X_IDJAG_DIR="${REPO_ROOT}/showcases/mcp_x_idjag"
PATTERN_NAMESPACE="${PATTERN_NAMESPACE:-mcp-pattern-3a}"
ATHENZ_DOMAIN="${ATHENZ_DOMAIN:-mcp.pattern3a}"
export PATTERN_NAMESPACE ATHENZ_DOMAIN

step "Pattern MCP server (mcp-reverse-proxy + simple-mcp-server)"

docker build -t mcp-reverse-proxy:latest "${MCP_X_IDJAG_DIR}/components/mcp-reverse-proxy"
docker build -t simple-mcp-server:latest "${MCP_X_IDJAG_DIR}/components/simple-mcp-server"
kind load docker-image mcp-reverse-proxy:latest --name "${CLUSTER_NAME}"
kind load docker-image simple-mcp-server:latest --name "${CLUSTER_NAME}"

kubectl create ns "${PATTERN_NAMESPACE}" --dry-run=client -o yaml | kubectl apply -f -

_mcp_sia_env=$(mktemp)
trap 'rm -f "${_mcp_sia_env}"' EXIT
envsubst '$ATHENZ_DOMAIN' < "${MCP_X_IDJAG_DIR}/k8s-common/mcp-sia.env" > "${_mcp_sia_env}"
kubectl -n "${PATTERN_NAMESPACE}" create configmap mcp-sia --from-env-file="${_mcp_sia_env}" --dry-run=client -o yaml | kubectl apply -f -
rm -f "${_mcp_sia_env}"
trap - EXIT

kubectl get secret athenz-cacert -n athenz -o json \
  | jq 'del(.metadata.namespace,.metadata.resourceVersion,.metadata.uid,.metadata.creationTimestamp,.metadata.annotations,.metadata.managedFields)' \
  | kubectl -n "${PATTERN_NAMESPACE}" apply -f -

kubectl -n "${PATTERN_NAMESPACE}" create configmap mcp-reverse-proxy-config \
  --from-literal=AS_ISSUER_URL="${AS_ISSUER_URL}" \
  --from-literal=PUBLIC_BASE_URL="${PUBLIC_BASE_URL}" \
  --dry-run=client -o yaml | kubectl apply -f -

envsubst '$PATTERN_NAMESPACE $ATHENZ_DOMAIN' < "${MCP_X_IDJAG_DIR}/k8s-common/mcp-deployment.yaml" | kubectl apply -f -
kubectl -n "${PATTERN_NAMESPACE}" rollout status deploy/mcp --timeout=180s
ok "MCP server ready"
