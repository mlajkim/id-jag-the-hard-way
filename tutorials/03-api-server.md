|                    Previous                    |    Current     | Next |
|:----------------------------------------------:|:--------------:|:----:|
| [Working Directory](./02-working-directory.md) | **API Server** | N/A  |

# API Server

In this tutorial, we will set up a simple API server that serves a small HTTP API that stores simple documentations.

## Clone API Server provided by Athenz Community

If git:

```sh
git clone git@github.com:athenz-community/java-provider-server-manifest.git oss_sample_java_api_server
```

Or HTTPS:

```sh
git clone https://github.com/athenz-community/java-provider-server-manifest.git oss_sample_java_api_server
```


## Run API Server Locally

> [!NOTE]
> You may use different API server port by changing the `_api_server_port` variable, but we highly recommend to use the port that we use in this tutorial to avoid any confusion.

Let's run the API server locally.

```sh
_api_server_port=14442
make -C oss_sample_java_api_server local PORT=$_api_server_port AT_REQUIRED=false

# ...
# 🚀 Server started on port 14442 (Athenz Required: false)
```

## Send a request to API Server

If you run the following code, you will get something similar to what is shown below:

```sh
curl localhost:$_api_server_port/api/docs | jq .

# {
#   "docs": [
#     {
#       "name": "first default doc",
#       "id": 1,
#       "content": "hello world"
#     },
#     {
#       "name": "second default doc",
#       "id": 2,
#       "content": "how are you?"
#     }
#   ]
# }
```

## Learn about the API

This API server is intentionally simple. It does not use a DB for storing the data, but instead stored in memory. If you restart your API server again, it will reset to the default dummy document datas stored.

## Protect the API Server

> [!TIP]
> You can ignore `ERROR` logs from the API server at this point.

In enterprise scale, you do not want to run your API server without any authentication, even when you run your API server internally. The API server you've just cloned has a feature to require Access Token (JWT). You can simply do this by with arg `AT_REQUIRED=true` instead of `=false`:

```sh
_new_api_server_port=14443
make -C oss_sample_java_api_server local PORT=$_new_api_server_port AT_REQUIRED=true

# ...
# 🚀 Server started on port 14443 (Athenz Required: true)
```

Then run the same command you've used against the new API server:

```sh
curl "localhost:${_new_api_server_port}/api/docs" | jq .

# {
#   "error": "Unauthorized",
#   "message": "Authorization header is missing or invalid Bearer token.",
#   "status": 401
# }
```

## How to fix Unauthorized Error

To fix the Unauthorized error, we need to provide a valid Access Token (JWT) attached to headers when we call API server. The API server by default requires Access Token fetched by authorization server, which we will use the Athenz - the CNCF's Sandbox Project for Authentication/Authorization platform used by Yahoo, Inc. in the United States, LY Corp. in Japan, and Vespa.AI in Europe. The next tutorial will guide you to locally deploy the Athenz Server as a Authorization Server for the API Server.

Next: [Authorization Server](./04-authorization-server.md)
