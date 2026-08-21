#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
cd "${REPO_ROOT}"

source "${REPO_ROOT}/tools/color.sh"

command -v git >/dev/null || fatal "git is required"
command -v kind >/dev/null || fatal "kind is required: go install sigs.k8s.io/kind@latest"
command -v docker >/dev/null || fatal "docker is required and must be running"
docker info >/dev/null 2>&1 || fatal "Docker daemon is not running"

CLUSTER_NAME="${CLUSTER_NAME:-kind}"

git submodule update --init --recursive

step "[1/3] Kubernetes cluster"
if kind get clusters 2>/dev/null | grep -qx "${CLUSTER_NAME}"; then
  ok "kind cluster '${CLUSTER_NAME}' already exists"
else
  kind create cluster --name "${CLUSTER_NAME}"
  ok "kind cluster '${CLUSTER_NAME}' created"

  [ "${CLUSTER_NAME}" = "kind" ] || fatal "athenz_dist's load-kubernetes-images only supports the default kind cluster name 'kind' (got CLUSTER_NAME='${CLUSTER_NAME}')"
  make -C athenz_dist load-docker-images load-kubernetes-images
  ok "Base images pulled and loaded into the kind cluster"
fi
