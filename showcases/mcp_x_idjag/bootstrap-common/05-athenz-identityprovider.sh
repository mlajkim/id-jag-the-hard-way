#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
cd "${REPO_ROOT}"

source "${REPO_ROOT}/tools/color.sh"

[ "$#" -ge 1 ] || fatal "Usage: $0 <service-name> [<service-name> ...]"
SERVICES=("$@")

command -v kubectl >/dev/null || fatal "kubectl is required"

step "[5/6] athenz-identityprovider (k8s-athenz-sia infra)"
make -C athenz_dist deploy-kubernetes-athenz-identityprovider

./tools/athenz/set-domain-template.sh sys.auth instance_provider \
  provider=athenz.identityprovider dnssuffix=svc.cluster.local
for _svc in "${SERVICES[@]}"; do
  ./tools/athenz/create-private-key.sh "./keys/${_svc}"
  ./tools/athenz/create-service.sh "api" "${_svc}" "./keys/${_svc}.public.key"
  ./tools/athenz/set-domain-template.sh "api" "identity_provisioning" \
    "instanceprovider=athenz.identityprovider" "service=${_svc}"
done
ok "athenz-identityprovider ready"
