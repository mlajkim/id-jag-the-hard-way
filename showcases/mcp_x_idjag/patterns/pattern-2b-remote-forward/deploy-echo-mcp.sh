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
PATTERN_NAMESPACE="${PATTERN_NAMESPACE:-mcp-pattern-2b}"
ATHENZ_DOMAIN="${ATHENZ_DOMAIN:-mcp.pattern2b}"
export PATTERN_NAMESPACE ATHENZ_DOMAIN

step "Building and deploying the Pattern 2b echo MCP"
docker build -t pattern-2b-echo-mcp:latest \
  "${REPO_ROOT}/showcases/mcp_x_idjag/components/echo-mcp"
kind load docker-image pattern-2b-echo-mcp:latest --name "${CLUSTER_NAME}"
kind load docker-image mcp-reverse-proxy:latest --name "${CLUSTER_NAME}"

envsubst '$PATTERN_NAMESPACE $ATHENZ_DOMAIN' < k8s/echo-mcp-deployment.yaml | kubectl apply -f -
kubectl -n "${PATTERN_NAMESPACE}" rollout status deploy/pattern-2b-echo-mcp --timeout=180s
ok "Pattern 2b echo MCP ready"
