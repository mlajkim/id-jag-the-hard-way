#!/usr/bin/env bash
# Usage: ./04-athenz-roles.sh <permissions-yaml-path>
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
cd "${REPO_ROOT}"

source "${REPO_ROOT}/tools/color.sh"

[ "$#" -ge 1 ] || fatal "Usage: $0 <permissions-yaml-path>"
PERMISSIONS_YAML="$1"
PATTERN_NAMESPACE="${PATTERN_NAMESPACE:-mcp-pattern-3a}"

command -v kubectl >/dev/null || fatal "kubectl is required"
command -v yq >/dev/null || fatal "yq is required: brew install yq"

step "Pattern Athenz roles/policies"

kubectl create ns "${PATTERN_NAMESPACE}" --dry-run=client -o yaml | kubectl apply -f -

./tools/athenz/create-tld.sh "human"
./tools/setup-permissions.sh "${PERMISSIONS_YAML}"
ok "Athenz roles/policies applied"
