#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../../.." && pwd)"
cd "${SCRIPT_DIR}"

source "${REPO_ROOT}/tools/color.sh"

command -v kubectl >/dev/null || fatal "kubectl is required"
command -v envsubst >/dev/null || fatal "envsubst is required: brew install gettext (and brew link --force gettext)"

PATTERN_NAMESPACE="${PATTERN_NAMESPACE:-mcp-pattern-3b}"
ATHENZ_DOMAIN="${ATHENZ_DOMAIN:-mcp.pattern3b}"
# mcp-bff-gateway is the one presenting the id_token to agentgateway, so it
# is the audience jwtAuthentication must accept - unlike Pattern 2b, there is
# no local developer-machine client with its own Keycloak client.
KEYCLOAK_CLIENT_ID="${KEYCLOAK_CLIENT_ID:-human.idjag-learner.pattern3b-gateway}"
# Keycloak derives each issued token's "iss" claim from the Host header of
# the /token request that issued it, not from the network address actually
# used to reach it. Athenz ZTS's own trusted-issuer config
# (bootstrap-common/03-athenz.sh's issuerUri) only recognizes
# http://localhost:34443/realms/master, so mcp-bff-gateway's server-to-server
# /token call explicitly overrides its Host header to match that value (see
# oauth.go's handleCallback) even though it physically connects to the
# in-cluster Keycloak Service. The issuer configured here must match that
# same value for the same reason.
KEYCLOAK_ISSUER="${KEYCLOAK_ISSUER:-http://localhost:34443/realms/master}"
export PATTERN_NAMESPACE ATHENZ_DOMAIN KEYCLOAK_CLIENT_ID KEYCLOAK_ISSUER

step "Applying Pattern 3b agentgateway routes/policies"
kubectl create ns "${PATTERN_NAMESPACE}" --dry-run=client -o yaml | kubectl apply -f -
for _file in k8s/agentgateway-routes/*.yaml; do
  info "Applying ${_file}"
  envsubst '$PATTERN_NAMESPACE $ATHENZ_DOMAIN $KEYCLOAK_ISSUER $KEYCLOAK_CLIENT_ID' < "${_file}" | kubectl apply -f -
done
ok "Pattern 3b routes/policies applied"
