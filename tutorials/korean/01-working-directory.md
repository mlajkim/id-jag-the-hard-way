| 이전 | 현재 | 다음 |
|:---:|:---:|:---:|
| [소개](./00-README.md) | **작업 디렉터리** | [사전 준비](./02-prerequisites.md) |

<a id="working-directory"></a>

# 작업 디렉터리

튜토리얼에서 사용할 작업 디렉터리를 준비합니다. 이후의 명령은 이 디렉터리에서 실행합니다.

<!-- TOC depthFrom:2 depthTo:2 -->

- [저장소 복제](#clone-the-repository)
- [작업 디렉터리로 이동](#enter-the-working-directory)
- [저장소 루트에서 명령 실행](#run-commands-from-the-repository-root)

<!-- /TOC -->

<a id="create-directory"></a>

<a id="clone-the-repository"></a>

## 저장소 복제

다음 방법 중 하나로 프로젝트를 `~/id_jag_the_hard_way_workspace`에 복제합니다:

GitHub CLI인 `gh`를 사용하는 경우:

```sh
gh repo fork mlajkim/id-jag-the-hard-way --clone -- --destination ~/id_jag_the_hard_way_workspace
```

Git에서 SSH를 사용하는 경우:

```sh
git clone git@github.com:mlajkim/id-jag-the-hard-way.git ~/id_jag_the_hard_way_workspace
```

Git에서 HTTPS를 사용하는 경우:

```sh
git clone https://github.com/mlajkim/id-jag-the-hard-way.git ~/id_jag_the_hard_way_workspace
```

<a id="change-directory"></a>

<a id="enter-the-working-directory"></a>

## 작업 디렉터리로 이동

```sh
cd ~/id_jag_the_hard_way_workspace
```

Git 서브모듈을 내려받습니다:

```sh
git submodule update --init --recursive
```

<a id="stay-on-the-directory-id_jag_the_hard_way_workspace"></a>

<a id="run-commands-from-the-repository-root"></a>

## 저장소 루트에서 명령 실행

튜토리얼의 명령은 저장소 루트에서 실행합니다. 다른 터미널을 열었을 때도 같은 디렉터리로 이동해 주세요. 저장소를 복제할 때 디렉터리 이름이나 위치를 바꿔도 되지만, 명령에 나오는 상대 경로는 저장소 루트를 기준으로 합니다.

저장소와 서브모듈이 준비되었습니다. 다음 장에서는 튜토리얼 실행에 필요한 도구를 확인합니다.

다음: [사전 준비](./02-prerequisites.md)
