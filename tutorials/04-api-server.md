|                     Previous                     |    Current     |                         Next                         |
|:------------------------------------------------:|:--------------:|:----------------------------------------------------:|
| [Kubernetes Cluster](./03-kubernetes-cluster.md) | **API Server** | [Authorization Server](./05-authorization-server.md) |

# API Server

In this tutorial, we will deploy a simple document API, check that it is running, and confirm that requests without an Access Token are rejected by following these steps:

<!-- TOC depthFrom:2 depthTo:2 -->

- [Create a namespace `api` in kubernetes](#create-a-namespace-api-in-kubernetes)
- [Deploy a simple API server to the kubernetes](#deploy-a-simple-api-server-to-the-kubernetes)
- [Send a Request to the API Server](#send-a-request-to-the-api-server)
- [Learn About the API](#learn-about-the-api)
- [Verify Access Token Enforcement](#verify-access-token-enforcement)
- [Learn what's happened](#learn-whats-happened)
- [Learn what's next](#learn-whats-next)

<!-- /TOC -->

## Create a namespace `api` in kubernetes

```sh
kubectl create ns api
```

```sh
# namespace/api created
```

## Deploy a simple API server to the kubernetes

```sh
kubectl create deploy api-server -n api \
  --image=ghcr.io/mlajkim/idthw-demo-api:latest
```


Create a simple service for the deploy above:

```sh
kubectl expose deploy api-server -n api --port 8080 --name api-server
```

```sh
# service/api-server exposed
```

## Send a Request to the API Server

Wait for the deployment to be ready:

```sh
kubectl rollout status deploy/api-server -n api
```

```sh
# deployment "api-server" successfully rolled out
```

Check the public health endpoint. The image includes Node.js, so we can use its built-in `fetch`:

```sh
kubectl exec deploy/api-server -n api \
  -- node -e 'fetch("http://localhost:8080/healthz").then(async r => console.log(await r.text()))' | jq
```

```sh
# { "ok": true }
```

## Learn About the API

This API server is intentionally simple.

It does not use a database. Instead, documents are stored in memory. If you restart the API server, the stored data will be reset to the default dummy documents.

This makes the server easy to run, easy to reset, and useful for learning how authorization changes the behavior of an API.

## Verify Access Token Enforcement

In an enterprise environment, you usually do not want to expose an API server without authentication or authorization, even if the server is only reachable internally.

The new API requires a valid Access Token and the appropriate scope for every document operation. Send a request to list documents without a token — this will intentionally return an error:

```sh
kubectl exec deploy/api-server -n api \
  -- node -e 'fetch("http://localhost:8080/api/docs").then(async r => console.log(await r.text()))' | jq
```

```sh
# {
#   "error": "missing_access_token",
#   "message": "Pass an Athenz access token as Authorization: Bearer <token>."
# }
```

The `401 Unauthorized` response is expected.

The API starts with token enforcement enabled. It does not need ZPU or downloaded policy files.

## Learn what's happened

The document request is rejected because it has no Access Token:

![04_arc_get_docs_from_api_server_unauthorized](./assets/04_arc_get_docs_from_api_server_unauthorized.png)

## Learn what's next

So, how do we get past this Unauthorized error? We need a trusted authorization server.

In the next tutorial, we will introduce [Athenz](https://github.com/AthenZ/athenz)—a [CNCF Sandbox project](https://www.cncf.io/projects/athenz/) battle-tested by tech giants like [Yahoo Inc.](https://www.yahooinc.com/) in the United States, [LY Corporation](https://www.lycorp.co.jp/en/) in Japan, and [Vespa.ai](https://vespa.ai/) in Europe. We’ll deploy it locally, mint our own valid Access Token, and finally unlock our protected API server.

Next: [Authorization Server](./05-authorization-server.md)
