|                      Previous                      |        Current         |             Next             |
|:--------------------------------------------------:|:----------------------:|:----------------------------:|
| [Granular Permission](./07-granular-permission.md) | **MCP Server for API** | [AI Agent](./09-ai-agent.md) |

# MCP Server for API

Deploy an MCP server that exposes the document API as tools for an AI client with the following steps:

<!-- TOC depthFrom:2 depthTo:2 -->

- [Create the MCP Service Identity](#create-the-mcp-service-identity)
- [Create a Kubernetes Secret](#create-a-kubernetes-secret)
- [Deploy the MCP Server](#deploy-the-mcp-server)
- [Mount the Secret](#mount-the-secret)
- [Review the Result](#review-the-result)
- [Next Steps](#next-steps)

<!-- /TOC -->

<a id="create-service-cert-for-mcp-server"></a>

## Create the MCP Service Identity

The MCP server needs its own identity to authenticate token exchange requests to ZTS. Create the service `idthw-api-mcp` under the Athenz top-level domain (TLD) `mcp`. Its principal is `mcp.idthw-api-mcp`; the API keeps the `api` domain. Athenz domains define authorization boundaries independently of Kubernetes namespaces, so both deployments can remain in the `api` namespace.

Run the following:

```sh
./tools/athenz/create-tld.sh "mcp"
./tools/athenz/create-private-key.sh "./keys/api-mcp"
./tools/athenz/create-service.sh "mcp" "idthw-api-mcp" "./keys/api-mcp.public.key"
./tools/athenz/enable-cert-provider.sh "mcp" "idthw-api-mcp"
./tools/athenz/fetch-cert.sh "mcp" "idthw-api-mcp" "./keys/api-mcp.key" "v1"
```

```sh
#   ·  Generating RSA key pair for: ./keys/api-mcp...
#   ✔  Keys generated: ./keys/api-mcp.key, ./keys/api-mcp.public.key
#   ·  Registering Service: mcp.idthw-api-mcp...
#   ✔  Service registered: mcp.idthw-api-mcp
#   ·  Enabling ZTS Certificate Provider for mcp.idthw-api-mcp...
# [Template(s) successfully applied to domain]
#   ✔  ZTS Certificate Provider enabled for mcp.idthw-api-mcp
#   ·  Fetching X.509 Certificate for mcp.idthw-api-mcp...
#   ✔  Certificate saved to: ./keys/api-mcp.crt
```

<a id="create-k8s-secret"></a>

## Create a Kubernetes Secret

Create a secret based on the generated certificates:

```sh
kubectl -n api delete secret api-mcp-cert --ignore-not-found
kubectl -n api create secret generic api-mcp-cert \
  --from-file=api-mcp.crt=./keys/api-mcp.crt \
  --from-file=api-mcp.key=./keys/api-mcp.key \
  --from-file=ca.crt=./athenz_dist/certs/ca.cert.pem
```

```sh
# secret/api-mcp-cert created
```

## Deploy the MCP Server

Deploy the MCP Server in the `api` namespace:

```sh
kubectl create deploy mcp -n api \
  --image=ghcr.io/mlajkim/mcp:latest
```

```sh
# deployment.apps/mcp created
```

Expose the deployment:

```sh
kubectl expose deploy mcp -n api --port 8081 --name mcp
```

```sh
# service/mcp exposed
```

Wait for the container to be ready:

```sh
kubectl rollout status deploy/mcp -n api
```

```sh
# Waiting for deployment "mcp" rollout to finish: 0 of 1 updated replicas are available...
# deployment "mcp" successfully rolled out
```

> [!NOTE]
> If you see the following error, the container is still starting up. Wait a few seconds and try again.
>
> ```text
> Error from server (BadRequest): container "mcp" in pod is waiting to start: ContainerCreating
> ```

<a id="mount-secret"></a>

## Mount the Secret

Mount the cert secret into the MCP container:

```sh
kubectl patch deploy mcp -n api --patch "$(cat <<'EOF'
spec:
  template:
    spec:
      containers:
        - name: mcp
          env:
            - name: UPSTREAM_BASE_URL
              value: "http://api-server.api:8080"
            - name: PUBLIC_BASE_URL
              value: "http://mcp.api:8081"
            - name: ACCESS_MCP_REQUIRED_SCOPE
              value: "mcp:role.mcp-accessor"
            - name: MCP_CERT_DIR
              value: "/app/certs"
            - name: ATHENZ_CERT_PATH
              value: "/app/certs/api-mcp.crt"
            - name: ATHENZ_KEY_PATH
              value: "/app/certs/api-mcp.key"
            - name: ATHENZ_CA_PATH
              value: "/app/certs/ca.crt"
          volumeMounts:
            - name: mcp-certs
              mountPath: /app/certs
              readOnly: true
      volumes:
        - name: mcp-certs
          secret:
            secretName: api-mcp-cert
EOF
)"
```

```sh
# deployment.apps/mcp patched
```

Wait for the rollout to complete:

```sh
kubectl rollout status deploy/mcp -n api
```

```sh
# deployment "mcp" successfully rolled out
```

Verify:

```sh
kubectl logs deploy/mcp -n api
```

```sh
# OpenAPI MCP Server for API listening on: http://mcp.api:8081
# Upstream API: http://api-server.api:8080
# OpenAPI Spec available at: http://mcp.api:8081/openapi.json
# MCP endpoint available at: http://mcp.api:8081/mcp
```

<a id="whats-done"></a>

## Review the Result

We have created a running MCP Server for API with service identity `mcp.idthw-api-mcp`. Its OpenAPI metadata advertises `mcp:role.mcp-accessor` together with the `api` role required by each tool.

![MCP adapter calls the API with an exchanged access token](./assets/core_08_mcp_api.svg)

<a id="whats-next"></a>

## Next Steps

Next: [AI Agent](./09-ai-agent.md)
