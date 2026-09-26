| 이전 | 현재 | 다음 |
|:---:|:---:|:---:|
| [권한 세분화](./07-granular-permission.md) | **리소스 서버 (Resource Server)를 위한 MCP 서버** | [Codex](./09-ai-agent.md) |

<a id="mcp-server-for-resource-server"></a>

# 리소스 서버 (Resource Server)를 위한 MCP 서버

`idthw-demo-api-mcp`를 배포하고 MCP 엔드포인트에 연결한 뒤 문서 도구 목록을 확인합니다.

<!-- TOC depthFrom:2 depthTo:2 -->

- [MCP 네임스페이스 생성](#create-the-mcp-namespace)
- [MCP 서버 배포](#deploy-the-mcp-server)
- [도구 목록 확인](#discover-the-tools)
- [동작 확인](#understand-the-result)
- [다음 단계](#next-steps)

<!-- /TOC -->

<a id="create-the-mcp-namespace"></a>

## MCP 네임스페이스 생성

MCP는 `mcp` 네임스페이스에, 리소스 서버는 `api` 네임스페이스에 배포합니다:

```sh
kubectl create ns mcp
```

```sh
# namespace/mcp created
```

<a id="deploy-the-mcp-server"></a>

## MCP 서버 배포

기본 설정으로 MCP 서버를 배포합니다:

```sh
kubectl create deploy mcp -n mcp \
  --image=ghcr.io/mlajkim/idthw-demo-api-mcp:latest
```

```sh
# deployment.apps/mcp created
```

Service의 `8081` 포트를 통해 컨테이너의 `8080` 포트에 접근할 수 있도록 합니다:

```sh
kubectl expose deploy mcp -n mcp --port 8081 --target-port 8080 --name mcp
```

```sh
# service/mcp exposed
```

MCP 서버가 준비될 때까지 기다립니다:

```sh
kubectl rollout status deploy/mcp -n mcp
```

```sh
# deployment "mcp" successfully rolled out
```

로컬에서 MCP Service에 접근할 수 있도록 다른 터미널에서 `./tools/keep-k8s-port-forward.sh`를 계속 실행해 둡니다.

<a id="discover-the-tools"></a>

## 도구 목록 확인

상태를 유지하지 않는 MCP 서버의 초기화 응답을 확인합니다:

```sh
_mcp_port=$(./tools/port.sh mcp)
curl -sS "http://localhost:${_mcp_port}/mcp" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"tutorial","version":"1.0"}}}' | jq '.result.serverInfo'
```

```sh
# {
#   "name": "idthw-demo-api-mcp",
#   "title": "IDTHW Demo API MCP",
#   "version": "0.1.0"
# }
```

문서 도구 목록을 조회합니다:

```sh
_mcp_port=$(./tools/port.sh mcp)
curl -sS "http://localhost:${_mcp_port}/mcp" \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | jq '.result.tools[].name'
```

```sh
# "get_k8s_docs"
# "post_k8s_doc"
# "delete_k8s_doc"
```

도구 목록 조회는 인증 없이 가능합니다. 도구가 문서를 요청할 때는 API가 유효한 토큰을 요구합니다.

<a id="understand-the-result"></a>

## 동작 확인

MCP 서버가 실행되고 초기화가 성공했으며, 도구 목록에 `get_k8s_docs`, `post_k8s_doc`, `delete_k8s_doc`가 나타납니다. 이 과정은 액세스 토큰 (Access Token)이나 Runtime Proxy 없이 동작합니다.

![MCP 클라이언트가 서버를 초기화하고 도구 목록을 조회하는 흐름](../assets/core_08_mcp_api.svg)

도구 목록 조회는 API를 호출하지 않습니다. 문서 도구는 전달받은 API 액세스 토큰으로 리소스 서버를 호출하며, 리소스 서버는 계속 토큰을 검증합니다. MCP 서버가 직접 토큰을 교환하지는 않습니다.

<a id="next-steps"></a>

## 다음 단계

MCP 서버가 준비되었고 도구 목록을 조회할 수 있습니다. 다음 장에서는 AI 클라이언트를 연결하고 도구 목록을 확인합니다.

다음: [Codex](./09-ai-agent.md)
