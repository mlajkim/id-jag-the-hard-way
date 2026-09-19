|       Previous       |        Current        |                  Next                  |
|:--------------------:|:---------------------:|:--------------------------------------:|
| [Home](../README.md) | **Working Directory** | [Prerequisites](./02-prerequisites.md) |

# Working Directory

Set up the working directory for all tutorial commands with the following steps:

<!-- TOC depthFrom:2 depthTo:2 -->

- [Clone the Repository](#clone-the-repository)
- [Enter the Working Directory](#enter-the-working-directory)
- [Run Commands from the Repository Root](#run-commands-from-the-repository-root)

<!-- /TOC -->

<a id="create-directory"></a>

## Clone the Repository

Clone the project into `~/id_jag_the_hard_way_workspace` using one of the following methods:

If you are using `gh` for GitHub:

```sh
gh repo fork mlajkim/id-jag-the-hard-way --clone -- --destination ~/id_jag_the_hard_way_workspace
```

If you are using SSH for git:

```sh
git clone git@github.com:mlajkim/id-jag-the-hard-way.git ~/id_jag_the_hard_way_workspace
```

If you are using HTTPS for git:

```sh
git clone https://github.com/mlajkim/id-jag-the-hard-way.git ~/id_jag_the_hard_way_workspace
```

<a id="change-directory"></a>

## Enter the Working Directory

```sh
cd ~/id_jag_the_hard_way_workspace
```

Download the Git submodules:

```sh
git submodule update --init --recursive
```

<a id="stay-on-the-directory-id_jag_the_hard_way_workspace"></a>

## Run Commands from the Repository Root

Run tutorial commands from the repository root, including when you open another terminal. You can choose a different directory name or location when cloning, but relative paths in the commands assume the repository root.

The repository and its submodules are ready. In the next chapter, you will check the tools needed to run the tutorial.

Next: [Prerequisites](./02-prerequisites.md)
