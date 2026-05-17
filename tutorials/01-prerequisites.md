|       Previous       |      Current      |                      Next                      |
|:--------------------:|:-----------------:|:----------------------------------------------:|
| [Home](../README.md) | **Prerequisites** | [Working Directory](./02-working-directory.md) |

# Prerequisites

In this tutorial, we will review the machine requirements for following it.

## Virtual or Physical Machines

This tutorial has been tested and confirmed to work seamlessly on the specifications below. While we expect it to run smoothly on lower-spec machines, those configurations haven't been officially verified. If you successfully run this tutorial on lower specifications, please open an Issue with your setup, and we will update this document!"

|  CPU   |  Memory   |      Status      |
|:------:|:---------:|:----------------:|
| M3 Pro | 36 GB RAM | Verified Working |

## Port Usage

This tutorial runs several servers that use your internal port. Some of the ports could already have been taken in your system. This document is designed to work on the port provided by default. You can customize certain ports but it may not work smooth as it has not been tested.

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

## Note

The results of this tutorial should not be considered production ready. The goal is to learn the architecture, not to ship a hardened production platform

Next: [Working Directory](./02-working-directory.md)
