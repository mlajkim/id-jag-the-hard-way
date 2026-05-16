|               Previous               |        Current        |               Next               |
|:------------------------------------:|:---------------------:|:--------------------------------:|
| [Prerequisites](01-prerequisites.md) | **Working Directory** | [API Server](./03-api-server.md) |

# Working Directory

In this tutorial, we will set up a working directory for the tutorial.

## Create directory

We will create a directory `~/id_jag_the_hard_way_workspace` by cloning the project:

If you are using SSH for git:

```sh
git clone git@github.com:mlajkim/id-jag-the-hard-way.git ~/id_jag_the_hard_way_workspace
```

If you are using HTTPS for git:

```sh
git clone https://github.com/mlajkim/id-jag-the-hard-way.git ~/id_jag_the_hard_way_workspace
```

Every script used in this tutorial will assume that it is being run from the `id_jag_the_hard_way_workspace` directory. If you need to run any script, you will need to change into this directory first. The name & directory can be customized to your needs, as long as you come back to this directory to run any scripts referenced by any tutorial.

Next: [API Server](./03-api-server.md)
