#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../../.." && pwd)"
cd "${REPO_ROOT}"

source "${REPO_ROOT}/tools/color.sh"
ATHENZ_DOMAIN="${ATHENZ_DOMAIN:-mcp.pattern3b}"

# The entire domain belongs to Pattern 3b: permissions/bootstrap resources and
# the agentgateway/bff-gateway-specific roles/services are all pattern-owned.
# The neighboring Pattern 2b/3a domains are separate and are not touched by
# this cleanup.
./tools/athenz/delete-domain.sh "${ATHENZ_DOMAIN}"
rm -f "${REPO_ROOT}/keys/pattern-3b-agentgateway.key" \
  "${REPO_ROOT}/keys/pattern-3b-agentgateway.public.key" \
  "${REPO_ROOT}/keys/pattern-3b-echo-mcp-sa.key" \
  "${REPO_ROOT}/keys/pattern-3b-echo-mcp-sa.public.key"
ok "Pattern 3b Athenz resources removed"
