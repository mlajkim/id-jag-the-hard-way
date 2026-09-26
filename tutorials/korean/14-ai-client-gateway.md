| 이전 | 현재 | 다음 |
|:---:|:---:|:---:|
| [신뢰할 수 있는 ID 제공자 (Identity Provider, IdP)](./13-trusted-identity-provider.md) | **AI Client Gateway** | [ID-JAG](./15-id-jag.md) |

<a id="ai-client-gateway--codex"></a>

# AI Client Gateway — Codex

Codex CLI와 MCP 서비스 사이에 AI Client Gateway를 배포합니다. 게이트웨이는 로그인한 사용자의 Keycloak ID 토큰 (ID Token)으로 Athenz 액세스 토큰 (Access Token)을 발급받습니다. 이후 API 접근을 위한 교환은 MCP Runtime Proxy가 수행합니다.

<!-- TOC depthFrom:2 depthTo:2 -->

- [Kubernetes에 AI Client Gateway 배포](#deploy-ai-client-gateway-in-k8s)
- [필요한 인증서 생성](#generate-the-required-certificates)
- [인증서 마운트](#mount-the-certificates)
- [Keycloak 클라이언트 Secret 생성](#create-the-keycloak-client-secret)
- [게이트웨이 설정](#configure-the-gateway)
- [Keycloak 로그아웃](#sign-out-of-keycloak)
- [Codex MCP 설정 변경](#update-codex-mcp-config)
- [동작 확인](#verify)
- [다음 단계](#next-steps)

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

로그를 확인하면 인증서가 없다는 오류가 표시됩니다. 이 단계에서는 예상되는 결과입니다:

```sh
kubectl logs deploy/codex-idjag-learner-ai-client-gateway -n human
```

```sh
# ...
# Error: ENOENT: no such file or directory, open '...certs/ai-client-gateway.crt'
# ...
```

게이트웨이가 Athenz ZTS에 자신의 신원을 증명하려면 X.509 인증서가 필요하지만, 아직 인증서를 제공하지 않았기 때문입니다.

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

게이트웨이가 오류 없이 시작되었는지 확인합니다:

```sh
kubectl logs deploy/codex-idjag-learner-ai-client-gateway -n human
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

<a id="set-env-vars-for-the-gateway"></a>

<a id="configure-the-gateway"></a>

## 게이트웨이 설정

게이트웨이 Deployment의 환경 변수를 설정합니다:

<details>
<summary>각 변수의 역할</summary>

- `UPSTREAM_BASE_URL` — 게이트웨이가 요청을 전달할 클러스터 내부 MCP 서버 주소
- `ZTS_URL` — ID-JAG 토큰을 필요한 스코프가 담긴 액세스 토큰으로 교환하는 Athenz ZTS 엔드포인트
- `ATHENZ_ACCESS_TOKEN_AUDIENCE` — 게이트웨이가 발급받는 액세스 토큰의 수신 대상인 `mcp`. 토큰에는 MCP와 API 스코프가 모두 포함될 수 있으며, ID-JAG의 audience는 계속 ZTS URL을 사용
- `KEYCLOAK_URL` / `KEYCLOAK_REALM` — OAuth 콜백에서 서버 측 인가 코드 교환에 사용하는 클러스터 내부 Keycloak 주소와 realm
- `KEYCLOAK_CLIENT_ID` / `KEYCLOAK_CLIENT_SECRET` — 앞서 만든 Kubernetes Secret에서 가져오며, 게이트웨이를 등록된 OAuth2 클라이언트로 인증하는 데 사용
- `PUBLIC_BASE_URL` — 로그인 후 브라우저가 돌아오는 포트 포워딩된 게이트웨이 주소
- `KEYCLOAK_PUBLIC_URL` — 브라우저의 로그인 리디렉션 URL에 사용하는 포트 포워딩된 Keycloak 주소

</details>

```sh
_gateway_port=$(./tools/port.sh ai-client-gateway-codex)
_keycloak_port=$(./tools/port.sh keycloak)

kubectl patch deploy codex-idjag-learner-ai-client-gateway -n human --patch "$(cat <<EOF
spec:
  template:
    spec:
      containers:
        - name: ai-client-gateway
          imagePullPolicy: Always
          env:
            - name: UPSTREAM_BASE_URL
              value: "http://mcp.mcp:8081"
            - name: ATHENZ_ACCESS_TOKEN_AUDIENCE
              value: "mcp"
            - name: ZTS_URL
              value: "https://athenz-zts-server.athenz:4443/zts/v1"
            - name: KEYCLOAK_URL
              value: "http://keycloak.idp:8080"
            - name: KEYCLOAK_REALM
              value: "master"
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
            - name: PUBLIC_BASE_URL
              value: "http://localhost:${_gateway_port}"
            - name: KEYCLOAK_PUBLIC_URL
              value: "http://localhost:${_keycloak_port}"
EOF
)"
```

```sh
# deployment.apps/codex-idjag-learner-ai-client-gateway patched
```

Deployment를 Service로 노출하고 로그에 문제가 없는지 확인합니다:

```sh
kubectl delete -n human svc ai-client-gateway-codex --ignore-not-found=true
kubectl expose deploy codex-idjag-learner-ai-client-gateway -n human --port 3101 --name ai-client-gateway-codex
kubectl logs deploy/codex-idjag-learner-ai-client-gateway -n human --tail=5
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

`.codex/config.toml`을 아래 내용으로 바꾸고 제공된 설정을 덧붙여 Codex가 게이트웨이에 연결하도록 합니다. 이번에는 `Authorization` 헤더를 넣지 않습니다. 게이트웨이가 ID-JAG 흐름 전체를 처리합니다:

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

MCP 서버에 로그인합니다. 채팅 안에서 로그인을 안내하는 Claude Code와 달리 Codex는 별도의 로그인 명령을 사용합니다:

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

새 Codex 채팅을 시작합니다:

```sh
/new
```

Codex가 MCP 서버 초기화를 시도하지만 실패합니다:

![MCP 토큰 교환이 거부된 Codex](../codex/assets/15_codex_gateway_token_exchange_forbidden.png)

예상되는 결과입니다. Codex가 AI Client Gateway에 연결했고, 게이트웨이는 로그인한 사용자의 Keycloak ID 토큰을 Athenz ZTS를 통해 교환하려 했습니다. 하지만 `human.idjag-learner.codex`에 요청한 MCP 및 API 역할의 `zts.jag_exchange` 권한이 아직 없어 Athenz가 교환을 거부했습니다.

<a id="whats-next"></a>

<a id="next-steps"></a>

## 다음 단계

로그인은 성공했지만 Athenz가 게이트웨이의 ID-JAG 요청을 거부했습니다. 다음 장에서는 게이트웨이에 필요한 교환 권한을 부여하고 문서 요청을 다시 시도합니다.

다음: [ID-JAG](./15-id-jag.md)
