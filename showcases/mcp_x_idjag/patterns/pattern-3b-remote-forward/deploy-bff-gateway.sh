#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../../.." && pwd)"
cd "${SCRIPT_DIR}"

source "${REPO_ROOT}/tools/color.sh"

command -v kubectl >/dev/null || fatal "kubectl is required"
command -v kind >/dev/null || fatal "kind is required"
command -v docker >/dev/null || fatal "docker is required and must be running"
docker info >/dev/null 2>&1 || fatal "Docker daemon is not running"
command -v envsubst >/dev/null || fatal "envsubst is required: brew install gettext (and brew link --force gettext)"

CLUSTER_NAME="${CLUSTER_NAME:-kind}"
PATTERN_NAMESPACE="${PATTERN_NAMESPACE:-mcp-pattern-3b}"
PUBLIC_BASE_URL="${PATTERN_3B_PUBLIC_BASE_URL:-http://localhost:3003}"
AGENTGATEWAY_BASE_URL="${AGENTGATEWAY_BASE_URL:-http://pattern-3b-agentgateway.${PATTERN_NAMESPACE}.svc.cluster.local:80}"
export PATTERN_NAMESPACE PUBLIC_BASE_URL AGENTGATEWAY_BASE_URL

step "Building the mcp-bff-gateway image"
docker build -t pattern-3b-bff-gateway:latest \
  "${REPO_ROOT}/showcases/mcp_x_idjag/components/mcp-bff-gateway"
kind load docker-image pattern-3b-bff-gateway:latest --name "${CLUSTER_NAME}"

step "Deploying mcp-bff-gateway (no Athenz identity - agentgateway does not support inbound mTLS)"
envsubst '$PATTERN_NAMESPACE $PUBLIC_BASE_URL $AGENTGATEWAY_BASE_URL' < k8s/bff-gateway-deployment.yaml | kubectl apply -f -
kubectl -n "${PATTERN_NAMESPACE}" rollout restart deploy/pattern-3b-bff-gateway
kubectl -n "${PATTERN_NAMESPACE}" rollout status deploy/pattern-3b-bff-gateway --timeout=180s
ok "mcp-bff-gateway ready"
