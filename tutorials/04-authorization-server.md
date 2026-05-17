|             Previous             |         Current          |                        Next                        |
|:--------------------------------:|:------------------------:|:--------------------------------------------------:|
| [API Server](./03-api-server.md) | **Authorization Server** | [Athenz Access Token](./05-athenz-access-token.md) |

# Authorization Server

In this tutorial, we will deploy Athenz as the local authorization server and verify that it is running properly.

## Create Local Kubernetes Cluster

You can use almost any Kubernetes cluster, but to simplify the process, we will use Kind (Kubernetes in Docker).

```sh
go install sigs.k8s.io/kind@latest
kind create cluster
```

> [!NOTE]
> The Single Source of Truth (SSOT) guide for downloading and installing Kind can be found [here](https://kind.sigs.k8s.io/)


## Deploy Athenz Server

> [!NOTE]
> Upcoming tutorials will use the `athenz_dist` directory by default, so we do not recommend customizing this name.

The Athenz Community provides a one-command manifest tool to deploy it to a Kubernetes cluster. Let's clone the repository:

```sh
git clone git@github.com:athenz-community/athenz-distribution.git athenz_dist
```

Once the repository is cloned, run the following command (this will take about 5 minutes):

```sh
make -C athenz_dist clean-kubernetes-athenz deploy-kubernetes-athenz
```

> [!NOTE]
> The SSOT guide for using the Athenz manifest is available [here](https://github.com/athenz-community/athenz-distribution/blob/main/README.md)

Once you see the following output, you can proceed to the next step:

```sh
# ...
# namespace/athenz unchanged
# configmap/athenz-ui-config created
# secret/athenz-admin-keys configured
# secret/athenz-ui-keys created
# service/athenz-ui created
# deployment.apps/athenz-ui created
```

## Check if the Athenz server is running

Execute the following to see the status of the Athenz server:

```sh
_athenz_components=(
  "athenz-db"
  "athenz-cli"
  "athenz-zms-server"
  "athenz-zts-server"
  "athenz-ui"
)

for component in "${_athenz_components[@]}"; do
  kubectl wait -n athenz \
    --for=condition=ready pod \
    --selector=app.kubernetes.io/name=$component \
    --timeout=180s || echo "Timed out waiting for $component. Check logs manually."
done
```

```sh
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

## Keep Athenz Endpoints Reachable

The `kubectl port-forward` command may stop if a pod restarts. Therefore, we need a way to keep the port-forwarding active. First of all, let's quickly create a directory `my_tools` to store the shell script:

```sh
mkdir -p my_tools
```

Now, let's create a simple shell script `keep-athenz-port-forward.sh` inside `my_tools`:

```sh
cat > my_tools/keep-athenz-port-forward.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

_zms_port="${1:-4443}"
_zts_port="${2:-8443}"
_athenz_ui_port="${3:-3000}"

_pf() {
  local name=$1
  local local_port=$2
  local remote_port=$3

  while true; do
    echo "Port-forwarding ${name}: ${local_port}:${remote_port}"
    kubectl -n athenz port-forward "deployment/${name}" "${local_port}:${remote_port}" || true
    echo "Restarting ${name} port-forward..."
    sleep 3
  done
}

_pf athenz-zms-server "${_zms_port}" 4443 &
_pf athenz-zts-server "${_zts_port}" 4443 &
_pf athenz-ui "${_athenz_ui_port}" 3000 &

wait
EOF

chmod +x my_tools/keep-athenz-port-forward.sh
```

You may customize the ports, but we recommend sticking with the defaults below:

```sh
_zms_port=4443
_zts_port=8443
_athenz_ui_port=3000

./my_tools/keep-athenz-port-forward.sh "$_zms_port" "$_zts_port" "$_athenz_ui_port"
```

## Open Athenz UI

```sh
_athenz_ui_port=3000
open "http://localhost:${_athenz_ui_port}"
```

![athenz_ui](assets/04_athenz_ui.png)

In the next tutorial, we will create an Athenz domain and roles, and then fetch an access token.

Next: [Athenz Access Token](./05-athenz-access-token.md)
