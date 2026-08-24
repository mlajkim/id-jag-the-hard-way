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

CLUSTER_NAME="${CLUSTER_NAME:-kind}"

step "[2/3] Keycloak"
docker pull quay.io/keycloak/keycloak:latest
kind load docker-image quay.io/keycloak/keycloak:latest --name "${CLUSTER_NAME}"
kubectl create ns idp --dry-run=client -o yaml | kubectl apply -f -

kubectl create secret generic keycloak-admin-credentials -n idp \
  --from-literal=admin="$(./tools/config.sh keycloak admin)" \
  --from-literal=admin-password="$(./tools/config.sh keycloak admin-password)" \
  --dry-run=client -o yaml | kubectl apply -f -
kubectl apply -f "${REPO_ROOT}/showcases/mcp_x_idjag/k8s-common/keycloak-pvc.yaml"

kubectl apply -f "${REPO_ROOT}/showcases/mcp_x_idjag/k8s-common/keycloak-deployment.yaml"
kubectl rollout status deployment/keycloak -n idp --timeout=300s

_keycloak_port=$(./tools/port.sh keycloak)

_keycloak_pf_loop() {
  while true; do
    kubectl -n idp port-forward deployment/keycloak "${_keycloak_port}:8080" >/tmp/idthw-keycloak-port-forward.log 2>&1 || true
    sleep 2
  done
}
_keycloak_pf_loop &
_keycloak_pf_pid=$!
_keycloak_pf_cleanup() {
  pkill -P "${_keycloak_pf_pid}" 2>/dev/null || true
  kill "${_keycloak_pf_pid}" 2>/dev/null || true
}
trap _keycloak_pf_cleanup EXIT

info "Waiting for Keycloak to accept connections..."
_keycloak_ready=false
for _i in $(seq 1 60); do
  curl -s -o /dev/null "http://localhost:${_keycloak_port}/realms/master" && { _keycloak_ready=true; break; }
  sleep 2
done
[ "${_keycloak_ready}" = true ] || fatal "Keycloak did not become ready on http://localhost:${_keycloak_port} in time"

./tools/keycloak/create-user.sh idjag-learner idjag-learner@athenz.io ID-JAG Learner || true
./tools/keycloak/set-token-lifespan.sh 14400

_keycloak_pf_cleanup
trap - EXIT
ok "Keycloak ready"
