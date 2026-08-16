#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
cd "${REPO_ROOT}"

source "${REPO_ROOT}/tools/color.sh"

command -v kubectl >/dev/null || fatal "kubectl is required"
command -v jq >/dev/null || fatal "jq is required"
command -v docker >/dev/null || fatal "docker is required and must be running"
docker info >/dev/null 2>&1 || fatal "Docker daemon is not running"

step "[3/6] Athenz ZMS/ZTS (+ Keycloak trust)"
make -C athenz_dist clean-kubernetes-athenz deploy-kubernetes-athenz

cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: ConfigMap
metadata:
  name: zts-providers-config
  namespace: athenz
data:
  providers.json: |
    [
      {
        "issuerUri": "http://localhost:$(./tools/port.sh keycloak)/realms/master",
        "jwksUri": "http://keycloak.idp:8080/realms/master/protocol/openid-connect/certs",
        "providerClassName": "com.mlajkim.athenz.KeycloakTokenExchangeProvider"
      }
    ]
EOF

_zts_props_file=$(mktemp)
kubectl get configmap athenz-zts-conf -n athenz -o jsonpath='{.data.zts\.properties}' > "${_zts_props_file}"
if ! grep -q "athenz.zts.oauth_provider_config_file" "${_zts_props_file}"; then
  echo "athenz.zts.oauth_provider_config_file=/opt/athenz/zts/conf/providers.json" >> "${_zts_props_file}"
fi
if ! grep -q "athenz.zts.no_auth_uri_list.*domain/.+/service" "${_zts_props_file}"; then
  sed -i.bak -E 's#^(athenz\.zts\.no_auth_uri_list=.*)$#\1,/zts/v1/domain/.+/service/.+,/zts/v1/domain/.+/signed_policy_data#' "${_zts_props_file}"
  rm -f "${_zts_props_file}.bak"
fi
kubectl patch configmap athenz-zts-conf -n athenz --type merge \
  -p "$(jq -Rs '{data: {"zts.properties": .}}' "${_zts_props_file}")"
rm -f "${_zts_props_file}"

kubectl patch deployment athenz-zts-server -n athenz \
  --patch-file "${REPO_ROOT}/showcases/mcp_x_idjag/k8s-common/zts-keycloak-trust-patch.yaml"

make -C athenz_dist check-kubernetes-athenz
ok "Athenz ready (ZTS already trusts Keycloak)"

if ! pgrep -f "keep-k8s-port-forward.sh" >/dev/null 2>&1; then
  step "Starting port-forwarder in the background"
  nohup ./tools/keep-k8s-port-forward.sh >/tmp/idthw-port-forward.log 2>&1 &
  disown
  sleep 5
  ok "Port-forwarder started (log: /tmp/idthw-port-forward.log)"
else
  ok "Port-forwarder already running"
fi

_zms_port=$(./tools/port.sh zms)
info "Waiting for the ZMS port-forward to come up..."
for _i in $(seq 1 30); do
  curl -k -s -o /dev/null "https://localhost:${_zms_port}/zms/v1/domain" && break
  sleep 2
done
