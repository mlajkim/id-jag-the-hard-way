|             Previous             |         Current          |               Next               |
|:--------------------------------:|:------------------------:|:--------------------------------:|
| [API Server](./04-api-server.md) | **Authorization Server** | [Athenz access token](./07-athenz-access-token.md) |

# Authorization Server

In this tutorial, we will deploy Athenz as the local authorization server, enable scopes across the `mcp` and `api` domains, and verify it with the following steps:

<!-- TOC depthFrom:2 depthTo:2 -->

- [Deploy Athenz Server](#deploy-athenz-server)
- [Enable Scopes Across Multiple Domains](#enable-scopes-across-multiple-domains)
- [Verify the Athenz Deployment](#verify-the-athenz-deployment)
- [Keep Core Endpoints Locally Reachable](#keep-core-endpoints-locally-reachable)
- [Open Athenz UI](#open-athenz-ui)

<!-- /TOC -->

## Deploy Athenz Server

Run the following command:

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
> For deployment details, see the [Athenz distribution guide](https://github.com/athenz-community/athenz-distribution/blob/main/README.md).

<a id="enable-scopes-across-two-domains"></a>

## Enable Scopes Across Multiple Domains

Configure ZTS to allow scopes from both domains used by this tutorial, `mcp` and `api`:

```sh
_zts_java_opts=$(kubectl -n athenz get deployment/athenz-zts-server \
  -o jsonpath='{.spec.template.spec.containers[?(@.name=="athenz-zts-server")].env[?(@.name=="JAVA_OPTS")].value}')
kubectl -n athenz set env deployment/athenz-zts-server \
  --containers=athenz-zts-server \
  "JAVA_OPTS=${_zts_java_opts} -Dathenz.zts.access_token_max_domains=10"
kubectl -n athenz rollout status deployment/athenz-zts-server
```

This updates the ZTS pod configuration. Each access token will still have one audience; scopes from the other domain remain fully qualified for the next token exchange.

<a id="check-athenz-server-running"></a>

## Verify the Athenz Deployment

> [!NOTE]
> It may take about 5–10 minutes for all Athenz servers to be fully available.

Wait for the Athenz components to become ready:

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

Verify that the pods are running:

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

## Keep Core Endpoints Locally Reachable

The `kubectl port-forward` command may stop if a pod restarts. Therefore, we need a way to keep the port-forwarding active.

Start the port-forwarder. If a default port is already in use, it will ask you to pick a different one.

> [!IMPORTANT]
> Open another terminal tab for the port-forwarder so this terminal remains available for the commands that follow.

```sh
./tools/keep-k8s-port-forward.sh
```

> [!TIP]
> Adding `&` is optional. It sends the port-forwarder to the background if you prefer to keep using the same terminal.

## Open Athenz UI

Open Athenz UI:

```sh
_athenz_ui_port=$(./tools/port.sh athenz-ui)
./tools/open.sh "http://localhost:${_athenz_ui_port}"
```

![athenz_ui](assets/05_athenz_ui.png)

In the next tutorial, we will create the API domain and request a scoped access token:

Next: [Athenz access token](./07-athenz-access-token.md)
