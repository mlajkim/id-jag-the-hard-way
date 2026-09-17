|                     Previous                     |    Current     |                         Next                         |
|:------------------------------------------------:|:--------------:|:----------------------------------------------------:|
| [Kubernetes Cluster](./03-kubernetes-cluster.md) | **API Server** | [Authorization Server](./05-authorization-server.md) |

# API Server

Deploy a simple document API and retrieve documents without an access token. We will enable token enforcement later.

<!-- TOC depthFrom:2 depthTo:2 -->

- [Create the API Namespace](#create-the-api-namespace)
- [Deploy the API Server](#deploy-the-api-server)
- [Send a Request to the API Server](#send-a-request-to-the-api-server)
- [Learn About the API](#learn-about-the-api)
- [Access Token Mode](#access-token-mode)
- [Understand the Result](#understand-the-result)
- [Next Steps](#next-steps)

<!-- /TOC -->

<a id="create-a-namespace-api-in-kubernetes"></a>

## Create the API Namespace

```sh
kubectl create ns api
```

```sh
# namespace/api created
```

<a id="deploy-a-simple-api-server-to-the-kubernetes"></a>

## Deploy the API Server

```sh
kubectl create deploy api-server -n api \
  --image=ghcr.io/mlajkim/idthw-demo-api:latest
kubectl set env deploy/api-server -n api ACCESS_TOKEN_ENABLED=false
```


Expose the Deployment through a Kubernetes Service:

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

Request documents without an access token:

```sh
kubectl exec deploy/api-server -n api \
  -- node -e 'fetch("http://localhost:8080/api/docs").then(async r => console.log(await r.text()))' | jq
```

```sh
# {
#   "docs": [
#     { "id": 1, "name": "first default doc", "content": "hello world" },
#     { "id": 2, "name": "second default doc", "content": "how are you?" }
#   ]
# }
```

The API returns `200 OK` because access-token enforcement is disabled.

## Learn About the API

This API server is intentionally simple.

It does not use a database. Instead, documents are stored in memory. If you restart the API server, the stored data will be reset to the default dummy documents.

This makes the server easy to run, easy to reset, and useful for learning how authorization changes the behavior of an API.

<a id="verify-access-token-enforcement"></a>

## Access Token Mode

`ACCESS_TOKEN_ENABLED` controls access-token enforcement:

- `false` (default): document requests work without a token.
- `true`: each document request requires a valid Athenz access token and the scope for that operation.

Keep it `false` for now. [Chapter 06](./06-athenz-access-token.md#enable-access-token-enforcement) shows how to configure trust and switch it to `true`.

<a id="learn-whats-happened"></a>

## Understand the Result

The API returns documents without an access token:

![Human requests documents from the API with token enforcement disabled](./assets/core_04_open_api.svg)

<a id="learn-whats-next"></a>

## Next Steps

Next, deploy [Athenz](https://github.com/AthenZ/athenz). In chapter 06, you will enable access-token enforcement and use an Athenz token to call the API.

Next: [Authorization Server](./05-authorization-server.md)
