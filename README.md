# ID-JAG The Hard Way

*Bootstrap ID-JAG Architecture the hard way in the AI Agent Era. No scripts.*

This tutorial **ID-JAG The Hard Way** walks you through building an ID-JAG-based AI agent authorization architecture from scratch. It is not for someone looking for a fully automated demo or a one-command installer. The **ID-JAG The Hard Way** is optimized for learning, which means taking the long route to understand the identities, tokens, policies, and trust boundaries required to let an AI agent access protected APIs on behalf of a signed-in human user in [ID-JAG specification](https://techblog.lycorp.co.jp/en/20260417a).

[![Start Tutorial](./assets/start-tutorial-glow.svg)](./tutorials/01-prerequisites.md)

## What You Will Get

By the end of this tutorial, you will have a fully functional local flow (like the demo below) where:

1. **You** send a real prompt to an AI agent.
1. The **AI agent** calls a real protected MCP server on your behalf.
1. The **Resource Server** authorizes the request using real tokens and least-privilege policies for each transaction.

![ID-JAG The Hard Way Demo](./assets/id-jag-the-hard-way-readme-demo.gif)

<details>
  <summary>Click to expand the architecture diagram for the demo above</summary>
  <br>

  &nbsp;&nbsp;The following diagram illustrates the architecture, which includes:

  - **A user** (on the left) interacting with an AI server via an AI client
  - **Keycloak** as the Identity Provider (IdP)
  - **Athenz** as the Authorization Server
  - **Open WebUI, Ollama, and Gemma 4** as the local AI client agent
  - **A sample API server** acting as the Resource Server
  - **Users or service accounts** (in the purple box) using the traditional method of obtaining an access token directly from the Authorization Server to communicate with the protected resource server

  ![ID-JAG The Hard Way Current Full Architecture](./assets/id-jag-the-hard-way-current-full-architecture.png)
</details>

## Special Thanks

The name and concept of this tutorial series is inspired by [kelseyhightower/kubernetes-the-hard-way](https://github.com/kelseyhightower/kubernetes-the-hard-way).

## 🚀 Ready to dive in?

[![Start Tutorial](./assets/start-tutorial-glow.svg)](./tutorials/01-prerequisites.md)
