|                     Previous                     |        Current        | Next |
|:------------------------------------------------:|:---------------------:|:----:|
| [Protect MCP Server](./10-protect-mcp-server.md) | **Identity Provider** | n/a  |

# Identity Provider

🟡 TODO: AI Rephrase

In this tutorial, we will configure Keycloak as an Identity Provider for our AI Client Agent, enabling users to sign in with non-admin (standard) accounts.

## Run Keycloak locally

We will run the keycloak server with local directory as a data store:

```sh
_keycloak_running_port=9090

docker run -p ${_keycloak_running_port}:8080 \
  -e KEYCLOAK_ADMIN=admin \
  -e KEYCLOAK_ADMIN_PASSWORD=admin \
  -v ./keycloak-data:/opt/keycloak/data \
  quay.io/keycloak/keycloak:latest start-dev
```

Then open the browser, and login as `admin` with password `admin`:

```sh
_keycloak_running_port=9090
open http://localhost:${_keycloak_running_port}
```

![11_keycloak_running](./assets/11_keycloak_running.png)

## Setup Client

In Keycloak, `Client` represents the Application that requests authentication on behalf of a user. In our case, it is the AI Client Agent. Since service identity name of the ai client will be `ai.open-webi`, we can name the client as `ai.open-webui`.

Go to `http://localhost:9090/admin/master/console/#/master/clients/add-client` then:

- `Client type`: `OpenID Connect`
- `Client ID`: `ai.open-webui`
- `Name`: `AI Open WebUI`
- `Description`: `AI Client Agent`

Click `Next` then:

- `Client authentication` as `ON`

Click `Next` then:

- Valid redirect URLs: `http://localhost:3100/oauth/oidc/callback`

Click `Save`.

Then you will see something like this:

![11_keycloak_client_added](./assets/11_keycloak_client_added.png)

## Setup User

Let's create a human user that represents you.

Go to `http://localhost:9090/admin/master/console/#/master/users/add-user` then:

- `Username`: `idjag-learner`
- `Email`: `idjag-learner@athenz.io`
- `First Name`: `ID-JAG`
- `Last Name`: `Learner`

Click `Create`.

Then go to `credentials` > `Set passwords`, then:

- `Password`: `password` (It is only for test purpose)
- `Temporary`: `off`

Then save.


## Create Open WebUI Runner Script with Keycloak Setting

We are going to create a quick script that runs the open webui client with keycloak configured.

```sh
cat > run-open-webui-keycloak.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

CLIENT_ID="${1:-}"
CLIENT_SECRET="${2:-}"
PORT="${3:-3100}"

if [[ -z "${CLIENT_ID}" ]]; then
  echo "Error: Keyclaok CLIENT_ID is not set."
  exit 1
fi

if [[ -z "${CLIENT_SECRET}" ]]; then
  echo "Error: Keyclaok CLIENT_SECRET is not set."
  exit 1
fi

mkdir -p data
export DATA_DIR="$(pwd)/data"
export OLLAMA_BASE_URL="${OLLAMA_BASE_URL:-http://localhost:11434}"

# keycloak settings:
export ENABLE_OAUTH_SIGNUP="true"
export OAUTH_CLIENT_ID="${CLIENT_ID}"
export OAUTH_CLIENT_SECRET="${CLIENT_SECRET}"
export OPENID_PROVIDER_URL="http://localhost:9090/realms/master/.well-known/openid-configuration"
export OAUTH_PROVIDER_NAME="Keycloak"
export OAUTH_SCOPES="openid email profile"
export OPENID_REDIRECT_URI="http://localhost:${PORT}/oauth/oidc/callback"

if [[ ! -x venv/bin/python ]]; then
  python3 -m venv venv
fi

source venv/bin/activate

if ! python -m pip show open-webui >/dev/null 2>&1; then
  python -m pip install open-webui \
    --trusted-host pypi.org \
    --trusted-host files.pythonhosted.org \
    --trusted-host edge.artifactory.corp.yahoo.co.jp
fi

exec open-webui serve --port "${PORT}"
EOF

chmod +x run-open-webui-keycloak.sh
```

### Run Open WebUI with Keycloak for testing

The script we just created requires the keycloak client id and secret.

Go to `Clients` > `ai.open-webui` > `credentials` > `Copy Client Secret` then store as `_kcs` or `_keycloak_client_secret`:

```sh
_kcs="<<THE_CLIENT_SECRET>>"
```


```sh
mkdir -p open_webui
_keycloak_client_id="ai.open-webui"
_open_webui_keycloak_port=3100
(
  cd open_webui
  ../run-open-webui-keycloak.sh "$_keycloak_client_id" "$_kcs" "$_open_webui_keycloak_port"
)
```

## Sign in as idjag-learner

You may be signed in as the `admin` user during the tutorial, and to mimic non-admin user `idjag-learner`, you can either:

- log out as admin
- open a different browser
- open the current browser with incognito mode

Whichever mode it is, you need to sign out from the keycloak and go to the website


```sh
_open_webui_keycloak_port=3100
open http://localhost:${_open_webui_keycloak_port}
```

Then you will see the new panel with `Continue with Keycloak` button:

![11_continue_with_keycloak_appeared](./assets/11_continue_with_keycloak_appeared.png)

Then you will be prompted to add member

- `Username`: `idjag-learner`
- `Password`: `password`

![11_login_successful_as_idjag_learner](./assets/11_login_successful_as_idjag_learner.png)

## Accept the account

Open up the browser that is signed as admin,

Go to http://localhost:3100/admin/users/overview

![11_pending_user_id_jag_learner_added](./assets/11_pending_user_id_jag_learner_added.png)

Go to `Edit User` > `Pending` > `User` then click `Save`.

## Go to the idjag leanrer browser

Go to the idjag learner browser and do refresh. You will be able to login

![11_hello_idjag_leanrer](./assets/11_hello_idjag_leanrer.png)

## What's next?

🟡 TODO