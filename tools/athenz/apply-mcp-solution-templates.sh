#!/usr/bin/env bash
set -euo pipefail

TOOLS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_DIR="$(cd "${TOOLS_DIR}/.." && pwd)"
source "${TOOLS_DIR}/color.sh"

namespace="athenz"
config_map="athenz-zms-custom-solution-templates"
config_key="custom_solution_templates.json"
work_dir=$(mktemp -d)
trap 'rm -rf "${work_dir}"' EXIT

current_file="${work_dir}/current.json"
merged_file="${work_dir}/${config_key}"

if ! kubectl -n "${namespace}" get configmap "${config_map}" \
  -o jsonpath="{.data.${config_key//./\\.}}" >"${current_file}" 2>/dev/null; then
  printf '%s\n' '{"templates":{}}' >"${current_file}"
fi

if ! jq -e '.templates | type == "object"' "${current_file}" >/dev/null 2>&1; then
  fatal "Existing ${config_map} does not contain a valid templates object"
fi

jq -s '{templates: (map(.templates // {}) | add)}' \
  "${current_file}" \
  "${REPO_DIR}/faqs/statics/mcp-hub-managed-access-solution-template.json" \
  "${REPO_DIR}/faqs/statics/mcp-exchange-helpers-solution-template.json" \
  >"${merged_file}"

kubectl -n "${namespace}" create configmap "${config_map}" \
  --from-file="${config_key}=${merged_file}" \
  --dry-run=client \
  --output=yaml | kubectl apply -f -

kubectl -n "${namespace}" rollout restart deployment/athenz-zms-server
kubectl -n "${namespace}" rollout status deployment/athenz-zms-server

ok "MCP solution templates loaded into ZMS"
