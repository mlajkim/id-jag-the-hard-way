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

CLUSTER_NAME="${CLUSTER_NAME:-kind}"
API_SERVER_IMAGE="ghcr.io/mlajkim/api-server:latest"
MCP_X_IDJAG_DIR="${REPO_ROOT}/showcases/mcp_x_idjag"
PATTERN_NAMESPACE="${PATTERN_NAMESPACE:-mcp-pattern-3a}"
ATHENZ_DOMAIN="${ATHENZ_DOMAIN:-mcp.pattern3a}"
export PATTERN_NAMESPACE ATHENZ_DOMAIN

step "Pattern api-server (Docker build)"
docker build -t "${API_SERVER_IMAGE}" "${REPO_ROOT}/api_server"
kind load docker-image "${API_SERVER_IMAGE}" --name "${CLUSTER_NAME}"

kubectl create ns "${PATTERN_NAMESPACE}" --dry-run=client -o yaml | kubectl apply -f -
envsubst '$PATTERN_NAMESPACE $ATHENZ_DOMAIN' < "${MCP_X_IDJAG_DIR}/k8s-common/api-server-deployment.yaml" | kubectl apply -f -
kubectl -n "${PATTERN_NAMESPACE}" rollout restart deployment/api-server
kubectl rollout status deploy/api-server -n "${PATTERN_NAMESPACE}" --timeout=180s
ok "api-server ready"
