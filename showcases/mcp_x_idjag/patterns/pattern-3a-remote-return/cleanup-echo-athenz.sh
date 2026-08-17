#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../../.." && pwd)"
cd "${REPO_ROOT}"

source "${REPO_ROOT}/tools/color.sh"
ATHENZ_DOMAIN="${ATHENZ_DOMAIN:-mcp.pattern3a}"

# Delete only the resources introduced for the backend-free echo MCP. The
# existing docs MCP roles and the shared mcp-sa identity are intentionally
# left alone.
./tools/athenz/delete-policy.sh "${ATHENZ_DOMAIN}" echo-mcp-accessor_access_echo-mcp
./tools/athenz/delete-policy.sh "${ATHENZ_DOMAIN}" echo-mcp-accessor-jag-exchanger_zts_jag_exchange_role_echo-mcp-accessor
./tools/athenz/delete-role.sh "${ATHENZ_DOMAIN}" echo-mcp-accessor
./tools/athenz/delete-role.sh "${ATHENZ_DOMAIN}" echo-mcp-accessor-jag-exchanger
./tools/athenz/delete-service.sh "${ATHENZ_DOMAIN}" pattern-3a-echo-mcp-sa
rm -f "${REPO_ROOT}/keys/pattern-3a-echo-mcp-sa.key" \
  "${REPO_ROOT}/keys/pattern-3a-echo-mcp-sa.public.key"
ok "Echo MCP Athenz resources removed"
