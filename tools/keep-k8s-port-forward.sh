#!/usr/bin/env bash
set -euo pipefail

TOOLS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

get_port() {
  "$TOOLS_DIR/port.sh" "$1"
}

trap 'kill $(jobs -p) 2>/dev/null || true' EXIT

_zms_port=$(get_port zms)
_zts_port=$(get_port zts)
_athenz_ui_port=$(get_port athenz-ui)
_api_port=$(get_port api-server)
_mcp_port=$(get_port mcp)
_idp_port=$(get_port keycloak)
_ai_client_gateway_port=$(get_port ai-client-gateway)
_open_webui_port=$(get_port open-webui)

_pf() {
  local ns=$1
  local resource=$2
  local local_port=$3
  local remote_port=$4

  while true; do
    err=$(kubectl -n "${ns}" port-forward "${resource}" "${local_port}:${remote_port}" 2>&1 1>/dev/tty) || true
    echo "$err" | grep -q "address already in use" && { echo "Error: port ${local_port} is already in use" >&2; exit 1; } || true
    sleep 3
  done
}

_pf athenz deployment/athenz-zms-server "${_zms_port}" 4443 &
_pf athenz deployment/athenz-zts-server "${_zts_port}" 4443 &
_pf athenz deployment/athenz-ui "${_athenz_ui_port}" 3000 &
_pf api deployment/api-server "${_api_port}" 8080 &
_pf api service/mcp "${_mcp_port}" 8081 &
_pf idp deployment/keycloak "${_idp_port}" 8080 &
_pf human service/ai-client-gateway "${_ai_client_gateway_port}" 3101 &
_pf ai service/open-webui "${_open_webui_port}" 8080 &

wait
