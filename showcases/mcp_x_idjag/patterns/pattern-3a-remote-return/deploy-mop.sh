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
command -v jq >/dev/null || fatal "jq is required"
command -v openssl >/dev/null || fatal "openssl is required"

CLUSTER_NAME="${CLUSTER_NAME:-kind}"
PATTERN_NAMESPACE="${PATTERN_NAMESPACE:-mcp-pattern-3a}"

step "Deploying MoP"

(cd mcp-oauth-proxy && ./mvnw -q -DskipTests package)
docker build -f mcp-oauth-proxy/src/main/docker/Dockerfile -t pattern-3a-mop:latest mcp-oauth-proxy
kind load docker-image pattern-3a-mop:latest --name "${CLUSTER_NAME}"

kubectl -n "${PATTERN_NAMESPACE}" create configmap pattern-3a-mop-sia --from-env-file=k8s/mop-athenz-sia.env --dry-run=client -o yaml | kubectl apply -f -

kubectl get secret athenz-cacert -n athenz -o json \
  | jq 'del(.metadata.namespace,.metadata.resourceVersion,.metadata.uid,.metadata.creationTimestamp,.metadata.annotations,.metadata.managedFields)' \
  | kubectl -n "${PATTERN_NAMESPACE}" apply -f -

kubectl -n "${PATTERN_NAMESPACE}" create configmap pattern-3a-mop-config --from-file=application-local.yaml=mop-config/application-local.yaml --dry-run=client -o yaml | kubectl apply -f -

if [ ! -f mop-tls/ca.crt ]; then
  mkdir -p mop-tls
  (
    cd mop-tls
    openssl genrsa -out ca.key 2048 2>/dev/null
    openssl req -x509 -new -nodes -key ca.key -sha256 -days 3650 -subj "/CN=Pattern 3a Local Dev CA" -out ca.crt
    openssl genrsa -out localhost.key 2048 2>/dev/null
    echo "subjectAltName = DNS:localhost, IP:127.0.0.1" > localhost.ext
    openssl req -new -key localhost.key -subj "/CN=localhost" -out localhost.csr
    openssl x509 -req -in localhost.csr -CA ca.crt -CAkey ca.key -CAcreateserial -days 825 -sha256 -extfile localhost.ext -out localhost.crt
  )
fi
kubectl -n "${PATTERN_NAMESPACE}" create secret generic pattern-3a-mop-tls --from-file=tls.crt=mop-tls/localhost.crt --from-file=tls.key=mop-tls/localhost.key --dry-run=client -o yaml | kubectl apply -f -

kubectl apply -f k8s/mop-deployment.yaml
kubectl -n "${PATTERN_NAMESPACE}" rollout restart deploy/pattern-3a-mop
kubectl -n "${PATTERN_NAMESPACE}" rollout status deploy/pattern-3a-mop --timeout=180s
ok "MoP ready"

step "Refreshing the Pattern 3a docs MCP image"
docker build -t simple-mcp-server:latest \
  "${REPO_ROOT}/showcases/mcp_x_idjag/components/simple-mcp-server"
kind load docker-image simple-mcp-server:latest --name "${CLUSTER_NAME}"
ok "Docs MCP image loaded"

step "Configuring the docs MCP public resource URL"
kubectl -n "${PATTERN_NAMESPACE}" create configmap mcp-reverse-proxy-config \
  --from-literal=AS_ISSUER_URL=https://localhost:8082 \
  --from-literal=PUBLIC_BASE_URL=http://docs.pattern-3a.localhost:3001 \
  --dry-run=client -o yaml | kubectl apply -f -
kubectl -n "${PATTERN_NAMESPACE}" rollout restart deploy/mcp
kubectl -n "${PATTERN_NAMESPACE}" rollout status deploy/mcp --timeout=180s
ok "Docs MCP public URL configured"

step "Deploying the backend-free echo MCP"
docker build -t pattern-3a-echo-mcp:latest \
  "${REPO_ROOT}/showcases/mcp_x_idjag/components/echo-mcp"
kind load docker-image pattern-3a-echo-mcp:latest --name "${CLUSTER_NAME}"
kubectl apply -f k8s/echo-mcp-deployment.yaml
kubectl -n "${PATTERN_NAMESPACE}" rollout status deploy/pattern-3a-echo-mcp --timeout=180s
ok "Echo MCP ready"
