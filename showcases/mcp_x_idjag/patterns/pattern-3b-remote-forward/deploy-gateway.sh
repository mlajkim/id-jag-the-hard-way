#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../../.." && pwd)"
cd "${SCRIPT_DIR}"

source "${REPO_ROOT}/tools/color.sh"

command -v kubectl >/dev/null || fatal "kubectl is required"
command -v helm >/dev/null || fatal "helm is required"
command -v docker >/dev/null || fatal "docker is required and must be running"
docker info >/dev/null 2>&1 || fatal "Docker daemon is not running"
command -v envsubst >/dev/null || fatal "envsubst is required: brew install gettext (and brew link --force gettext)"

CLUSTER_NAME="${CLUSTER_NAME:-kind}"
PATTERN_NAMESPACE="${PATTERN_NAMESPACE:-mcp-pattern-3b}"
export PATTERN_NAMESPACE
GWAPI_VERSION="${GWAPI_VERSION:-1.6.1}"
AGENTGATEWAY_VERSION="${AGENTGATEWAY_VERSION:-v1.4.1}"

# Shared with any other Gateway API implementation already installed on this
# cluster (e.g. Pattern 3a's Envoy Gateway, or Pattern 2b's agentgateway) -
# re-applying --server-side is safe and just ensures the CRDs are at least
# this version.
step "Installing Gateway API CRDs v${GWAPI_VERSION}"
kubectl apply --server-side --force-conflicts \
  -f "https://github.com/kubernetes-sigs/gateway-api/releases/download/v${GWAPI_VERSION}/standard-install.yaml"

step "Installing agentgateway ${AGENTGATEWAY_VERSION}"
kubectl create namespace agent-gateway --dry-run=client -o yaml | kubectl apply -f -
docker pull "cr.agentgateway.dev/controller:${AGENTGATEWAY_VERSION}"
docker pull "cr.agentgateway.dev/agentgateway:${AGENTGATEWAY_VERSION}"
kind load docker-image "cr.agentgateway.dev/controller:${AGENTGATEWAY_VERSION}" "cr.agentgateway.dev/agentgateway:${AGENTGATEWAY_VERSION}" --name "${CLUSTER_NAME}"
helm upgrade --install agentgateway-crds oci://cr.agentgateway.dev/charts/agentgateway-crds \
  --namespace agent-gateway --version "${AGENTGATEWAY_VERSION}"
helm upgrade --install agentgateway oci://cr.agentgateway.dev/charts/agentgateway \
  --namespace agent-gateway --version "${AGENTGATEWAY_VERSION}" --wait
kubectl get gatewayclass agentgateway

# register.sh must have already created the pattern-3b-agentgateway-mtls
# Secret and athenz-ca ConfigMap - policy-athenz-zts-tls.yaml (applied by
# deploy-routes.sh) reuses that Athenz-issued certificate as agentgateway's
# outbound mTLS client certificate to ZTS. agentgateway does not support
# inbound/frontend mTLS client-certificate validation on a Gateway listener
# (only outbound/backend TLS), so this listener is plain HTTP, and the
# NetworkPolicy applied below (restricting ingress to only mcp-bff-gateway's
# pod) is the substitute trust boundary - see k8s/agentgateway-networkpolicy.yaml.
step "Applying Pattern 3b Gateway"
kubectl create ns "${PATTERN_NAMESPACE}" --dry-run=client -o yaml | kubectl apply -f -
envsubst '$PATTERN_NAMESPACE' < k8s/gateway.yaml | kubectl apply -f -
if ! kubectl wait --for=condition=Accepted gatewayclass/agentgateway --timeout=60s; then
  kubectl get gatewayclass agentgateway -o yaml || true
  fatal "agentgateway did not accept the agentgateway GatewayClass"
fi
if ! kubectl wait --for=condition=Programmed gateway/pattern-3b-agentgateway \
  -n "${PATTERN_NAMESPACE}" --timeout=180s; then
  kubectl -n "${PATTERN_NAMESPACE}" get gateway pattern-3b-agentgateway -o yaml || true
  kubectl get svc -A -l gateway.networking.k8s.io/gateway-name=pattern-3b-agentgateway || true
  fatal "Pattern 3b Gateway was not programmed; inspect the status above"
fi

step "Restricting inbound access to agentgateway's pod to mcp-bff-gateway only"
envsubst '$PATTERN_NAMESPACE' < k8s/agentgateway-networkpolicy.yaml | kubectl apply -f -

ok "Pattern 3b Gateway ready (agentgateway control plane installed; routes/policies applied separately)"
