#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../../.." && pwd)"
cd "${REPO_ROOT}"

source "${REPO_ROOT}/tools/color.sh"
ATHENZ_DOMAIN="${ATHENZ_DOMAIN:-mcp.pattern2b}"

# The entire domain belongs to Pattern 2b: permissions/bootstrap resources and
# the gateway-specific roles/service are all pattern-owned. The neighboring
# Pattern 3a domain is separate and is not touched by this cleanup.
./tools/athenz/delete-domain.sh "${ATHENZ_DOMAIN}"
rm -f "${REPO_ROOT}/keys/pattern-2b-gateway.key" \
  "${REPO_ROOT}/keys/pattern-2b-gateway.public.key" \
  "${REPO_ROOT}/keys/pattern-2b-echo-mcp-sa.key" \
  "${REPO_ROOT}/keys/pattern-2b-echo-mcp-sa.public.key"
ok "Pattern 2b Athenz resources removed"
