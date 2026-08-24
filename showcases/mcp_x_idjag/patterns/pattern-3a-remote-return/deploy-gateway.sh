#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../../.." && pwd)"
cd "${SCRIPT_DIR}"

source "${REPO_ROOT}/tools/color.sh"

command -v kubectl >/dev/null || fatal "kubectl is required"
command -v curl >/dev/null || fatal "curl is required"
command -v yq >/dev/null || fatal "yq is required: brew install yq"
PATTERN_NAMESPACE="${PATTERN_NAMESPACE:-mcp-pattern-3a}"

ENVOY_GATEWAY_VERSION="${ENVOY_GATEWAY_VERSION:-v1.3.2}"
ENVOY_GATEWAY_INSTALL_URL="${ENVOY_GATEWAY_INSTALL_URL:-https://github.com/envoyproxy/gateway/releases/download/${ENVOY_GATEWAY_VERSION}/install.yaml}"

step "Installing or verifying Envoy Gateway ${ENVOY_GATEWAY_VERSION}"
if ! kubectl -n envoy-gateway-system get deployment/envoy-gateway >/dev/null 2>&1; then
  if kubectl get crd gatewayclasses.gateway.networking.k8s.io >/dev/null 2>&1; then
    curl -fsSL "${ENVOY_GATEWAY_INSTALL_URL}" \
      | yq 'select(.kind != "CustomResourceDefinition" or ((.metadata.name | test("\\.gateway\\.networking\\.k8s\\.io$")) | not))' \
      | kubectl apply --server-side -f -
  else
    kubectl apply --server-side -f "${ENVOY_GATEWAY_INSTALL_URL}"
  fi
fi

kubectl wait --for=condition=Available deployment/envoy-gateway \
  -n envoy-gateway-system --timeout=180s

step "Applying Pattern 3a routing-only Gateway"
kubectl apply -f k8s/gateway.yaml
if ! kubectl wait --for=condition=Accepted gatewayclass/pattern-3a-envoy-gateway \
  --timeout=60s; then
  kubectl get gatewayclass pattern-3a-envoy-gateway -o yaml || true
  fatal "Envoy Gateway did not accept the Pattern 3a GatewayClass"
fi
if ! kubectl wait --for=condition=Programmed gateway/pattern-3a-gateway \
  -n "${PATTERN_NAMESPACE}" --timeout=180s; then
  kubectl -n "${PATTERN_NAMESPACE}" get gateway pattern-3a-gateway -o yaml || true
  kubectl -n "${PATTERN_NAMESPACE}" get httproute pattern-3a-docs-mcp pattern-3a-echo-mcp -o yaml || true
  kubectl get svc -A -l gateway.envoyproxy.io/owning-gateway-name=pattern-3a-gateway || true
  fatal "Pattern 3a Gateway was not programmed; inspect the status above"
fi

ok "Pattern 3a Gateway ready (routing only; no auth or token processing)"
