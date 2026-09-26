| 이전 | 현재 | 다음 |
|:---:|:---:|:---:|
| [리소스 서버 (Resource Server)를 위한 MCP 서버](./08-mcp-server-for-resource-server.md) | **Codex** | [MCP 서버 보호](./10-protect-mcp-server.md) |

<a id="codex"></a>

# Codex

이 장부터는 **Codex**를 사용합니다. 현재 한국어 튜토리얼은 Codex를 기준으로 작성되어 있습니다. [Claude Code](../09-ai-agent.md)나 [Open WebUI](../open_webui/09-ai-agent.md)를 사용한다면 해당 영문 튜토리얼로 진행해 주세요.

![Codex](../codex/assets/10_codex.png)

> [!NOTE]
> Codex CLI는 사용자의 컴퓨터에서 실행합니다. OpenAI가 호스팅하는 모델을 사용하면 모델 추론은 원격에서 이루어지므로, 이 경로에서는 Ollama 같은 로컬 모델 런타임이 필요하지 않습니다.

Codex CLI를 설치하고 MCP 서버에 연결한 뒤, 실습자의 API 액세스 토큰 (Access Token)으로 문서를 조회합니다.

<!-- TOC depthFrom:2 depthTo:2 -->

- [Codex CLI 설치](#install-codex-cli)
- [Codex 로그인](#sign-in-to-codex)
- [Codex에 MCP 서버 추가](#add-the-mcp-server-to-codex)
- [MCP 서버 연결](#connect-to-the-mcp-server)
- [연결 상태 확인](#verify)
- [문서 조회 확인](#verify-working)
- [동작 확인](#understand-the-result)
- [다음 단계](#next-steps)

<!-- /TOC -->

<a id="install-codex-cli"></a>

## Codex CLI 설치

Codex가 이미 설치되어 있는지 확인합니다:

```sh
codex --version
```

```sh
# codex-cli X.XXX.X
```

Codex가 없다면 [Node.js와 npm](https://nodejs.org/en/download)을 설치한 뒤 다음 명령을 실행합니다:

```sh
npm install -g @openai/codex
```

> [!NOTE]
> 다른 설치 방법은 [Codex CLI 공식 문서](https://developers.openai.com/codex/cli/)를 참고해 주세요.

<a id="login-to-codex"></a>

<a id="sign-in-to-codex"></a>

## Codex 로그인

Codex를 실행하고 안내에 따라 로그인합니다:

```sh
codex
```

**Sign in with ChatGPT** 또는 사용 가능한 다른 인증 방법을 선택합니다. 지원하는 방법은 [인증 안내](https://learn.chatgpt.com/docs/auth)에서 확인할 수 있습니다. 로그인한 뒤에는 셸에서 MCP 연결을 설정할 수 있도록 Codex를 종료합니다.

<a id="add-the-mcp-server-to-codex"></a>

## Codex에 MCP 서버 추가

아래 블록에서 새 API 액세스 토큰을 발급받고 로컬 Codex 설정 파일을 만든 뒤 제공된 설정을 덧붙입니다. MCP 서버는 각 요청에 포함된 이 Bearer 토큰을 API로 전달합니다:

```sh
_mcp_port=$(./tools/port.sh mcp)
_scope="api:role.docs-getter"
_my_access_token=$(./tools/athenz/fetch-access-token.sh \
  "./keys/idjag-learner.crt" \
  "./keys/idjag-learner.key" \
  "${_scope}" \
  "./keys/idjag-learner.jwt")

cat > .codex/config.toml <<EOF
[mcp_servers.id-jag-the-hard-way-mcp]
url = "http://localhost:${_mcp_port}/mcp"
http_headers = { Authorization = "Bearer ${_my_access_token}" }
EOF

cat .codex/settings.toml >> .codex/config.toml
```

생성된 설정 파일을 확인합니다:

```sh
cat .codex/config.toml
```

```sh
# [mcp_servers.id-jag-the-hard-way-mcp]
# url = "http://localhost:<your_port>/mcp"
# http_headers = { Authorization = "Bearer <your_access_token>" }

# [mcp_servers.id-jag-the-hard-way-mcp.tools.get_k8s_docs]
# approval_mode = "approve"

# [mcp_servers.id-jag-the-hard-way-mcp.tools.delete_k8s_doc]
# approval_mode = "approve"

# [mcp_servers.id-jag-the-hard-way-mcp.tools.post_k8s_doc]
# approval_mode = "approve"
```

<a id="connect-to-mcp-server"></a>

<a id="connect-to-the-mcp-server"></a>

## MCP 서버 연결

프로젝트 디렉터리에서 Codex를 실행합니다:

```sh
codex
```

Codex가 연결되고 문서 도구 세 개를 찾을 수 있어야 합니다.

<a id="verify"></a>

## 연결 상태 확인

MCP 상태에 `id-jag-the-hard-way-mcp`가 연결된 것으로 표시되고 문서 도구 세 개가 모두 나타나는지 확인합니다:

```sh
/mcp verbose
```

```sh
# 🔌  MCP Tools

#   • id-jag-the-hard-way-mcp: connected (3 tools)
#     • Auth: Bearer token
#     • Tools: delete_k8s_doc, get_k8s_docs, post_k8s_doc
#     • Resources: (none)
#     • Resource templates: (none)
```

<a id="verify-working"></a>

## 문서 조회 확인


Codex에 문서 도구를 호출하도록 요청합니다:

```sh
Get docs with id-jag-the-hard-way-mcp
```

![get_k8s_docs로 문서 두 개를 조회한 Codex](../codex/assets/09_codex_get_k8s_docs_success.png)

도구는 상태 `200`과 문서 목록을 반환해야 합니다. 토큰이 만료되어 API가 거부하면 위의 토큰 발급 및 설정 단계를 다시 실행한 뒤 Codex를 다시 시작해 주세요.

<a id="understand-the-result"></a>

## 동작 확인

도구 목록 조회는 API를 호출하지 않고 도구 정의만 읽습니다. Codex가 `get_k8s_docs`를 호출하면 MCP 서버가 해당 요청의 Authorization 헤더에 담긴 API 토큰을 전달합니다. API는 토큰과 문서 조회 권한을 검증합니다.

![AI 에이전트가 같은 API 액세스 토큰으로 MCP를 통해 문서를 조회하는 흐름](../assets/core_09_mcp_success.svg)

<a id="next-steps"></a>

## 다음 단계

이제 AI 클라이언트가 MCP를 통해 문서를 조회할 수 있습니다. 다음 장에서는 도구 실행을 허용하기 전에 액세스 토큰을 검증하도록 Runtime Proxy를 추가합니다.

다음: [MCP 서버 보호](./10-protect-mcp-server.md)
