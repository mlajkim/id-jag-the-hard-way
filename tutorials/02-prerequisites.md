|                    Previous                    |      Current      |                       Next                       |
|:----------------------------------------------:|:-----------------:|:------------------------------------------------:|
| [Working Directory](./01-working-directory.md) | **Prerequisites** | [Kubernetes Cluster](./03-kubernetes-cluster.md) |

# Prerequisites

Prepare your local environment with the following steps. The commands use a Bash-compatible shell and Homebrew on macOS or Linux. On Windows, use a WSL environment.

<!-- TOC depthFrom:2 depthTo:2 -->

- [Install Docker](#install-docker)
- [Install Packages](#install-packages)
- [Arrange Your Workspace](#arrange-your-workspace)
- [Scope of This Tutorial](#scope-of-this-tutorial)

<!-- /TOC -->

## Install Docker

The API, MCP server, gateways, Athenz, and Keycloak run in a local Kubernetes cluster created with kind (Kubernetes in Docker). Claude Code, Codex CLI, and Ollama run on your host machine when you choose those client paths.

> [!NOTE]
> Official install guide: https://docs.docker.com/get-started/get-docker/

Verify Docker is running:

```sh
docker ps
```

```sh
# CONTAINER ID   IMAGE     COMMAND   CREATED   STATUS    PORTS     NAMES
```

## Install Packages

> [!NOTE]
> Homebrew: https://brew.sh/

Install Homebrew:

```sh
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Then install the following packages:

```sh
brew install jq gh kubectl kind
```

<a id="open-up-two-screens"></a>

## Arrange Your Workspace

Keep the tutorial and terminal visible side by side so you can read a step, run it, and compare the result. The example below shows the tutorial on the left and the terminal on the right.

![01_two_screens_recommended](./assets/01_two_screens_recommended.png)

<a id="reminder"></a>

## Scope of This Tutorial

The results of this tutorial should not be considered production-ready. The goal is to learn the architecture, not to ship a hardened production platform.

Next: [Kubernetes Cluster](./03-kubernetes-cluster.md)
