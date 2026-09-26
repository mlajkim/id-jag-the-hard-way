| 이전 | 현재 | 다음 |
|:---:|:---:|:---:|
| [작업 디렉터리](./01-working-directory.md) | **사전 준비** | [Kubernetes 클러스터](./03-kubernetes-cluster.md) |

<a id="prerequisites"></a>

# 사전 준비

실습에 필요한 도구를 설치하고 로컬 환경을 준비합니다. 명령은 macOS 또는 Linux의 Bash 호환 셸과 Homebrew를 기준으로 합니다. Windows에서는 WSL 환경을 사용해 주세요.

<!-- TOC depthFrom:2 depthTo:2 -->

- [Docker 설치](#install-docker)
- [패키지 설치](#install-packages)
- [작업 화면 배치](#arrange-your-workspace)
- [튜토리얼의 범위](#scope-of-this-tutorial)

<!-- /TOC -->

<a id="install-docker"></a>

## Docker 설치

API, MCP 서버, 게이트웨이, Athenz, Keycloak은 kind(Kubernetes in Docker)로 만든 로컬 Kubernetes 클러스터에서 실행합니다. 클라이언트 경로에 따라 사용하는 Claude Code, Codex CLI, Ollama는 호스트 머신에서 실행합니다.

> [!NOTE]
> 공식 설치 안내: https://docs.docker.com/get-started/get-docker/

Docker가 실행 중인지 확인합니다:

```sh
docker ps
```

```sh
# CONTAINER ID   IMAGE     COMMAND   CREATED   STATUS    PORTS     NAMES
```

<a id="install-packages"></a>

## 패키지 설치

> [!NOTE]
> Homebrew: https://brew.sh/

Homebrew를 설치합니다:

```sh
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

이어서 다음 패키지를 설치합니다:

```sh
brew install jq gh kubectl kind
```

<a id="open-up-two-screens"></a>

<a id="arrange-your-workspace"></a>

## 작업 화면 배치

튜토리얼과 터미널을 나란히 배치하면 각 단계를 읽고 실행한 뒤 결과를 비교하기 편합니다. 아래 예시는 왼쪽에 튜토리얼, 오른쪽에 터미널을 배치한 화면입니다.

![튜토리얼과 터미널을 나란히 배치한 화면](../assets/01_two_screens_recommended.png)

<a id="reminder"></a>

<a id="scope-of-this-tutorial"></a>

## 튜토리얼의 범위

이 튜토리얼은 아키텍처를 이해하기 위한 실습입니다. 운영 환경에 필요한 보안 설정을 모두 갖추지는 않았으므로, 결과물을 그대로 운영에 사용하지 않습니다.

필요한 도구가 준비되었습니다. 다음 장에서는 로컬 Kubernetes 클러스터를 만듭니다.

다음: [Kubernetes 클러스터](./03-kubernetes-cluster.md)
