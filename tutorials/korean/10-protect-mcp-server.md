| 이전 | 현재 | 다음 |
|:---:|:---:|:---:|
| [Codex](./09-ai-agent.md) | **MCP 서버 보호** | [토큰 교환](./11-token-exchange.md) |

<a id="protect-mcp-server--codex"></a>

# MCP 서버 보호 — Codex

이전 장에서는 AI 클라이언트가 Athenz 액세스 토큰 (Access Token, AT)으로 문서를 조회했습니다. AT로 API 서버를 보호한 것처럼 MCP 서버도 보호해 보겠습니다.

[MCP 인가 명세](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization#access-token-privilege-restriction)의 관련 내용은 다음과 같습니다(번역):

> *MCP 서버가 업스트림 API에 요청을 보낸다면 해당 API의 OAuth 클라이언트로 동작할 수 있습니다. 업스트림 API에 사용하는 액세스 토큰은 업스트림 인가 서버 (Authorization Server)가 발급한 별도의 토큰입니다. MCP 서버는 MCP 클라이언트로부터 받은 토큰을 그대로 전달해서는 **안 됩니다(MUST NOT)**.*

이번 장에서는 MCP 서버 앞에 `MCP Runtime Proxy`를 인가 프록시 (Authorization Proxy)로 배포합니다. 도구를 호출하려면 토큰의 수신 대상 (audience)이 `mcp`이고 스코프 (Scope)가 `mcp:role.mcp-accessor`인 AT가 필요하도록 설정합니다. 이전에 사용한 API 토큰이 거부되는 것을 확인한 뒤, 실습자에게 MCP 접근 권한을 부여합니다.

<!-- TOC depthFrom:2 depthTo:2 -->

- [MCP Runtime Proxy를 인가 프록시 (Authorization Proxy)로 배포](#deploy-mcp-runtime-proxy-as-an-authorization-proxy)
- [MCP 접근 거부 확인](#verify-mcp-access-is-rejected)
- [실습자에게 MCP 접근 권한 부여](#grant-the-learner-mcp-access)
- [Codex에 MCP 토큰 적용](#update-codex-with-the-mcp-token)
- [MCP 접근 허용 확인](#verify-mcp-access-is-accepted)
- [다음 단계](#next-steps)

<!-- /TOC -->

<a id="deploy-mcp-runtime-proxy-as-an-authorization-proxy"></a>

## MCP Runtime Proxy를 인가 프록시 (Authorization Proxy)로 배포

프록시는 도구 호출을 MCP 서버에 전달하기 전에 Athenz 액세스 토큰을 검증합니다.

<a id="attach-the-proxy"></a>

### 프록시 추가

MCP Pod의 두 번째 컨테이너로 Runtime Proxy를 추가합니다. 필요한 audience와 MCP 스코프를 설정하고, `MCP_TOOL_SCOPES`에 각 도구가 요구하는 API 권한을 지정합니다. Athenz 도메인과 실습자 역할은 아래에서 만듭니다.

```sh
kubectl patch deploy mcp -n mcp --patch "$(cat <<'EOF'
spec:
  template:
    spec:
      containers:
        - name: auth-proxy
          image: ghcr.io/mlajkim/mcp-runtime-proxy:latest
          imagePullPolicy: Always
          env:
            - name: ATHENZ_EXPECTED_AUDIENCE
              value: "mcp"
            - name: ATHENZ_REQUIRED_SCOPE
              value: "mcp:role.mcp-accessor"
            - name: MCP_PUBLIC_OPENAPI_ENABLED
              value: "true"
            - name: MCP_TOOL_SCOPES
              value: '{"get_k8s_docs":"api:role.docs-getter","post_k8s_doc":"api:role.docs-poster","delete_k8s_doc":"api:role.docs-deleter"}'
          ports:
            - containerPort: 8082
          readinessProbe:
            httpGet:
              path: /readyz
              port: 8082
          livenessProbe:
            httpGet:
              path: /healthz
              port: 8082
EOF
)"
```

```sh
# deployment.apps/mcp patched
```

두 컨테이너는 Pod의 네트워크를 공유합니다. Runtime Proxy는 `8082`에서 요청을 받고, 기본 루프백 주소인 `http://127.0.0.1:8080`으로 MCP 애플리케이션에 접근합니다.

프록시는 시작할 때 `/var/run/athenz/ca.crt`를 읽습니다. 다음 단계에서 CA를 마운트하기 전까지 컨테이너가 종료와 재시작을 반복합니다. CA를 마운트한 뒤 준비 상태를 확인해 주세요.

<a id="create-and-attach-the-ca-secret"></a>

### CA Secret 생성 및 연결

기존 Athenz CA 인증서가 담긴 Secret을 만듭니다. Runtime Proxy는 액세스 토큰 검증에 필요한 서명 키를 불러올 때 이 CA로 ZTS를 신뢰합니다:

```sh
kubectl -n mcp create secret generic mcp-runtime-proxy-athenz-ca \
  --from-file=ca.crt=./athenz_dist/certs/ca.cert.pem \
  --dry-run=client -o yaml | kubectl apply -f -
```

```sh
# secret/mcp-runtime-proxy-athenz-ca created
```

Runtime Proxy에 CA Secret을 마운트합니다:

```sh
kubectl patch deploy mcp -n mcp --patch "$(cat <<'EOF'
spec:
  template:
    spec:
      containers:
        - name: auth-proxy
          volumeMounts:
            - name: athenz-ca-secret
              mountPath: /var/run/athenz
              readOnly: true
      volumes:
        - name: athenz-ca-secret
          secret:
            secretName: mcp-runtime-proxy-athenz-ca
EOF
)"
```

```sh
# deployment.apps/mcp patched
```

이제 프록시가 시작될 수 있습니다. readiness probe는 MCP 초기화를 확인합니다. 도구 목록과 OpenAPI 명세 조회는 계속 인증 없이 가능합니다.

<a id="route-requests-through-the-proxy"></a>

### 요청을 프록시로 전달

두 컨테이너가 준비될 때까지 기다립니다:

```sh
kubectl rollout status deploy/mcp -n mcp
```

```sh
# deployment "mcp" successfully rolled out
```

Service의 외부 포트 `8081`은 유지하면서 요청을 Runtime Proxy의 `8082` 포트로 전달하도록 변경합니다:

```sh
kubectl patch svc mcp -n mcp --patch '{"spec":{"ports":[{"port":8081,"targetPort":8082}]}}'
```

```sh
# service/mcp patched
```

변경 후 `./tools/keep-k8s-port-forward.sh`를 다시 시작해 로컬 연결이 프록시를 향하도록 합니다.

<a id="verify-mcp-access-is-rejected"></a>

## MCP 접근 거부 확인

프록시를 배치했으므로 이전 장의 설정을 그대로 사용해 Codex에 문서 조회를 다시 요청합니다:

```sh
Get docs with id-jag-the-hard-way-mcp
```

Codex에 **Authentication required**가 표시되어야 합니다:

![get_k8s_docs가 거부되어 Authentication required를 표시하는 Codex](../codex/assets/10_codex_get_k8s_docs_authentication_required.png)

Codex는 계속 연결하고 도구 목록을 조회할 수 있지만, Runtime Proxy는 이 도구 호출을 거부합니다. 이전 장의 토큰은 수신 대상(audience)이 `api`이지만, 프록시는 `mcp`를 요구하기 때문입니다. 만료되지 않은 API 토큰도 이 검사에서 거부됩니다. 다음 단계에서는 audience가 `mcp`인 토큰을 발급받습니다.

Codex의 인증 메시지가 발생한 이유를 프록시 로그에서 확인합니다:

```sh
kubectl logs deploy/mcp -n mcp -c auth-proxy --tail=2
```

만료되지 않은 API용 액세스 토큰을 보냈을 때, 변경된 프록시의 출력 예시입니다:

```sh
# 2026-XX-XXT03:20:11.552Z → INFO  [mcp-runtime-proxy] [request] request received | requestId=434926ee-eba7-4770-aca3-6a292410b19c method=POST path=/mcp accessTokenPresent=true
# 2026-XX-XXT03:20:11.583Z ! WARN  [mcp-runtime-proxy] [auth] access denied | requestId=434926ee-eba7-4770-aca3-6a292410b19c method=POST path=/mcp accessTokenPresent=true code=invalid_access_token durationMs=31 message="The Athenz access token is invalid or expired." status=401 expectedAudience=mcp requiredScope=mcp:role.mcp-accessor keyId=athenz-zts-server-example signatureVerified=true expiresAt=2026-XX-XXT04:20:11.000Z expiresInSeconds=3600 audiences=["api"] reason=audience_mismatch
```

`reason=audience_mismatch`, `expectedAudience=mcp`, `audiences=["api"]`를 통해 어느 검사에서 실패했는지 알 수 있습니다. `signatureVerified=true`와 양수인 `expiresInSeconds`는 서명과 만료 검사를 통과했다는 뜻입니다.

`invalid_access_token`은 클라이언트에 반환하는 오류 코드입니다. 토큰이 만료되었다면 로그에 `reason=token_expired`, `expiresAt`, 0 이하인 `expiresInSeconds`가 기록됩니다. 만료 검사는 audience 검사보다 먼저 수행합니다. Codex가 Bearer 토큰을 보내지 않았다면 `accessTokenPresent=false`, `code=missing_access_token`, `reason=missing_authorization`이 기록되며 이 경우에도 `status=401`입니다. 이러한 요청은 MCP 애플리케이션에 도달하기 전에 프록시에서 차단됩니다.

![Runtime Proxy가 AI 에이전트에 401을 반환하고 MCP 서버와 API는 호출되지 않는 흐름](../assets/core_10_mcp_rejected.svg)

<a id="grant-the-learner-mcp-access"></a>

## 실습자에게 MCP 접근 권한 부여

`mcp` 도메인을 만듭니다:

```sh
./tools/athenz/create-tld.sh "mcp"
```

MCP 접근 역할을 만듭니다:

```sh
./tools/athenz/create-role.sh "mcp" "mcp-accessor"
```

실습자를 해당 역할에 추가합니다:

```sh
./tools/athenz/add-role-member.sh "mcp" "mcp-accessor" "human.idjag-learner"
```

audience를 MCP로 명시하고 MCP와 API 스코프를 함께 요청합니다:

```sh
_scope="mcp:role.mcp-accessor api:role.docs-getter"
_my_access_token=$(./tools/athenz/fetch-access-token.sh \
  "./keys/idjag-learner.crt" \
  "./keys/idjag-learner.key" \
  "${_scope}" \
  "./keys/idjag-learner.jwt" \
  --audience mcp)
```

출력 예시:

```text
  ·  Fetching Access Token for scope: mcp:role.mcp-accessor api:role.docs-getter...
  ✔  Access token issued for scope: mcp:role.mcp-accessor api:role.docs-getter
{
  "kid": "athenz-zts-server-5fcdbc67f4-lwctf",
  "typ": "at+jwt",
  "alg": "RS256"
}
{
  "sub": "human.idjag-learner",
  "scp": [
    "api:role.docs-getter",
    "mcp-accessor"
  ],
  "ver": 1,
  "iss": "athenz-zts-server-5fcdbc67f4-lwctf",
  "client_id": "human.idjag-learner",
  "aud": "mcp",
  "uid": "human.idjag-learner",
  "auth_time": 1790138556,
  "scope": "api:role.docs-getter mcp-accessor",
  "cnf": {
    "x5t#S256": "X-pSh5Xo4sMnl9vvbPkUtcJCgOPHdfsBG1PGzecYoIg"
  },
  "exp": 1790142156,
  "iat": 1790138556,
  "jti": "0e87ef54-6233-4540-9452-77608bd02556"
}
```

MCP 역할은 도구 실행 권한을, API 역할은 문서 조회 권한을 나타냅니다. 이 토큰은 MCP에 전달하기 위해 발급한 토큰입니다.

<a id="update-codex-with-the-mcp-token"></a>

## Codex에 MCP 토큰 적용

이전 단계에서 발급받은 MCP용 액세스 토큰으로 `.codex/config.toml`을 업데이트합니다. `_my_access_token`을 발급받은 셸에서 아래 블록을 실행합니다. 토큰이 만료되었다면 먼저 토큰 발급 명령을 다시 실행해 주세요.

09장의 튜토리얼 설정을 사용 중이라면 아래 블록을 실행합니다. 다른 설정을 추가했다면 파일 전체를 바꾸지 말고 해당 서버의 `http_headers` 항목만 수정해 주세요:

```sh
_mcp_port=$(./tools/port.sh mcp)

cat > .codex/config.toml <<EOF
[mcp_servers.id-jag-the-hard-way-mcp]
url = "http://localhost:${_mcp_port}/mcp"
http_headers = { Authorization = "Bearer ${_my_access_token}" }
EOF
cat .codex/settings.toml >> .codex/config.toml
```

현재 Codex 세션을 종료합니다:

```text
/quit
```

프로젝트 디렉터리에서 Codex를 다시 실행하고 대화를 이어가 새 토큰을 불러오도록 합니다:

```sh
codex resume --last
```

<a id="verify-token-exchange-is-required"></a>
<a id="verify-the-service-certificate-is-required"></a>

<a id="verify-mcp-access-is-accepted"></a>

## MCP 접근 허용 확인

Codex에 문서 조회를 다시 요청합니다:

```sh
Get docs with id-jag-the-hard-way-mcp
```

이 단계에서는 문서 조회가 아직 실패합니다. 프록시 로그에서 MCP 접근 검사를 통과했는지 확인합니다:

```sh
kubectl logs deploy/mcp -n mcp -c auth-proxy --tail=3
```

다음과 같은 항목을 찾습니다:

```sh
# 2026-XX-XXT07:05:21.312Z ✓ INFO  [mcp-runtime-proxy] [auth] access token verified | requestId=eb1c16b4-6ec0-445f-905d-7baa32cb4952 method=POST path=/mcp audiences=["mcp"] clientId=human.idjag-learner expiresAt=2026-XX-XXT08:04:16.000Z expiresInSeconds=3535 keyId=athenz-zts-server-example scopes=["api:role.docs-getter","mcp-accessor"] subject=human.idjag-learner userId=human.idjag-learner
```

`access token verified`는 MCP 접근 검사를 통과했다는 뜻입니다. 뒤이어 발생하는 `502 downstream_token_exchange_unavailable`은 이 단계에서 예상되는 오류이며, 11장에서 해결합니다.

<a id="next-steps"></a>

## 다음 단계

다음 장에서는 MCP가 보호된 API에서 문서를 조회할 수 있도록 토큰 교환 (Token Exchange)을 설정합니다.

다음: [토큰 교환 — Codex](./11-token-exchange.md)
