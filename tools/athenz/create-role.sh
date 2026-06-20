#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 2 ]; then
  echo "Usage: $0 <domain> <role>"
  exit 1
fi

domain=$1
role=$2
echo "Creating Role: ${domain}:role.${role}..."

curl -s -k -X PUT "https://localhost:4443/zms/v1/domain/${domain}/role/${role}" \
  --cert ./athenz_dist/certs/athenz_admin.cert.pem \
  --key ./athenz_dist/keys/athenz_admin.private.pem \
  -H "Content-Type: application/json" \
  -d '{
    "name": "'"${domain}:role.${role}"'"
  }'

