#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
cd "${REPO_ROOT}"

source "${REPO_ROOT}/tools/color.sh"

command -v kubectl >/dev/null || fatal "kubectl is required"

step "[6/6] api-server"
kubectl create ns api --dry-run=client -o yaml | kubectl apply -f -
kubectl apply -f "${REPO_ROOT}/showcases/mcp_x_idjag/k8s-common/api-server-deployment.yaml"
kubectl rollout status deploy/api-server -n api --timeout=180s
ok "api-server ready"
