|                     Previous                     |        Current        |                              Next                              |
|:------------------------------------------------:|:---------------------:|:--------------------------------------------------------------:|
| [Token Exchange](./11-token-exchange.md) | **Identity Provider** | [Trusted Identity Provider](./13-trusted-identity-provider.md) |

# Identity Provider

Deploy [Keycloak](https://www.keycloak.org/) as an identity provider (IdP) with the following steps. Users will sign in to obtain an ID token.

<!-- TOC depthFrom:2 depthTo:2 -->

- [Load the Keycloak Image](#load-the-keycloak-image)
- [Deploy Keycloak in K8s](#deploy-keycloak-in-k8s)
- [Open Keycloak in Your Browser](#open-keycloak-in-your-browser)
- [Register the Keycloak Client](#register-the-keycloak-client)
- [Create the Learner Account](#create-the-learner-account)
- [Configure the Token Lifespan](#configure-the-token-lifespan)
- [Review the Result](#review-the-result)
- [Next Steps](#next-steps)

<!-- /TOC -->

<a id="docker-pull-keycloak"></a>

## Load the Keycloak Image

If you are using **kind**, do the following:

> [!NOTE]
> On **Apple Silicon (arm64)**, `kind load docker-image` fails with multi-platform manifest images. Build a single-platform image first:
>
> ```sh
> docker buildx build --platform linux/arm64 --load --provenance=false \
>   -t keycloak:kind-load - <<'EOF'
> FROM quay.io/keycloak/keycloak:latest
> EOF
> kind load docker-image keycloak:kind-load
> ```
>
> Then replace `quay.io/keycloak/keycloak:latest` with `keycloak:kind-load` in the `kubectl create deployment` command below.

On **amd64**, pull and load the image:

```sh
docker pull quay.io/keycloak/keycloak:latest
kind load docker-image quay.io/keycloak/keycloak:latest
```

## Deploy Keycloak in K8s

Create the `idp` namespace:

```sh
kubectl create ns idp
```

Deploy Keycloak:

```sh
kubectl create deployment keycloak --image=quay.io/keycloak/keycloak:latest -n idp
```

Set the admin credentials and start in dev mode:

```sh
_keycloak_admin=$(./tools/config.sh keycloak admin)
_keycloak_admin_password=$(./tools/config.sh keycloak admin-password)

kubectl patch deploy keycloak -n idp --patch "$(cat <<EOF
spec:
  template:
    spec:
      containers:
        - name: keycloak
          imagePullPolicy: IfNotPresent
          args:
            - start-dev
          env:
            - name: KEYCLOAK_ADMIN
              value: "${_keycloak_admin}"
            - name: KEYCLOAK_ADMIN_PASSWORD
              value: "${_keycloak_admin_password}"
EOF
)"
```

Create a PVC so Keycloak data survives pod restarts:

```sh
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: keycloak-data-pvc
  namespace: idp
spec:
  accessModes: [ "ReadWriteOnce" ]
  resources:
    requests:
      storage: 1Gi
EOF
```

Mount the PVC:

```sh
kubectl patch deploy keycloak -n idp --patch "$(cat <<'EOF'
spec:
  template:
    spec:
      containers:
        - name: keycloak
          volumeMounts:
            - name: keycloak-data
              mountPath: /opt/keycloak/data
      volumes:
        - name: keycloak-data
          persistentVolumeClaim:
            claimName: keycloak-data-pvc
EOF
)"
```

Expose the deployment:

```sh
kubectl expose deployment keycloak --port=8080 -n idp
```

<a id="open-keycloak-on-browser"></a>

## Open Keycloak in Your Browser

Wait for the pod to be ready:

```sh
kubectl wait -n idp \
  --for=condition=ready pod \
  --selector=app=keycloak \
  --timeout=180s
```

Open Keycloak in your browser (username: `admin`, password: `admin`):

```sh
_keycloak_port=$(./tools/port.sh keycloak)
./tools/open.sh "http://localhost:${_keycloak_port}"
```

![Keycloak running](./assets/13_keycloak_running.png)

<a id="setup-client"></a>

## Register the Keycloak Client

In Keycloak, a **Client** represents an application that requests authentication on behalf of a user. We use the default `master` realm.

Register the AI client (`human.idjag-learner.claude`) with Keycloak:

```sh
_acg_port=$(./tools/port.sh ai-client-gateway)
./tools/keycloak/create-client.sh \
  human.idjag-learner.claude \
  "http://localhost:${_acg_port}/oauth/callback" \
  "http://localhost:${_acg_port}"
```

![Keycloak client added](./assets/13_keycloak_client_added.png)

<a id="setup-user"></a>

## Create the Learner Account

Create a human user account to represent a learner:

```sh
OPEN_UI=true ./tools/keycloak/create-user.sh \
  idjag-learner \
  idjag-learner@athenz.io \
  ID-JAG \
  Learner
```

![13_user_created_idjag_learner](./assets/13_user_created_idjag_learner.png)

<a id="setup-id_token-expiration"></a>

## Configure the Token Lifespan

> [!TIP]
> Set the realm token lifespan to four hours for this walkthrough. The helper updates Keycloak's `accessTokenLifespan` setting. Choose a lifespan appropriate to your security requirements outside this learning environment.

```sh
./tools/keycloak/set-token-lifespan.sh 14400
```

```sh
#   ·  Fetching Keycloak admin token...
#   ·  Setting access token lifespan to 14400s in realm master...
#   ✔  Access token lifespan set to 14400s (4h)
#   ✔  Opened: http://localhost:34443/admin/master/console/#/master/realm-settings/tokens
```

![13_access_token_lifespan_set](./assets/13_access_token_lifespan_set.png)

<a id="whats-done"></a>

## Review the Result

We have deployed Keycloak and created:

- A client `human.idjag-learner.claude` that will represent our AI client (Claude Code)
- A user `idjag-learner` who represents the person requesting API access

At this point, Keycloak is running and configured, but our Authorization Server (Athenz) does not yet trust it. The next tutorial establishes that trust.

![The IdP is configured, but the IdP AS does not yet trust its tokens](./assets/core_12_idp_untrusted.svg)

<a id="whats-next"></a>

## Next Steps

Keycloak is ready, but Athenz does not yet trust its ID tokens. In the next chapter, you will configure Athenz to accept and verify them.

Next: [Trusted Identity Provider](./13-trusted-identity-provider.md)
