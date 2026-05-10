|             Previous             |         Current          | Next |
|:--------------------------------:|:------------------------:|:----:|
| [API Server](./03-api-server.md) | **Authorization Server** | n/a  |

# Authorization Server


## Create Local Kubernetes Cluster

> [!NOTE]
> The SSOT guide for download/install kind is [here](https://kind.sigs.k8s.io/)

You can use any kubernetes cluster pretty much, but to simplify the step, we will use **Kind** (Kubernetes in Docker).

```sh
go install sigs.k8s.io/kind@latest
kind create cluster
```



## Deploy Athenz Server

Athenz Community offers 