|                                Previous                                |         Current          | Next |
|:----------------------------------------------------------------------:|:------------------------:|:----:|
| [Challenge: Successfully post documents](./challenges/01-post-docs.md) | **Challenge: Post docs** | n/a  |

# Challenge: ID-JAG with Curl

> [!NOTE]
> The challenge has been tested and proven solvable.

We have depended on components preinstalled for you that does:

- id_token => ID_JAG
- ID_JAG => Access Token

Can you do the same using only curl?

## Solution

<details>
<summary>Click to expand the solution</summary>
<br>

AI Client Agent:

- `3100`: Open WebUI Port with Keycloak
- `3101`: OpenAI Athenz Client Gateway
- `3200`: Open WebUI Port without Keycloak
- `11434`: Ollama

IdP:

- `9090`: Keycloak Server

Authorization Server (Athenz):

- `3000`: Athenz UI
- `4443`: Athenz ZMS
- `8443`: Athenz ZTS

Resource Server (API Server):

- `8102`: Athenz Authorization Proxy for API MCP Server
- `8101`: API MCP Server for API
- `14443`: Dummy API (Original API, not proxied by Athenz proxy)
- `14442`: Dummy API without Athenz AT required

</details>

## Next Challenge

More content is on the way! Stay tuned for the following advanced topics and solutions.
