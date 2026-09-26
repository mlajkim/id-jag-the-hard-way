#!/usr/bin/env bash
set -euo pipefail

if ! command -v docker >/dev/null 2>&1; then
  printf 'Error: Docker is required to prepare the Keycloak image.\n' >&2
  exit 1
fi

if ! command -v kubectl >/dev/null 2>&1; then
  printf 'Error: kubectl is required to identify the target cluster.\n' >&2
  exit 1
fi

if ! keycloak_context=$(kubectl config current-context); then
  printf 'Error: Select a Kubernetes context before preparing the Keycloak image.\n' >&2
  exit 1
fi

keycloak_cluster=
keycloak_image=quay.io/keycloak/keycloak:latest
case "${keycloak_context}" in
  kind-*)
    keycloak_cluster=${keycloak_context#kind-}
    if [ -z "${keycloak_cluster}" ]; then
      printf 'Error: The current kind context has no cluster name.\n' >&2
      exit 1
    fi
    if ! command -v kind >/dev/null 2>&1; then
      printf 'Error: kind is required to load the image into cluster %s.\n' "${keycloak_cluster}" >&2
      exit 1
    fi
    ;;
esac

if ! keycloak_architecture=$(docker info --format '{{.Architecture}}'); then
  printf 'Error: Docker is unavailable. Start Docker and try again.\n' >&2
  exit 1
fi

case "${keycloak_architecture}" in
  arm64|aarch64)
    keycloak_platform=linux/arm64
    ;;
  amd64|x86_64)
    keycloak_platform=linux/amd64
    ;;
  *)
    printf 'Error: Unsupported Docker architecture: %s\n' "${keycloak_architecture}" >&2
    exit 1
    ;;
esac

printf 'Preparing %s for %s...\n' "${keycloak_image}" "${keycloak_platform}"

# Export a single-platform image without an attestation manifest so kind can load it.
docker buildx build --platform "${keycloak_platform}" --load --provenance=false --pull \
  --tag "${keycloak_image}" - <<'EOF'
FROM quay.io/keycloak/keycloak:latest
EOF

if [ -n "${keycloak_cluster}" ]; then
  kind load docker-image "${keycloak_image}" --name "${keycloak_cluster}"
  printf 'Loaded %s into kind cluster %s.\n' "${keycloak_image}" "${keycloak_cluster}"
else
  printf 'Image ready in local Docker. Cluster %s will pull the upstream image during deployment.\n' "${keycloak_context}"
fi
