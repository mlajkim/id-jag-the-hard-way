|                Previous                |        Current         |               Next               |
|:--------------------------------------:|:----------------------:|:--------------------------------:|
| [Prerequisites](./02-prerequisites.md) | **Kubernetes Cluster** | [API Server](./04-api-server.md) |

# Kubernetes Cluster

Create and verify a local Kubernetes cluster with the following steps:

<!-- TOC depthFrom:2 depthTo:2 -->

- [Create a Local Kubernetes Cluster](#create-a-local-kubernetes-cluster)
- [Verify the Kubernetes Cluster](#verify-the-kubernetes-cluster)

<!-- /TOC -->

<a id="create-local-kubernetes-cluster"></a>

## Create a Local Kubernetes Cluster

Use kind, installed in the previous chapter, to create the local cluster:

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
> For other installation methods, see the [kind installation guide](https://kind.sigs.k8s.io/docs/user/quick-start/#installation).

## Verify the Kubernetes Cluster

Check the cluster selected by your current kubectl context:

```sh
kubectl cluster-info
```

```sh
# Kubernetes control plane is running at https://127.0.0.1:53988
# CoreDNS is running at https://127.0.0.1:53988/api/v1/namespaces/kube-system/services/kube-dns:dns/proxy

# To further debug and diagnose cluster problems, use 'kubectl cluster-info dump'.
```

List the available namespaces:

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

Next: [API Server](./04-api-server.md)
