#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
source "${REPO_ROOT}/tools/color.sh"

[ "$#" -eq 2 ] || fatal "Usage: $0 <pattern-name> <oauth|dpop-connector>"
PATTERN_NAME="$1"
AUTH_MODE="$2"
PATTERN_NAMESPACE="${PATTERN_NAMESPACE:?PATTERN_NAMESPACE is required}"

command -v kubectl >/dev/null || fatal "kubectl is required"

case "${PATTERN_NAME}" in
  pattern-3a-remote-return)
    pattern_label="Pattern 3a: remote return"
    docs_public_url="http://docs.pattern-3a.localhost:3001/mcp"
    echo_public_url="http://echo.pattern-3a.localhost:3001/mcp"
    docs_discovery_url="http://mcp.${PATTERN_NAMESPACE}.svc.cluster.local:3000/mcp"
    echo_discovery_url="http://pattern-3a-echo-mcp.${PATTERN_NAMESPACE}.svc.cluster.local:3000/mcp"
    access_domain="mcp.pattern3a"
    docs_connector_command=""
    echo_connector_command=""
    ;;
  pattern-2b-remote-forward)
    pattern_label="Pattern 2b: remote forward"
    docs_public_url="http://mcp.pattern-2b.localhost:3002/mcp"
    echo_public_url="http://echo.pattern-2b.localhost:3002/mcp"
    docs_discovery_url="http://mcp.${PATTERN_NAMESPACE}.svc.cluster.local:3000/mcp"
    echo_discovery_url="http://pattern-2b-echo-mcp.${PATTERN_NAMESPACE}.svc.cluster.local:3000/mcp"
    access_domain="mcp.pattern2b"
    docs_connector_command='npm --prefix showcases/mcp_x_idjag/patterns/pattern-2b-remote-forward/client install
claude mcp add --scope local pattern-2b-docs \
  -e PATTERN_2B_MCP_URL=http://mcp.pattern-2b.localhost:3002/mcp \
  -- \
  node "$PWD/showcases/mcp_x_idjag/patterns/pattern-2b-remote-forward/client/src/index.js"'
    echo_connector_command='npm --prefix showcases/mcp_x_idjag/patterns/pattern-2b-remote-forward/client install
claude mcp add --scope local pattern-2b-echo \
  -e PATTERN_2B_MCP_URL=http://echo.pattern-2b.localhost:3002/mcp \
  -- node "$PWD/showcases/mcp_x_idjag/patterns/pattern-2b-remote-forward/client/src/index.js"'
    ;;
  *)
    fatal "Unsupported pattern: ${PATTERN_NAME}"
    ;;
esac

annotate() {
  local deployment="$1"
  local alias="$2"
  local description="$3"
  local public_url="$4"
  local discovery_url="$5"
  local scope="$6"
  local connector_command="${7:-}"

  kubectl -n "${PATTERN_NAMESPACE}" label "deployment/${deployment}" \
    app.kubernetes.io/part-of=mcp-hub \
    mcp.idthw.dev/project=mcp-x-idjag \
    --overwrite

  local annotation_args=(
    "mcp.idthw.dev/alias=${alias}"
    "mcp.idthw.dev/description=${description}"
    "mcp.idthw.dev/pattern=${pattern_label}"
    "mcp.idthw.dev/auth-mode=${AUTH_MODE}"
    "mcp.idthw.dev/public-url=${public_url}"
    "mcp.idthw.dev/discovery-url=${discovery_url}"
    "mcp.idthw.dev/access-scope=${scope}"
  )
  if [ -n "${connector_command}" ]; then
    annotation_args+=("mcp.idthw.dev/connector-command=${connector_command}")
  fi
  kubectl -n "${PATTERN_NAMESPACE}" annotate "deployment/${deployment}" \
    "${annotation_args[@]}" --overwrite
}

step "Registering ${pattern_label} MCP endpoints in MCP Hub"
annotate mcp "${pattern_label} docs MCP" \
  "MCP server for the ${pattern_label} ID-JAG showcase docs API" \
  "${docs_public_url}" "${docs_discovery_url}" \
  "${access_domain}:role.mcp-accessor" "${docs_connector_command}"
annotate "${PATTERN_NAME%-remote-*}-echo-mcp" "${pattern_label} echo MCP" \
  "Backend-free echo MCP for the ${pattern_label} ID-JAG showcase" \
  "${echo_public_url}" "${echo_discovery_url}" \
  "${access_domain}:role.echo-mcp-accessor" "${echo_connector_command}"
ok "${pattern_label} MCP endpoints are visible to MCP Hub"
