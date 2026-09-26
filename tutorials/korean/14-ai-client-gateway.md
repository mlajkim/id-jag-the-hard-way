| 이전 | 현재 | 다음 |
|:---:|:---:|:---:|
| [신뢰할 수 있는 ID 제공자 (Identity Provider, IdP)](./13-trusted-identity-provider.md) | **AI Client Gateway** | [ID-JAG](./15-id-jag.md) |

<a id="ai-client-gateway--codex"></a>

# AI Client Gateway — Codex

Codex CLI와 MCP 서비스 사이에 AI Client Gateway를 배포합니다. 게이트웨이는 로그인한 사용자의 Keycloak ID 토큰 (ID Token)으로 Athenz 액세스 토큰 (Access Token)을 발급받습니다. 이후 API 접근을 위한 교환은 MCP Runtime Proxy가 수행합니다.

<!-- TOC depthFrom:2 depthTo:2 -->

- [Kubernetes에 AI Client Gateway 배포](#kubernetes에-ai-client-gateway-배포)
- [필요한 인증서 생성](#필요한-인증서-생성)
- [인증서 마운트](#인증서-마운트)
- [Keycloak 클라이언트 Secret 생성](#keycloak-클라이언트-secret-생성)
- [게이트웨이 설정](#게이트웨이-설정)
- [Keycloak 로그아웃](#keycloak-로그아웃)
- [Codex MCP 설정 변경](#codex-mcp-설정-변경)
- [동작 확인](#동작-확인)
- [다음 단계](#다음-단계)

<!-- /TOC -->

<a id="deploy-ai-client-gateway-in-k8s"></a>

## Kubernetes에 AI Client Gateway 배포

게이트웨이는 사람이 제어하는 클라이언트 측 구성 요소이므로 `human` 네임스페이스에 배포합니다.

`human` 네임스페이스를 만듭니다. 앞서 이미 만들었다면 건너뜁니다:

```sh
kubectl create ns human
```

`codex-idjag-learner-ai-client-gateway`라는 이름으로 게이트웨이를 배포합니다:

```sh
kubectl create deploy codex-idjag-learner-ai-client-gateway -n human \
  --image=ghcr.io/mlajkim/ai-client-gateway:latest
```

```sh
# deployment.apps/codex-idjag-learner-ai-client-gateway created
```

`ai-client-gateway` 컨테이너의 로그를 확인합니다:

```sh
kubectl logs deploy/codex-idjag-learner-ai-client-gateway -n human -c ai-client-gateway
```

```sh
# ...
# Error: ENOENT: no such file or directory, open '/app/certs/ai-client-gateway.crt'
# ...
```

게이트웨이가 Athenz ZTS에 자신의 신원을 증명하려면 X.509 인증서가 필요하지만, 아직 인증서를 제공하지 않았기 때문입니다.

> [!NOTE]
> 조회 결과가 `ContainerCreating`라면 현재 컨테이너가 아직 시작되지 않은 상태입니다. 잠시 후 다시 실행하거나, 이전 실행이 종료된 뒤 재시작 중이라면 위 명령에 `--previous`를 붙여 직전 로그를 확인합니다.

<a id="generate-the-required-certificates"></a>

## 필요한 인증서 생성

서비스 ID를 만들고 X.509 인증서를 발급받습니다:

```sh
./tools/athenz/create-private-key.sh "./keys/human-idjag-learner-codex"
./tools/athenz/create-subdomain.sh "human" "idjag-learner"
./tools/athenz/create-service.sh "human.idjag-learner" "codex" "./keys/human-idjag-learner-codex.public.key"
./tools/athenz/enable-cert-provider.sh "human.idjag-learner" "codex"
./tools/athenz/fetch-cert.sh "human.idjag-learner" "codex" "./keys/human-idjag-learner-codex.key" "v1"
```

```sh
#   ·  Generating RSA key pair for: ./keys/human-idjag-learner-codex...
#   ✔  Keys generated: ./keys/human-idjag-learner-codex.key, ./keys/human-idjag-learner-codex.public.key
#   ·  Creating Subdomain: human.idjag-learner...
#   ✔  Subdomain created: human.idjag-learner
#   ·  Registering Service: human.idjag-learner.codex...
#   ✔  Service registered: human.idjag-learner.codex
#   ·  Enabling ZTS Certificate Provider for human.idjag-learner.codex...
# [Template(s) successfully applied to domain]
#   ✔  ZTS Certificate Provider enabled for human.idjag-learner.codex
#   ·  Fetching X.509 Certificate for human.idjag-learner.codex...
#   ✔  Certificate saved to: ./keys/human-idjag-learner-codex.crt
```

<a id="mount-the-certificates"></a>

## 인증서 마운트

인증서, 개인 키, CA 인증서를 Kubernetes Secret에 저장합니다:

```sh
test -f ./keys/human-idjag-learner-codex.crt

kubectl delete -n human secret human-idjag-learner-codex-cert --ignore-not-found=true
kubectl -n human create secret generic human-idjag-learner-codex-cert \
  --from-file=ai-client-gateway.crt=./keys/human-idjag-learner-codex.crt \
  --from-file=ai-client-gateway.key=./keys/human-idjag-learner-codex.key \
  --from-file=ca.crt=./athenz_dist/certs/ca.cert.pem
```

```sh
# secret/human-idjag-learner-codex-cert created
```

게이트웨이 Pod에 Secret을 마운트합니다:

```sh
kubectl patch deploy codex-idjag-learner-ai-client-gateway -n human --patch "$(cat <<'EOF'
spec:
  template:
    spec:
      containers:
        - name: ai-client-gateway
          volumeMounts:
            - name: certs
              mountPath: /app/certs
              readOnly: true
      volumes:
        - name: certs
          secret:
            secretName: human-idjag-learner-codex-cert
EOF
)"
```

```sh
# deployment.apps/codex-idjag-learner-ai-client-gateway patched
```

인증서 마운트를 적용한 새 Pod가 준비될 때까지 기다립니다:

```sh
kubectl rollout status deployment/codex-idjag-learner-ai-client-gateway -n human --timeout=180s
```

```sh
# deployment "codex-idjag-learner-ai-client-gateway" successfully rolled out
```

이번에는 현재 컨테이너의 로그를 확인해 게이트웨이가 오류 없이 시작되었는지 확인합니다:

```sh
kubectl logs deploy/codex-idjag-learner-ai-client-gateway -n human -c ai-client-gateway
```

```sh
# 🚀 OpenWebUI OpenAPI Gateway listening on 0.0.0.0:3101
# 🔗 Upstream API: http://mcp.mcp:8081
# 🌍 Public Base URL: http://localhost:44444
# 🔑 Athenz ZTS Endpoint: https://athenz-zts-server.athenz:4443/zts/v1
```

<a id="deploy-the-human-gateway"></a>

<a id="create-the-keycloak-client-secret"></a>

## Keycloak 클라이언트 Secret 생성

OAuth2 로그인 흐름에 필요한 Keycloak 인증 정보를 게이트웨이에 설정합니다.

Keycloak 클라이언트 인증 정보로 Kubernetes Secret을 만듭니다:

```sh
./tools/keycloak/create-client-k8s-secret.sh \
  "human.idjag-learner.codex" \
  "human" \
  "human-idjag-learner-codex-keycloak"
```

```sh
#   ·  Fetching Keycloak admin token...
#   ·  Looking up UUID for client human.idjag-learner.codex...
#   ·  Fetching client secret...
#   ·  Creating K8s secret human/human-idjag-learner-codex-keycloak...
# secret/human-idjag-learner-codex-keycloak created
#   ✔  Secret created: human/human-idjag-learner-codex-keycloak
```

게이트웨이가 등록된 OAuth2 클라이언트로 Keycloak에 인증할 수 있도록 `KEYCLOAK_CLIENT_ID`와 `KEYCLOAK_CLIENT_SECRET`을 설정합니다. 방금 만든 `human-idjag-learner-codex-keycloak` Secret의 `client-id`와 `client-secret` 키를 참조하도록 연결합니다:

```sh
kubectl patch deploy codex-idjag-learner-ai-client-gateway -n human --type=strategic --patch "$(cat <<'EOF'
spec:
  template:
    spec:
      containers:
        - name: ai-client-gateway
          env:
            - name: KEYCLOAK_CLIENT_ID
              valueFrom:
                secretKeyRef:
                  name: human-idjag-learner-codex-keycloak
                  key: client-id
            - name: KEYCLOAK_CLIENT_SECRET
              valueFrom:
                secretKeyRef:
                  name: human-idjag-learner-codex-keycloak
                  key: client-secret
EOF
)"
```

```sh
# deployment.apps/codex-idjag-learner-ai-client-gateway patched
```

<a id="set-env-vars-for-the-gateway"></a>

<a id="configure-the-gateway"></a>

## 게이트웨이 설정

게이트웨이에 필요한 정보를 연결 대상별로 나누어 설정합니다. 각 명령은 지정한 변수만 변경하므로 앞 단계의 값은 유지됩니다.

### 1. MCP 서버 주소 설정

먼저 게이트웨이가 요청을 전달할 MCP 서버 주소를 지정합니다. `UPSTREAM_BASE_URL`에는 앞서 배포한 MCP Service의 클러스터 내부 주소를 넣습니다:

```sh
kubectl set env deployment/codex-idjag-learner-ai-client-gateway -n human \
  --containers=ai-client-gateway \
  UPSTREAM_BASE_URL=http://mcp.mcp:8081
```

```sh
# deployment.apps/codex-idjag-learner-ai-client-gateway env updated
```

### 2. Athenz 토큰 발급 설정

MCP 요청에 사용할 액세스 토큰 (Access Token)을 발급받을 곳을 지정합니다. `ZTS_URL`은 ID 토큰 → ID-JAG → 액세스 토큰 교환을 요청할 Athenz ZTS 주소입니다. `ATHENZ_ACCESS_TOKEN_AUDIENCE=mcp`는 발급받을 액세스 토큰의 수신 대상을 지정합니다. ID-JAG의 audience는 ZTS URL을 사용합니다:

```sh
kubectl set env deployment/codex-idjag-learner-ai-client-gateway -n human \
  --containers=ai-client-gateway \
  ZTS_URL=https://athenz-zts-server.athenz:4443/zts/v1 \
  ATHENZ_ACCESS_TOKEN_AUDIENCE=mcp
```

```sh
# deployment.apps/codex-idjag-learner-ai-client-gateway env updated
```

### 3. Keycloak 로그인 서버 연결

사용자가 로그인한 뒤 게이트웨이는 Keycloak에서 받은 인가 코드를 토큰으로 교환합니다. 이 서버 간 요청에 사용할 주소를 `KEYCLOAK_URL`로, 앞서 클라이언트를 등록한 realm을 `KEYCLOAK_REALM`으로 지정합니다:

```sh
kubectl set env deployment/codex-idjag-learner-ai-client-gateway -n human \
  --containers=ai-client-gateway \
  KEYCLOAK_URL=http://keycloak.idp:8080 \
  KEYCLOAK_REALM=master
```

```sh
# deployment.apps/codex-idjag-learner-ai-client-gateway env updated
```

### 4. 브라우저에서 접근할 주소 설정

이제 브라우저가 접근할 포트 포워딩 주소를 설정합니다. `KEYCLOAK_PUBLIC_URL`은 로그인 화면으로 이동할 Keycloak 주소이고, `PUBLIC_BASE_URL`은 로그인 후 `/oauth/callback`으로 돌아올 게이트웨이 주소입니다. AI 클라이언트도 이 게이트웨이 주소로 연결합니다:

```sh
_gateway_port=$(./tools/port.sh ai-client-gateway-codex)
_keycloak_port=$(./tools/port.sh keycloak)

kubectl set env deployment/codex-idjag-learner-ai-client-gateway -n human \
  --containers=ai-client-gateway \
  PUBLIC_BASE_URL="http://localhost:${_gateway_port}" \
  KEYCLOAK_PUBLIC_URL="http://localhost:${_keycloak_port}"
```

```sh
# deployment.apps/codex-idjag-learner-ai-client-gateway env updated
```

### 5. Service 노출 및 동작 확인

Deployment를 Service로 노출합니다:

```sh
kubectl delete -n human svc ai-client-gateway-codex --ignore-not-found=true
kubectl expose deploy codex-idjag-learner-ai-client-gateway -n human --port 3101 --name ai-client-gateway-codex
```

```sh
# service/ai-client-gateway-codex exposed
```

게이트웨이 설정을 적용한 롤아웃이 끝날 때까지 기다립니다:

```sh
kubectl rollout status deployment/codex-idjag-learner-ai-client-gateway -n human --timeout=180s
```

```sh
# deployment "codex-idjag-learner-ai-client-gateway" successfully rolled out
```

현재 컨테이너의 시작 로그를 확인합니다:

```sh
kubectl logs deploy/codex-idjag-learner-ai-client-gateway -n human -c ai-client-gateway --tail=5
```

```sh
# 🚀 OpenWebUI OpenAPI Gateway listening on 0.0.0.0:3101
# 🔗 Upstream API: http://mcp.mcp:8081
# 🌍 Public Base URL: http://localhost:44444
# 🔑 Athenz ZTS Endpoint: https://athenz-zts-server.athenz:4443/zts/v1
```

<a id="verification-prerequisite"></a>

<a id="sign-out-of-keycloak"></a>

## Keycloak 로그아웃

새 세션에서 확인할 수 있도록 먼저 Keycloak에서 로그아웃합니다:

```sh
_keycloak_port=$(./tools/port.sh keycloak)
./tools/open.sh "http://localhost:${_keycloak_port}/realms/master/protocol/openid-connect/logout"
```

Keycloak에 **"Do you want to log out?"**이 표시되면 **Logout**을 클릭합니다.

<a id="update-codex-mcp-config"></a>

## Codex MCP 설정 변경

`.codex/config.toml`을 아래 내용으로 바꾸고 제공된 설정을 덧붙여 Codex가 게이트웨이에 연결하도록 합니다. 이제 게이트웨이가 ID-JAG 흐름 전체를 처리하므로, 액세스 토큰을 미리 발급받아 `Authorization` 헤더에 직접 넣을 필요가 없습니다:

```sh
_gateway_port=$(./tools/port.sh ai-client-gateway-codex)

cat > .codex/config.toml <<EOF
[mcp_servers.id-jag-the-hard-way-mcp]
enabled = true
url = "http://localhost:${_gateway_port}/mcp"
auth = "oauth"
EOF

cat .codex/settings.toml >> .codex/config.toml
```

> [!NOTE]
> `Authorization` 헤더나 미리 발급받은 액세스 토큰이 없다는 점을 확인해 주세요. 게이트웨이가 사용자를 대신해 ID-JAG 흐름 전체를 처리합니다.

<a id="verify"></a>

## 동작 확인

로그인하기 전에 현재 Codex 세션을 종료합니다:

```sh
/quit
```

프로젝트 디렉터리의 터미널에서 MCP 로그인 명령을 실행합니다:

```sh
codex mcp login id-jag-the-hard-way-mcp
```

```sh
# Authorize `id-jag-the-hard-way-mcp` by opening this URL in your browser:
# http://localhost:44444/oauth/authorize?...
```

해당 URL을 브라우저에서 열고 다음 계정으로 로그인합니다:

- 사용자 이름: `idjag-learner`
- 비밀번호: `password`

로그인을 마치면 터미널에 다음과 같이 표시됩니다:

```sh
# Successfully logged in to MCP server 'id-jag-the-hard-way-mcp'.
```

로그인을 마치면 같은 프로젝트 디렉터리에서 Codex를 다시 실행해 변경한 설정과 로그인 정보를 불러옵니다:

```sh
codex
```

Codex 안에서 MCP 연결 상태를 확인합니다:

```sh
/mcp
```

```sh
# 🔌  MCP Tools

#   • id-jag-the-hard-way-mcp: failed (0 tools)
```

로그인은 성공했지만 MCP 연결 상태는 `failed (0 tools)`로 표시됩니다. 이번 단계에서 예상되는 결과입니다. 게이트웨이는 로그인한 사용자의 Keycloak ID 토큰을 Athenz ZTS를 통해 교환하려 하지만, `human.idjag-learner.codex`에 요청한 MCP 역할의 `zts.jag_exchange` 권한이 아직 없어 Athenz가 교환을 거부합니다.

다른 터미널에서 AI Client Gateway의 최근 로그 8줄을 확인해 교환 요청이 어디서 실패했는지 살펴봅니다:

```sh
kubectl logs deploy/codex-idjag-learner-ai-client-gateway -n human -c ai-client-gateway --tail=8
```

출력 예시입니다:

```sh
# [Athenz ID-JAG] 🔑 Resolved ID token from bearer session (Claude Code path)
# [Athenz ID-JAG] 🔄 Attempting to exchange new ID-JAG with id-token for scope [mcp:role.mcp-accessor] ...
# [Athenz ID-JAG] 🎯 Target ZTS for ID-JAG: https://athenz-zts-server.athenz:4443/zts/v1/oauth2/token
# [2026-09-26T10:45:04.305Z] Proxy request failed: Error: Athenz ZTS Error: HTTP 403 - {"code":403,"message":"Principal not authorized for token exchange for the requested role"}
#     at IncomingMessage.<anonymous> (file:///app/src/utils/idtokenIntoIdjag.js:63:18)
#     at IncomingMessage.emit (node:events:531:35)
#     at endReadableNT (node:internal/streams/readable:1698:12)
#     at process.processTicksAndRejections (node:internal/process/task_queues:89:21)
```

로그를 순서대로 보면 요청이 어디까지 진행됐는지 알 수 있습니다:

- `Resolved ID token from bearer session`: 게이트웨이가 세션에서 로그인한 사용자의 ID 토큰을 찾았습니다. `(Claude Code path)`는 Codex도 사용하는 공통 Bearer 세션 처리 경로의 로그 문구입니다
- `scope [mcp:role.mcp-accessor]`: 게이트웨이가 ZTS의 `/oauth2/token` 엔드포인트에 MCP 역할을 위한 ID-JAG를 요청했습니다
- `HTTP 403`과 `Principal not authorized for token exchange for the requested role`: ZTS가 게이트웨이의 교환 요청을 거부했습니다. 사용자가 역할에 속해 있는 것과 별개로, 게이트웨이에도 해당 역할에 대한 `zts.jag_exchange` 권한이 필요합니다

<a id="whats-next"></a>

<a id="next-steps"></a>

## 다음 단계

로그인은 성공했지만 Athenz가 게이트웨이의 ID-JAG 요청을 거부했습니다. 다음 장에서는 게이트웨이에 필요한 교환 권한을 부여하고 문서 요청을 다시 시도합니다.

다음: [ID-JAG](./15-id-jag.md)
