|                     Previous                     |       Current       | Next |
|:------------------------------------------------:|:-------------------:|:----:|
| [MCP Server for API](./07-mcp-server-for-api.md) | **AI Client Agent** | n/a  |

# AI Client Agent

In this tutorial, we will install AI Client Agent for the first time, and talk to API server through it.

## Install Ollama

Ollama is one of the easiest way to install open LLM locally and talk to it.

Simply run the following command:

```sh
curl -fsSL https://ollama.com/install.sh | sh

# Starting Ollama...
# >>> Downloading Ollama for macOS...
# ######################################################################## 100.0%
# >>> Installing Ollama to /Applications...
# >>> Adding 'ollama' command to PATH (may require password)...
# Password:
# >>> Starting Ollama...
# >>> Install complete. You can now run 'ollama'.
```

> [!NOTE]
> SSOT install method: https://ollama.com/

## Install Gemma 4 throuh ollama

> [!NOTE]
> Learn about the spec of the Gemma4's model [here](https://ai.google.dev/gemma/docs/core?_gl=1*57y72w*_up*MQ..*_ga*MTM5MjUyNzM5NC4xNzc4NDU1OTc0*_ga_P1DBVKWT6V*czE3Nzg0NTU5NzQkbzEkZzAkdDE3Nzg0NTU5NzQkajYwJGwwJGgxMjMzODIwOTA0#gemma-4-inference-memory-requirements) 

In this tutorial we will use Gemma 4's `gemma4:26b` as our AI model:

```sh
ollama pull gemma4:26b
```

## Install Open WebUI

Instead of using Ollama's its own native UI, we will use Open WebUI to provide more feature-rich UI. Open WebUI requires specific Python version and some system dependencies. At this point of writing, the official documentation states Open WebUI runs on Python 3.11 or lower.

### Install Python

> [!NOTE]
> Learn how to install pyenv here: [pyenv/pyenv - GitHub](https://github.com/pyenv/pyenv)

Since managing python version could be a hassle, let's use the `pyenv` tool to manage python versions.

```sh
pyenv install 3.11
pyenv local 3.11
python --version

# Python 3.11.15
```

### Create OpenWebUI Runner Script

```sh
cat > run-open-webui-without-keycloak.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

PORT="${1:-3200}"

mkdir -p data
export DATA_DIR="$(pwd)/data"
export OLLAMA_BASE_URL="${OLLAMA_BASE_URL:-http://localhost:11434}"

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

chmod +x run-open-webui-without-keycloak.sh
```

### Run Open WebUI without Keycloak for testing

```sh
mkdir -p open_webui_without_keycloak
_open_webui_without_keycloak_port=3200
(
  cd open_webui_without_keycloak
  ../run-open-webui-without-keycloak.sh "$_open_webui_without_keycloak_port"
)
```

## Open Open WebUI

Open up the url:

```sh
_open_webui_without_keycloak_port=3200
open http://localhost:$_open_webui_without_keycloak_port
```

You will be prompted to create an admin account as the first user. You can simply do:

- `admin@admin.com`
- `admin`

But it is up to you.

![08_create_admin_account](./assets/08_create_admin_account.png)

## Register MCP Server as a tool server in Open WebUI

Get Access Token again:

```sh
_scope="api:role.docs-getter"
_root_user_at=$(./fetch-access-token.sh \
  "./athenz_dist/certs/athenz_admin.cert.pem" \
  "./athenz_dist/keys/athenz_admin.private.pem" \
  "${_scope}" \
  "./keys/api_docs-getter.jwt")

cat "./keys/api_docs-getter.jwt"

```

Go to `User Icon` > `Admin Panel` > `Settings` > `Integrations` > `+ Icon`, you will be able to register the MCP server as a tool server.

- Name: `API MCP Server`
- Description: `MCP server for API that holds documentation`
- URL: `http://localhost:8101`
- Auth type: `Bearer`
- API Key: `<YOUR_ACCESS_TOKEN_THAT_YOU'VE_FETCHED`

![08_api_mcp_server_in_open_webui](./assets/08_api_mcp_server_in_open_webui.png)
