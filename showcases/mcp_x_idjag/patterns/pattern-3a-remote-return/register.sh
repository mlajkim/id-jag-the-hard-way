#!/usr/bin/env bash
#
# Usage: ./register.sh   (run from anywhere; paths below are repo-root-relative)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../../.." && pwd)"
cd "${REPO_ROOT}"

source "${REPO_ROOT}/tools/color.sh"

_mop_port="${MOP_PORT:-8082}"
ATHENZ_DOMAIN="${ATHENZ_DOMAIN:-mcp.pattern3a}"
PATTERN_NAMESPACE="${PATTERN_NAMESPACE:-mcp-pattern-3a}"

step "Pattern 3a Keycloak client + Athenz role membership"
./tools/athenz/create-subdomain.sh "human" "idjag-learner"
./tools/keycloak/create-client.sh \
  "human.idjag-learner.pattern3a" \
  "https://localhost:${_mop_port}/authorize/callback" \
  "https://localhost:${_mop_port}"
./tools/keycloak/create-client-k8s-secret.sh \
  "human.idjag-learner.pattern3a" "${PATTERN_NAMESPACE}" "pattern-3a-mop-keycloak"
./tools/athenz/set-service-oauth2-client-id.sh \
  "${ATHENZ_DOMAIN}" "pattern-3a-mop-sa" "human.idjag-learner.pattern3a"
./tools/athenz/create-role.sh "${ATHENZ_DOMAIN}" "docs-getter-jag-exchanger"
./tools/athenz/add-policy.sh "${ATHENZ_DOMAIN}" "docs-getter-jag-exchanger" "zts.jag_exchange" "role.docs-getter"
./tools/athenz/add-role-member.sh "${ATHENZ_DOMAIN}" "docs-getter-jag-exchanger" "human.idjag-learner"
./tools/athenz/add-role-member.sh "${ATHENZ_DOMAIN}" "docs-getter-jag-exchanger" "${ATHENZ_DOMAIN}.pattern-3a-mop-sa"
./tools/athenz/create-role.sh "${ATHENZ_DOMAIN}" "mcp-accessor-jag-exchanger"
./tools/athenz/add-policy.sh "${ATHENZ_DOMAIN}" "mcp-accessor-jag-exchanger" "zts.jag_exchange" "role.mcp-accessor"
./tools/athenz/add-role-member.sh "${ATHENZ_DOMAIN}" "mcp-accessor-jag-exchanger" "human.idjag-learner"
./tools/athenz/add-role-member.sh "${ATHENZ_DOMAIN}" "mcp-accessor-jag-exchanger" "${ATHENZ_DOMAIN}.pattern-3a-mop-sa"
./tools/athenz/add-role-member.sh "${ATHENZ_DOMAIN}" "mcp-accessor-jag-exchanger" "mcp-hub.hub-ui"

step "Registering the echo MCP Athenz identity and roles"
_echo_service="pattern-3a-echo-mcp-sa"
if [ ! -f "${REPO_ROOT}/keys/${_echo_service}.key" ]; then
  ./tools/athenz/create-private-key.sh "${REPO_ROOT}/keys/${_echo_service}"
fi
./tools/athenz/create-service.sh "${ATHENZ_DOMAIN}" "${_echo_service}" "${REPO_ROOT}/keys/${_echo_service}.public.key"
./tools/athenz/set-domain-template.sh "${ATHENZ_DOMAIN}" "identity_provisioning" \
  "instanceprovider=athenz.identityprovider" "service=${_echo_service}"

./tools/athenz/create-role.sh "${ATHENZ_DOMAIN}" "echo-mcp-accessor"
./tools/athenz/add-policy.sh "${ATHENZ_DOMAIN}" "echo-mcp-accessor" "access" "echo-mcp"
./tools/athenz/add-role-member.sh "${ATHENZ_DOMAIN}" "echo-mcp-accessor" "human.idjag-learner"
./tools/athenz/create-role.sh "${ATHENZ_DOMAIN}" "echo-mcp-accessor-jag-exchanger"
./tools/athenz/add-policy.sh "${ATHENZ_DOMAIN}" "echo-mcp-accessor-jag-exchanger" "zts.jag_exchange" "role.echo-mcp-accessor"
./tools/athenz/add-role-member.sh "${ATHENZ_DOMAIN}" "echo-mcp-accessor-jag-exchanger" "human.idjag-learner"
./tools/athenz/add-role-member.sh "${ATHENZ_DOMAIN}" "echo-mcp-accessor-jag-exchanger" "${ATHENZ_DOMAIN}.pattern-3a-mop-sa"
./tools/athenz/add-role-member.sh "${ATHENZ_DOMAIN}" "echo-mcp-accessor-jag-exchanger" "mcp-hub.hub-ui"
ok "Pattern 3a identity registered"
