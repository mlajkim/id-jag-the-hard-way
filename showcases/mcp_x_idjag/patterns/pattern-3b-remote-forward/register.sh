#!/usr/bin/env bash
#
# Usage: ./register.sh   (run from anywhere; paths below are repo-root-relative)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../../.." && pwd)"
cd "${REPO_ROOT}"

source "${REPO_ROOT}/tools/color.sh"

ATHENZ_DOMAIN="${ATHENZ_DOMAIN:-mcp.pattern3b}"
PATTERN_NAMESPACE="${PATTERN_NAMESPACE:-mcp-pattern-3b}"
_gateway_service="pattern-3b-agentgateway"
_bff_client_id="human.idjag-learner.pattern3b-gateway"
_bff_public_base_url="${PATTERN_3B_PUBLIC_BASE_URL:-http://localhost:3003}"

step "Pattern 3b Keycloak public client (mcp-bff-gateway's own OIDC RP login)"
./tools/athenz/create-subdomain.sh "human" "idjag-learner"
./tools/keycloak/create-client.sh \
  "${_bff_client_id}" \
  "${_bff_public_base_url}/oauth/callback" \
  "${_bff_public_base_url}" \
  "public"

step "Registering agentgateway's static Athenz mTLS identity"
if [ ! -f "${REPO_ROOT}/keys/${_gateway_service}.key" ]; then
  ./tools/athenz/create-private-key.sh "${REPO_ROOT}/keys/${_gateway_service}"
fi
./tools/athenz/create-service.sh "${ATHENZ_DOMAIN}" "${_gateway_service}" "${REPO_ROOT}/keys/${_gateway_service}.public.key"
./tools/athenz/enable-cert-provider.sh "${ATHENZ_DOMAIN}" "${_gateway_service}"
info "Fetching X.509 cert for the agentgateway identity (waiting for template to propagate)..."
_fetched=false
for _attempt in $(seq 1 10); do
  if ./tools/athenz/fetch-cert.sh "${ATHENZ_DOMAIN}" "${_gateway_service}" "${REPO_ROOT}/keys/${_gateway_service}.key" "v1" 2>/dev/null; then
    _fetched=true
    break
  fi
  warn "Attempt ${_attempt}/10 failed, retrying in 3s..."
  sleep 3
done
$_fetched || fatal "Could not fetch cert for ${ATHENZ_DOMAIN}.${_gateway_service} after 10 attempts"

./tools/athenz/set-service-oauth2-client-id.sh "${ATHENZ_DOMAIN}" "${_gateway_service}" "${_bff_client_id}"

kubectl create ns "${PATTERN_NAMESPACE}" --dry-run=client -o yaml | kubectl apply -f -

kubectl -n "${PATTERN_NAMESPACE}" create secret tls pattern-3b-agentgateway-mtls \
  --cert="${REPO_ROOT}/keys/${_gateway_service}.crt" \
  --key="${REPO_ROOT}/keys/${_gateway_service}.key" \
  --dry-run=client -o yaml | kubectl apply -f -
kubectl -n "${PATTERN_NAMESPACE}" create configmap athenz-ca \
  --from-file=ca.crt="${REPO_ROOT}/athenz_dist/certs/ca.cert.pem" \
  --dry-run=client -o yaml | kubectl apply -f -

step "Granting agentgateway ID-JAG exchange permissions"

./tools/athenz/create-role.sh "${ATHENZ_DOMAIN}" "mcp-accessor-jag-exchanger"
./tools/athenz/add-policy.sh "${ATHENZ_DOMAIN}" "mcp-accessor-jag-exchanger" "zts.jag_exchange" "role.mcp-accessor"
./tools/athenz/add-role-member.sh "${ATHENZ_DOMAIN}" "mcp-accessor-jag-exchanger" "human.idjag-learner"
./tools/athenz/add-role-member.sh "${ATHENZ_DOMAIN}" "mcp-accessor-jag-exchanger" "${ATHENZ_DOMAIN}.${_gateway_service}"
./tools/athenz/add-role-member.sh "${ATHENZ_DOMAIN}" "mcp-accessor-jag-exchanger" "mcp-hub.hub-ui"
./tools/athenz/create-role.sh "${ATHENZ_DOMAIN}" "docs-getter-jag-exchanger"
./tools/athenz/add-policy.sh "${ATHENZ_DOMAIN}" "docs-getter-jag-exchanger" "zts.jag_exchange" "role.docs-getter"
./tools/athenz/add-role-member.sh "${ATHENZ_DOMAIN}" "docs-getter-jag-exchanger" "human.idjag-learner"
./tools/athenz/add-role-member.sh "${ATHENZ_DOMAIN}" "docs-getter-jag-exchanger" "${ATHENZ_DOMAIN}.${_gateway_service}"

step "Registering the echo MCP Athenz identity and roles"
_echo_service="pattern-3b-echo-mcp-sa"
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
./tools/athenz/add-role-member.sh "${ATHENZ_DOMAIN}" "echo-mcp-accessor-jag-exchanger" "${ATHENZ_DOMAIN}.${_gateway_service}"
./tools/athenz/add-role-member.sh "${ATHENZ_DOMAIN}" "echo-mcp-accessor-jag-exchanger" "mcp-hub.hub-ui"
ok "Pattern 3b identities registered"
