| 이전 | 현재 | 다음 |
|:---:|:---:|:---:|
| [토큰 교환 (Token Exchange)](./11-token-exchange.md) | **ID 제공자 (Identity Provider, IdP)** | [신뢰할 수 있는 ID 제공자 (Identity Provider, IdP)](./13-trusted-identity-provider.md) |

<a id="identity-provider--codex"></a>

# ID 제공자 (Identity Provider, IdP) — Codex

[Keycloak](https://www.keycloak.org/)을 ID 제공자로 배포합니다. 사용자는 Keycloak에 로그인하고 ID 토큰 (ID Token)을 발급받습니다.

<!-- TOC depthFrom:2 depthTo:2 -->

- [Keycloak 이미지 다운로드 및 불러오기](#keycloak-이미지-다운로드-및-불러오기)
- [Kubernetes에 Keycloak 배포](#kubernetes에-keycloak-배포)
- [브라우저에서 Keycloak 열기](#브라우저에서-keycloak-열기)
- [Keycloak 클라이언트 등록](#keycloak-클라이언트-등록)
- [실습자 계정 생성](#실습자-계정-생성)
- [토큰 유효기간 설정](#토큰-유효기간-설정)
- [결과 확인](#결과-확인)
- [다음 단계](#다음-단계)

<!-- /TOC -->

<a id="docker-pull-keycloak"></a>

<a id="load-the-keycloak-image"></a>

## Keycloak 이미지 다운로드 및 불러오기

Docker의 아키텍처(`arm64` 또는 `amd64`)에 맞는 `quay.io/keycloak/keycloak:latest` 이미지를 준비합니다. 현재 `kubectl` 컨텍스트가 kind 클러스터라면 같은 이미지 이름으로 해당 클러스터에 불러옵니다:

```sh
./scripts/keycloak/download-and-load-keycloak.sh
```

```sh
# Preparing quay.io/keycloak/keycloak:latest for linux/arm64...
# [+] Building 1.4s (5/5) FINISHED                                                                              docker:desktop-linux
# ...

# View build details: docker-desktop://dashboard/build/desktop-linux/desktop-linux/qqbttlri10dikdejvpcem98up
# Image: "quay.io/keycloak/keycloak:latest" with ID "sha256:dc0f6a6c61f4170f154b6dd89dfc160c839fd24989d2c798af2a7072498bfbac" not yet present on node "test-control-plane", loading...
# Loaded quay.io/keycloak/keycloak:latest into kind cluster test.
```

예를 들어 `kind-test` 컨텍스트에서는 `test` 클러스터에 이미지를 불러옵니다. 다른 Kubernetes 환경에서는 배포할 때 원본 이미지를 내려받습니다.

<a id="deploy-keycloak-in-k8s"></a>

## Kubernetes에 Keycloak 배포

`idp` 네임스페이스를 만듭니다:

```sh
kubectl create ns idp
```

```sh
# namespace/idp created
```

모든 환경에서 같은 이미지 이름으로 Keycloak을 배포합니다:

```sh
kubectl create deployment keycloak --image=quay.io/keycloak/keycloak:latest -n idp
```

```sh
# deployment.apps/keycloak created
```

관리자 로그인 정보를 설정하고 개발 모드로 시작합니다. `imagePullPolicy: IfNotPresent`도 설정해 kind에 불러온 이미지를 사용하도록 합니다. 이 설정이 없으면 `latest` 태그의 기본 정책인 `Always`가 적용되어 이미지가 있어도 레지스트리에 접속합니다:

```sh
_keycloak_admin=$(./tools/config.sh keycloak admin)
_keycloak_admin_password=$(./tools/config.sh keycloak admin-password)

kubectl patch deploy keycloak -n idp --patch "$(cat <<EOF
spec:
  template:
    spec:
      containers:
        - name: keycloak
          imagePullPolicy: IfNotPresent
          args:
            - start-dev
          env:
            - name: KEYCLOAK_ADMIN
              value: "${_keycloak_admin}"
            - name: KEYCLOAK_ADMIN_PASSWORD
              value: "${_keycloak_admin_password}"
EOF
)"
```

```sh
# deployment.apps/keycloak patched
```

Pod가 다시 시작되어도 Keycloak 데이터가 유지되도록 PVC를 만듭니다:

```sh
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: keycloak-data-pvc
  namespace: idp
spec:
  accessModes: [ "ReadWriteOnce" ]
  resources:
    requests:
      storage: 1Gi
EOF
```

```sh
# persistentvolumeclaim/keycloak-data-pvc created
```

PVC를 마운트합니다:

```sh
kubectl patch deploy keycloak -n idp --patch "$(cat <<'EOF'
spec:
  template:
    spec:
      containers:
        - name: keycloak
          volumeMounts:
            - name: keycloak-data
              mountPath: /opt/keycloak/data
      volumes:
        - name: keycloak-data
          persistentVolumeClaim:
            claimName: keycloak-data-pvc
EOF
)"
```

```sh
# deployment.apps/keycloak patched
```

Deployment에 접근할 수 있도록 Service를 만듭니다:

```sh
kubectl expose deployment keycloak --port=8080 -n idp
```

```sh
# service/keycloak exposed
```

<a id="open-keycloak-on-browser"></a>

<a id="open-keycloak-in-your-browser"></a>

## 브라우저에서 Keycloak 열기

Pod가 준비될 때까지 기다립니다:

```sh
kubectl wait -n idp \
  --for=condition=ready pod \
  --selector=app=keycloak \
  --timeout=180s
```

```sh
# pod/keycloak-<pod-suffix> condition met
```

브라우저에서 Keycloak을 엽니다(사용자 이름: `admin`, 비밀번호: `admin`):

```sh
_keycloak_port=$(./tools/port.sh keycloak)
./tools/open.sh "http://localhost:${_keycloak_port}"
```

![실행 중인 Keycloak](../assets/13_keycloak_running.png)

<a id="setup-client"></a>

<a id="register-the-keycloak-client"></a>

## Keycloak 클라이언트 등록

Keycloak의 **Client**는 사용자를 대신해 인증 (Authentication)을 요청하는 애플리케이션을 나타냅니다. 여기서는 기본 `master` realm을 사용합니다.

Keycloak에 AI 클라이언트(`human.idjag-learner.codex`)를 등록합니다:

```sh
_acg_port=$(./tools/port.sh ai-client-gateway-codex)
./tools/keycloak/create-client.sh \
  human.idjag-learner.codex \
  "http://localhost:${_acg_port}/oauth/callback" \
  "http://localhost:${_acg_port}"
```

![Keycloak에 등록된 클라이언트](../assets/13_keycloak_client_added.png)

<a id="setup-user"></a>

<a id="create-the-learner-account"></a>

## 실습자 계정 생성

실습자를 나타내는 사용자 계정을 만듭니다:

```sh
OPEN_UI=true ./tools/keycloak/create-user.sh \
  idjag-learner \
  idjag-learner@athenz.io \
  ID-JAG \
  Learner
```

<a id="setup-id_token-expiration"></a>

<a id="configure-the-token-lifespan"></a>

## 토큰 유효기간 설정

> [!TIP]
> 이 실습에서는 realm의 토큰 유효기간을 4시간으로 설정합니다. 실습용 스크립트는 Keycloak의 `accessTokenLifespan` 설정을 변경합니다. 학습 환경 밖에서는 보안 요구 사항에 맞는 유효기간을 선택해 주세요.

```sh
./tools/keycloak/set-token-lifespan.sh 14400
```

```sh
#   ·  Fetching Keycloak admin token...
#   ·  Setting access token lifespan to 14400s in realm master...
#   ✔  Access token lifespan set to 14400s (4h)
#   ✔  Opened: http://localhost:34443/admin/master/console/#/master/realm-settings/tokens
```

![설정된 액세스 토큰 유효기간](../assets/13_access_token_lifespan_set.png)

<a id="whats-done"></a>

<a id="review-the-result"></a>

## 결과 확인

Keycloak을 배포하고 다음 항목을 만들었습니다:

- AI 클라이언트(Codex CLI)를 나타내는 클라이언트 `human.idjag-learner.codex`
- API 접근을 요청하는 사람을 나타내는 사용자 `idjag-learner`

<a id="whats-next"></a>

<a id="next-steps"></a>

## 다음 단계

Keycloak이 준비되었지만 Athenz는 아직 Keycloak의 ID 토큰을 신뢰하지 않습니다. 다음 장에서는 Athenz가 이 토큰을 받아들이고 검증하도록 설정합니다.

다음: [신뢰할 수 있는 ID 제공자 (Identity Provider, IdP)](./13-trusted-identity-provider.md)
