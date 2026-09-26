| 이전 | 현재 | 다음 |
|:---:|:---:|:---:|
| [리소스 서버](./04-resource-server.md) | **인가 서버** | [액세스 토큰](./06-access-token.md) |

<a id="authorization-server"></a>

# 인가 서버 (Authorization Server)

이번 장에서는 Athenz를 로컬 인가 서버로 배포합니다. 이어서 `mcp`와 `api` 도메인의 스코프 (Scope)를 함께 사용할 수 있도록 설정하고 동작을 확인합니다.

<!-- TOC depthFrom:2 depthTo:2 -->

- [Athenz 서버 배포](#deploy-athenz-server)
- [여러 도메인의 스코프 허용](#enable-scopes-across-multiple-domains)
- [Athenz 배포 확인](#verify-the-athenz-deployment)
- [로컬에서 주요 엔드포인트에 접근하기](#keep-core-endpoints-locally-reachable)
- [Athenz UI 열기](#open-athenz-ui)

<!-- /TOC -->

<a id="deploy-athenz-server"></a>

## Athenz 서버 배포

다음 명령을 실행합니다:

```sh
git submodule update --init --recursive
make -C athenz_dist clean-kubernetes-athenz deploy-kubernetes-athenz
```

```sh
# ...
# namespace/athenz unchanged
# configmap/athenz-ui-config created
# secret/athenz-admin-keys configured
# secret/athenz-ui-keys created
# service/athenz-ui created
# deployment.apps/athenz-ui created
```

> [!NOTE]
> 배포에 관한 자세한 내용은 [Athenz 배포 안내](https://github.com/athenz-community/athenz-distribution/blob/main/README.md)를 참고해 주세요.

<a id="enable-scopes-across-two-domains"></a>

<a id="enable-scopes-across-multiple-domains"></a>

## 여러 도메인의 스코프 허용

이 튜토리얼에서 사용하는 `mcp`와 `api` 두 도메인의 스코프를 함께 허용하도록 ZTS를 설정합니다:

```sh
_zts_java_opts=$(kubectl -n athenz get deployment/athenz-zts-server \
  -o jsonpath='{.spec.template.spec.containers[?(@.name=="athenz-zts-server")].env[?(@.name=="JAVA_OPTS")].value}')
kubectl -n athenz set env deployment/athenz-zts-server \
  --containers=athenz-zts-server \
  "JAVA_OPTS=${_zts_java_opts} -Dathenz.zts.access_token_max_domains=10"
kubectl -n athenz rollout status deployment/athenz-zts-server
```

```sh
# deployment.apps/athenz-zts-server env updated
# Waiting for deployment "athenz-zts-server" rollout to finish: 0 out of 1 new replicas have been updated...
# Waiting for deployment "athenz-zts-server" rollout to finish: 0 of 1 updated replicas are available...
# Waiting for deployment "athenz-zts-server" rollout to finish: 0 of 1 updated replicas are available...
# deployment "athenz-zts-server" successfully rolled out
```

이 명령은 ZTS Pod의 설정을 변경합니다. 토큰의 수신 대상 (audience)은 여전히 하나입니다. 다른 도메인의 스코프에는 도메인 이름을 붙여 이후 토큰 교환 (Token Exchange)에서도 구분할 수 있도록 합니다.

<a id="check-athenz-server-running"></a>

<a id="verify-the-athenz-deployment"></a>

## Athenz 배포 확인

> [!NOTE]
> 모든 Athenz 서버가 준비되기까지 약 5~10분이 걸릴 수 있습니다.

Athenz 구성 요소가 준비될 때까지 기다립니다:

```sh
_athenz_components=(
  "athenz-db"
  "athenz-cli"
  "athenz-zms-server"
  "athenz-zts-server"
  "athenz-ui"
)

echo "Waiting for athenz servers to be ready ..."

for component in "${_athenz_components[@]}"; do
  kubectl wait -n athenz \
    --for=condition=ready pod \
    --selector=app.kubernetes.io/name=$component \
    --timeout=180s || echo "Timed out waiting for $component. Check logs manually."
done
```

```sh
# Waiting for athenz servers to be ready ...
# pod/athenz-db-0 condition met
# pod/athenz-cli-574d747dff-mfdgz condition met
# pod/athenz-zms-server-568d4cfd89-tqwwn condition met
# pod/athenz-zts-server-6966ff7f66-4j67d condition met
# pod/athenz-ui-59f7f77667-5rpf7 condition met
```

Pod가 실행 중인지 확인합니다:

```sh
kubectl get pods -n athenz
```

```sh
# NAME                                 READY   STATUS    RESTARTS   AGE
# athenz-cli-574d747dff-mfdgz          1/1     Running   0          87s
# athenz-db-0                          1/1     Running   0          88s
# athenz-ui-59f7f77667-5rpf7           2/2     Running   0          87s
# athenz-zms-server-568d4cfd89-tqwwn   1/1     Running   0          87s
# athenz-zts-server-6966ff7f66-4j67d   1/1     Running   0          87s
```

<a id="keep-core-endpoints-locally-reachable"></a>

## 로컬에서 주요 엔드포인트에 접근하기

Pod가 다시 시작되면 `kubectl port-forward` 명령이 종료될 수 있습니다. 따라서 포트 포워딩을 유지할 방법이 필요합니다.

포트 포워더를 실행합니다. 기본 포트가 이미 사용 중이면 다른 포트를 선택하도록 안내합니다.

> [!IMPORTANT]
> 이후 명령을 실행할 터미널을 남겨 두도록, 포트 포워더는 다른 터미널 탭에서 실행해 주세요.

```sh
./tools/keep-k8s-port-forward.sh
```

> [!TIP]
> 같은 터미널을 계속 사용하려면 명령 끝에 `&`를 붙여 포트 포워더를 백그라운드로 실행할 수 있습니다. 필수는 아닙니다.

<a id="open-athenz-ui"></a>

## Athenz UI 열기

Athenz UI를 엽니다:

```sh
_athenz_ui_port=$(./tools/port.sh athenz-ui)
./tools/open.sh "http://localhost:${_athenz_ui_port}"
```

![Athenz UI](../assets/05_athenz_ui.png)

다음 장에서는 API 도메인을 만들고 스코프가 지정된 액세스 토큰 (Access Token)을 요청합니다:

다음: [액세스 토큰](./06-access-token.md)
