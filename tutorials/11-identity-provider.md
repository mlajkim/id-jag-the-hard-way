|                     Previous                     |        Current        |           Next           |
|:------------------------------------------------:|:---------------------:|:------------------------:|
| [Protect MCP Server](./10-protect-mcp-server.md) | **Identity Provider** | [ID-JAG](./12-id-jag.md) |

# Identity Provider

In this tutorial, we will configure [Keycloak](https://www.keycloak.org/) as an Identity Provider (IdP) for our AI Client Agent, enabling users to sign in with non-admin (standard) accounts.

## Run Keycloak locally

We will run the Keycloak server using a local directory as its data store:

```sh
_keycloak_running_port=9090

docker run -p ${_keycloak_running_port}:8080 \
  -e KEYCLOAK_ADMIN=admin \
  -e KEYCLOAK_ADMIN_PASSWORD=admin \
  -v ./keycloak-data:/opt/keycloak/data \
  quay.io/keycloak/keycloak:latest start-dev
```

Next, open your browser and log in using admin for both the username `admin` and password `admin`:

```sh
_keycloak_running_port=9090
open http://localhost:${_keycloak_running_port}
```

![11_keycloak_running](./assets/11_keycloak_running.png)

## Setup Client

In Keycloak, a `Client` represents an application that requests authentication on behalf of a user, in this case, our AI Client Agent. Since the service identity name of the AI client will be `ai.open-webui`, we will use that as the client name.

> [!NOTE]
> We use the default `master` realm for this tutorial.

Go to `http://localhost:9090/admin/master/console/#/master/clients/add-client` and configure the following:

- Client type: `OpenID Connect`
- Client ID: `ai.open-webui`
- Name: `AI Open WebUI`
- Description: `AI Client Agent`

Click **Next**, then set:

- Client authentication: `ON`

Click **Next**, then set:

- Valid redirect URIs: `http://localhost:3100/oauth/oidc/callback`

Click **Save**.

You should see a confirmation screen similar to this:

![11_keycloak_client_added](./assets/11_keycloak_client_added.png)

## Setup User

Let's create a human user account to represent you.

Go to `http://localhost:9090/admin/master/console/#/master/users/add-user` and fill in the following:

- Username: `idjag-learner`
- Email: `idjag-learner@athenz.io`
- First Name: `ID-JAG`
- Last Name: `Learner`

Click **Create**.

Next, navigate to the **Credentials** tab and click **Set password**, then configure the following:

- Password: `password` (It is only for test purpose)
- Temporary: `off`

Click **Save**.

## Create Open WebUI Runner Script with Keycloak Settings

We will create a quick script to run the Open WebUI client with Keycloak configured.

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

### Run Open WebUI with Keycloak

The script we just created requires the Keycloak Client ID and Client Secret.

In Keycloak, navigate to `Clients` > `ai.open-webui` > `credentials` > `Copy Client Secret` then store as `_kcs` or `_keycloak_client_secret`:

```sh
_kcs="<<THE_CLIENT_SECRET>>"
```

Now, run the application:

```sh
mkdir -p open_webui
_keycloak_client_id="ai.open-webui"
_open_webui_keycloak_port=3100
(
  cd open_webui
  ../run-open-webui-keycloak.sh "$_keycloak_client_id" "$_kcs" "$_open_webui_keycloak_port"
)
```

## Sign in as `idjag-learner`

You might currently be signed in as the `admin` user. To test the non-admin `idjag-learner` account, you can do one of the following:

- Log out of your admin account.
- Open a different web browser.
- Open an incognito/private window in your current browser.

Ensure you are not logged in as the admin, then navigate to the Open WebUI application:

```sh
_open_webui_keycloak_port=3100
open http://localhost:${_open_webui_keycloak_port}
```

You will see a new login panel with a **Continue with Keycloak** button:

![11_continue_with_keycloak_appeared](./assets/11_continue_with_keycloak_appeared.png)

Click it, and you will be prompted to log in. Use the credentials we created:

![11_continue_with_keycloak_appeared](./assets/11_continue_with_keycloak_appeared.png)

Then you will be prompted to add member

- `Username`: `idjag-learner`
- `Password`: `password`

![11_login_successful_as_idjag_learner](./assets/11_login_successful_as_idjag_learner.png)

## Accept the account

Return to the browser where you are logged in as the `admin` user.

Navigate to `http://localhost:3100/admin/users/overview`

![11_pending_user_id_jag_learner_added](./assets/11_pending_user_id_jag_learner_added.png)

Click `Edit User` for the `idjag-learner`, then change `Pending` to `User`, and click **Save**.

## Return to the `idjag-learner` Browser

Switch back to the browser window for `idjag-learner` and refresh the page. You should now be successfully logged into the interface.

![11_hello_idjag_leanrer](./assets/11_hello_idjag_leanrer.png)

## What's next?

You may have noticed that manually inserting the Access Token into the UI is cumbersome. Furthermore, the access token we provided for the MCP server only represents a single user (`human.idjag-learner`). In an enterprise environment, many users will need to use their own Access Tokens for shared tools, making a static, hardcoded token impractical.

In the next tutorial, we will automate this flow: signing in as idjag-learner to retrieve an ID Token, exchanging it for an ID-JAG token, and ultimately obtaining an Access Token. The tool server will then use this dynamically generated Access Token to communicate securely with the MCP Server.

Next: [ID-JAG](./12-id-jag.md)
