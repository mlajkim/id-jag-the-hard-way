#!/usr/bin/env bash
set -euo pipefail

# Run only against a newly built image. No cluster, credentials, or host mounts
# are needed. The same checks run on native CI runners and local Docker builds.
component=${1:?Usage: check-container.sh COMPONENT IMAGE PLATFORM}
image=${2:?Image reference required}
platform=${3:?Platform required}
actual_platform=$(docker image inspect "$image" --format '{{.Os}}/{{.Architecture}}')
if [[ "$actual_platform" != "$platform" ]]; then
  echo "Expected $platform, found $actual_platform in $image" >&2
  exit 1
fi

container=
cleanup() {
  local status=$?
  if [[ -n "$container" ]]; then
    if (( status != 0 )); then
      docker logs "$container" >&2 || true
    fi
    docker stop --time 2 "$container" >/dev/null || true
  fi
}
trap cleanup EXIT

start() {
  container=$(docker run --rm --detach --network none --platform "$platform" "$@" "$image")
}

node_http() {
  docker exec -i "$container" node --input-type=module - "$@" <<'JS'
import assert from "node:assert/strict";
const [port, path, status, expectedBody] = process.argv.slice(2);
let failure;
for (let attempt = 0; attempt < 40; attempt++) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      signal: AbortSignal.timeout(1000),
    });
    assert.equal(response.status, Number(status));
    if (expectedBody !== undefined) {
      assert.deepEqual(await response.json(), JSON.parse(expectedBody));
    } else {
      await response.arrayBuffer();
    }
    process.exit(0);
  } catch (error) {
    failure = error;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}
throw failure;
JS
}

java_http() {
  local port=$1 path=$2 expected=$3
  for ((attempt = 0; attempt < 40; attempt++)); do
    if docker exec "$container" bash -ec '
      exec 3<>/dev/tcp/127.0.0.1/"$1"
      printf "GET %s HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n" "$2" >&3
      read -r -t 2 status <&3
      [[ "$status" == *" $3 "* ]]
    ' -- "$port" "$path" "$expected" 2>/dev/null; then
      return
    fi
    sleep 1
  done
  echo "Expected HTTP $expected from $component $path" >&2
  return 1
}

case "$component" in
  idthw-demo-api)
    # The tutorial starts open and enables token enforcement later.
    start
    node_http 8080 /healthz 200 '{"ok":true,"accessTokenEnabled":false}'
    node_http 8080 /api/docs 200
    docker stop --time 2 "$container" >/dev/null
    container=

    start -e ACCESS_TOKEN_ENABLED=true
    node_http 8080 /healthz 200 '{"ok":true,"accessTokenEnabled":true}'
    node_http 8080 /api/docs 401
    ;;
  idthw-demo-api-mcp)
    start
    node_http 8080 /healthz 200
    ;;
  mcp-runtime-proxy)
    # This copied Go executable must run on the advertised architecture too.
    docker run --rm --network none --platform "$platform" --entrypoint zts-svccert "$image" -version
    start -e ATHENZ_EXPECTED_AUDIENCE=mcp -e ATHENZ_REQUIRED_SCOPE=mcp:role.mcp-accessor \
      -e ATHENZ_JWKS_URL=http://127.0.0.1:9/keys -e ATHENZ_JWKS_ALLOW_INSECURE_HTTP=true
    node_http 8082 /healthz 200
    node_http 8082 /protected 401
    ;;
  mcp)
    start
    node_http 8081 /health 200
    ;;
  mcp-gateway)
    start -e PUBLIC_BASE_URL=http://localhost:3103 -e KEYCLOAK_PUBLIC_URL=http://localhost:34443
    node_http 3103 /health 200
    ;;
  core-mcp-proxy)
    start
    node_http 8080 /health 200
    ;;
  ai-client-gateway)
    # Full startup requires deployment credentials. Exercise the TypeScript
    # runtime and native esbuild dependency without provisioning an identity.
    docker run --rm --network none --platform "$platform" \
      --entrypoint ./node_modules/.bin/tsx "$image" --eval \
      'import assert from "node:assert/strict"; const value: number = 1; assert.equal(value, 1);'
    ;;
  api-server)
    start
    java_http 8080 /api/docs 200
    ;;
  mcp-authorization-proxy)
    start
    java_http 8082 /protected 401
    ;;
  keycloak-token-exchange-provider|local-workload-instance-provider)
    # The default command exports the built JAR and exits successfully.
    docker run --rm --network none --platform "$platform" --tmpfs /export "$image"
    ;;
  *)
    echo "No container check defined for $component" >&2
    exit 1
    ;;
esac

echo "$component passed container checks on $platform"
