#!/usr/bin/env bash
#
# Usage: ./register.sh   (run from anywhere; paths below are repo-root-relative)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../../.." && pwd)"
cd "${REPO_ROOT}"

source "${REPO_ROOT}/tools/color.sh"

_mop_port="${MOP_PORT:-8082}"

step "Pattern 3a Keycloak client + Athenz role membership"
./tools/athenz/create-subdomain.sh "human" "idjag-learner"
./tools/keycloak/create-client.sh \
  "human.idjag-learner.pattern3a" \
  "https://localhost:${_mop_port}/authorize/callback" \
  "https://localhost:${_mop_port}"
./tools/keycloak/create-client-k8s-secret.sh \
  "human.idjag-learner.pattern3a" "api" "pattern-3a-mop-keycloak"
./tools/athenz/set-service-oauth2-client-id.sh \
  "api" "pattern-3a-mop-sa" "human.idjag-learner.pattern3a"
./tools/athenz/create-role.sh "api" "docs-getter-jag-exchanger"
./tools/athenz/add-policy.sh "api" "docs-getter-jag-exchanger" "zts.jag_exchange" "role.docs-getter"
./tools/athenz/add-role-member.sh "api" "docs-getter-jag-exchanger" "human.idjag-learner"
./tools/athenz/add-role-member.sh "api" "docs-getter-jag-exchanger" "api.pattern-3a-mop-sa"
./tools/athenz/create-role.sh "api" "mcp-accessor-jag-exchanger"
./tools/athenz/add-policy.sh "api" "mcp-accessor-jag-exchanger" "zts.jag_exchange" "role.mcp-accessor"
./tools/athenz/add-role-member.sh "api" "mcp-accessor-jag-exchanger" "human.idjag-learner"
./tools/athenz/add-role-member.sh "api" "mcp-accessor-jag-exchanger" "api.pattern-3a-mop-sa"
ok "Pattern 3a identity registered"
