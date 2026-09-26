| 이전 | 현재 | 다음 |
|:---:|:---:|:---:|
| [사전 준비](./02-prerequisites.md) | **Kubernetes 클러스터** | [리소스 서버 (Resource Server)](./04-resource-server.md) |

<a id="kubernetes-cluster"></a>

# Kubernetes 클러스터

로컬에 Kubernetes 클러스터를 만들고 정상적으로 실행되는지 확인합니다.

<!-- TOC depthFrom:2 depthTo:2 -->

- [로컬 Kubernetes 클러스터 생성](#create-a-local-kubernetes-cluster)
- [Kubernetes 클러스터 확인](#verify-the-kubernetes-cluster)

<!-- /TOC -->

<a id="create-local-kubernetes-cluster"></a>

<a id="create-a-local-kubernetes-cluster"></a>

## 로컬 Kubernetes 클러스터 생성

저번 장에서 설치한 kind로 로컬 클러스터를 만듭니다:

```sh
kind create cluster
```

```sh
# Creating cluster "kind" ...
#  ✓ Ensuring node image (kindest/node:v1.XX.X) 🖼 
#  ✓ Preparing nodes 📦
#  ✓ Writing configuration 📜
#  ✓ Starting control-plane 🕹️
#  ✓ Installing CNI 🔌
#  ✓ Installing StorageClass 💾
# Set kubectl context to "kind-kind"
# You can now use your cluster with:

# kubectl cluster-info --context kind-kind
```

> [!NOTE]
> 다른 설치 방법은 [kind 설치 안내](https://kind.sigs.k8s.io/docs/user/quick-start/#installation)를 참고해 주세요.

<a id="verify-the-kubernetes-cluster"></a>

## Kubernetes 클러스터 확인

현재 kubectl 컨텍스트가 가리키는 클러스터를 확인합니다:

```sh
kubectl cluster-info
```

```sh
# Kubernetes control plane is running at https://127.0.0.1:53988
# CoreDNS is running at https://127.0.0.1:53988/api/v1/namespaces/kube-system/services/kube-dns:dns/proxy

# To further debug and diagnose cluster problems, use 'kubectl cluster-info dump'.
```

네임스페이스 목록을 확인합니다:

```sh
kubectl get ns
```

```sh
# NAME                 STATUS   AGE
# default              Active   14s
# kube-node-lease      Active   14s
# kube-public          Active   14s
# kube-system          Active   14s
# local-path-storage   Active   15s
```

Kubernetes 클러스터가 실행 중입니다. 다음 장에서는 문서 API를 배포하고 접근할 수 있는지 확인합니다.

다음: [리소스 서버 (Resource Server)](./04-resource-server.md)
