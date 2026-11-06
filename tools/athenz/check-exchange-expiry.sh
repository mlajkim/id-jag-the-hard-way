#!/usr/bin/env bash
set -euo pipefail

TOOLS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${TOOLS_DIR}/color.sh"

usage() {
  printf '%s\n' \
    "Usage: $0 <subject_cert> <subject_key> <exchanger_cert> <exchanger_key> <scope> [--audience <domain>] [--actor <principal>]" \
    'Issues one 30-second access token and repeatedly exchanges the latest child for the same audience and scopes.' \
    'Pass --actor to use delegation and keep that principal in may_act on every hop.' \
    'Runs at most 18 scheduled exchanges plus one final exchange; prints metadata and diagnostics, never raw tokens.'
}

if [ "${1:-}" = '-h' ] || [ "${1:-}" = '--help' ]; then
  usage
  exit 0
fi
[ $# -ge 5 ] || { usage >&2; exit 1; }

subject_cert=$1
subject_key=$2
exchanger_cert=$3
exchanger_key=$4
scope=$5
shift 5
audience=api
actor=''

while [ $# -gt 0 ]; do
  case "$1" in
    --audience|--actor)
      [ $# -ge 2 ] && [ -n "$2" ] || fatal "Missing value for $1"
      case "$1" in
        --audience) audience=$2 ;;
        --actor) actor=$2 ;;
      esac
      shift 2
      ;;
    *) fatal "Unknown argument: $1" ;;
  esac
done
[ -n "${scope}" ] || fatal 'Scope must not be empty'

decode_claims() {
  python3 -c 'import base64, json, sys
part = sys.stdin.read().strip().split(".")[1]
print(json.dumps(json.loads(base64.urlsafe_b64decode(part + "=" * (-len(part) % 4)))))'
}

issue_options=(--audience "${audience}" --expires-in 30)
exchange_options=(--audience "${audience}" --expires-in 30 --token-only)
if [ -n "${actor}" ]; then
  actor_token=$("${TOOLS_DIR}/athenz/fetch-actor-token.sh" \
    "${exchanger_cert}" "${exchanger_key}" "${actor}")
  issue_options+=(--actor "${actor}")
  exchange_options+=(--actor-token "${actor_token}" --actor "${actor}")
fi

info "Issuing the original access token once for audience: ${audience}"
original=$("${TOOLS_DIR}/athenz/fetch-access-token.sh" \
  "${subject_cert}" "${subject_key}" "${scope}" "${issue_options[@]}")
original_claims=$(printf '%s' "${original}" | decode_claims)
printf '%s' "${original_claims}" | jq -e --arg aud "${audience}" --arg actor "${actor}" '
  .aud == $aud and (.exp - .iat >= 20) and (.exp - .iat <= 30) and
  (if $actor == "" then .may_act == null else .may_act.sub == $actor end)
' >/dev/null || fatal 'Unexpected original audience, actor, or lifetime; this run is inconclusive'
subject=$(printf '%s' "${original_claims}" | jq -er '.sub | select(type == "string" and length > 0)')
original_scopes=$(printf '%s' "${original_claims}" | jq -ec '.scp | select(type == "array" and length > 0) | sort')
printf '%s' "${original_claims}" | jq -e --argjson scopes "${original_scopes}" '
  (.scope | split(" ") | map(select(length > 0)) | sort) == $scopes
' >/dev/null || fatal 'Original scope and scp claims disagree'
original_exp=$(printf '%s' "${original_claims}" | jq -er '.exp')
current=${original}
current_exp=${original_exp}
exchanger=''
hop=0
past_boundary=false
info "Original subject=${subject} audience=${audience} exp=${original_exp}"

advance_chain() {
  [ "$(date +%s)" -lt "${current_exp}" ] ||
    fatal 'The current token expired before the request; this run is inconclusive'
  parent_exp=${current_exp}
  current=$("${TOOLS_DIR}/athenz/exchange-access-token.sh" \
    "${exchanger_cert}" "${exchanger_key}" "${current}" "${scope}" "${exchange_options[@]}")
  claims=$(printf '%s' "${current}" | decode_claims)
  printf '%s' "${claims}" | jq -e \
    --arg sub "${subject}" --arg aud "${audience}" --arg actor "${actor}" \
    --arg exchanger "${exchanger}" --argjson scopes "${original_scopes}" '
    .sub == $sub and .aud == $aud and (.scp | sort) == $scopes and
    (.scope | split(" ") | map(select(length > 0)) | sort) == $scopes and
    (.client_id | type == "string" and length > 0) and
    ($exchanger == "" or .client_id == $exchanger) and
    (if $actor == "" then .act == null and .may_act == null
     else .act.sub == $actor and .may_act.sub == $actor and .client_id == $actor end)
  ' >/dev/null || fatal 'Child identity, audience, scopes, or actor claims changed'
  exchanger=$(printf '%s' "${claims}" | jq -er '.client_id')
  current_exp=$(printf '%s' "${claims}" | jq -er '.exp')
  current_iat=$(printf '%s' "${claims}" | jq -er '.iat')
  hop=$((hop + 1))
  info "hop=${hop} exchanger=${exchanger} iat=${current_iat} parent_exp=${parent_exp} child_exp=${current_exp} original_exp=${original_exp}"
  [ "${current_exp}" -gt "${parent_exp}" ] ||
    fatal 'Expiry did not advance; repeated lifetime extension was not reproduced'
}

for ((attempt=1; attempt<=18; attempt++)); do
  sleep 10
  advance_chain
  if [ "$(date +%s)" -ge "$((original_exp + 90))" ]; then
    past_boundary=true
    break
  fi
done
[ "${past_boundary}" = true ] || fatal 'Original expiry boundary not reached within the bounded run'

info 'Checking that the unchanged original token is rejected as expired'
# Capture a successful control response without printing or adopting its token.
if expired_log=$({
  discarded=$("${TOOLS_DIR}/athenz/exchange-access-token.sh" \
    "${exchanger_cert}" "${exchanger_key}" "${original}" "${scope}" "${exchange_options[@]}")
} 2>&1); then
  printf '%s\n' "${expired_log}" >&2
  fatal 'Original still accepted; inspect clock skew and the server build'
else
  printf '%s\n' "${expired_log}" >&2
  [[ "${expired_log}" == *'"code": 400'* ]] &&
    [[ "${expired_log}" == *'"message": "Invalid subject token: Unable to parse token: Expired JWT"'* ]] ||
    fatal 'Control failed for another reason; expiry rejection is not established'
  ok 'Original token rejected specifically because it expired'
fi

sleep 2
advance_chain
ok 'Child exchange succeeded after original token was rejected as expired'
ok 'The child kept the original subject, audience, and scopes'
