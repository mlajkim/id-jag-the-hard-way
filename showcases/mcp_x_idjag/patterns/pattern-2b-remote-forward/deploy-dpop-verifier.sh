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
KEYCLOAK_CLIENT_ID="${KEYCLOAK_CLIENT_ID:-human.idjag-learner.pattern2b-client}"
KEYCLOAK_ISSUER="${KEYCLOAK_ISSUER:-http://localhost:$("${REPO_ROOT}/tools/port.sh" keycloak)/realms/master}"
export PATTERN_NAMESPACE KEYCLOAK_CLIENT_ID KEYCLOAK_ISSUER

step "Building and deploying dpop-verifier"
docker build -t dpop-verifier:latest ./dpop-verifier
kind load docker-image dpop-verifier:latest --name "${CLUSTER_NAME}"

kubectl create ns "${PATTERN_NAMESPACE}" --dry-run=client -o yaml | kubectl apply -f -
envsubst '$PATTERN_NAMESPACE $KEYCLOAK_ISSUER $KEYCLOAK_CLIENT_ID' < k8s/dpop-verifier-deployment.yaml | kubectl apply -f -
# The image tag never changes (:latest), so `kubectl apply` alone won't pick
# up a rebuilt image on an already-running Deployment - force a rollout.
kubectl -n "${PATTERN_NAMESPACE}" rollout restart deploy/dpop-verifier
kubectl -n "${PATTERN_NAMESPACE}" rollout status deploy/dpop-verifier --timeout=120s
ok "dpop-verifier ready"
