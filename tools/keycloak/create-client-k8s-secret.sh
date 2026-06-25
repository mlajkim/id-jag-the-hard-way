#!/usr/bin/env bash
set -euo pipefail

TOOLS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${TOOLS_DIR}/color.sh"

if [ $# -lt 3 ]; then
  fatal "Usage: $0 <client_id> <k8s_namespace> <k8s_secret_name>"
fi

client_id=$1
namespace=$2
secret_name=$3

info "Fetching client secret for ${client_id}..."
client_secret=$("$(dirname "${BASH_SOURCE[0]}")/get-client-secret.sh" "${client_id}")

info "Creating K8s secret ${namespace}/${secret_name}..."
kubectl -n "${namespace}" delete secret "${secret_name}" --ignore-not-found
kubectl -n "${namespace}" create secret generic "${secret_name}" \
  "--from-literal=client-id=${client_id}" \
  "--from-literal=client-secret=${client_secret}"

ok "Secret created: ${namespace}/${secret_name}"
