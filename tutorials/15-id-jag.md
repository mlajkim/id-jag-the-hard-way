|                    Previous                    |  Current   |                      Next                      |
|:----------------------------------------------:|:----------:|:----------------------------------------------:|
| [AI Client Gateway](./14-ai-client-gateway.md) | **ID-JAG** | *None: You are at the end of the tutorial! 🎉* |

# ID-JAG

Authorize the AI Client Gateway to exchange your Keycloak ID token for an ID-JAG with the following steps. Then repeat the document request and inspect the token checks at each service.

<!-- TOC depthFrom:2 depthTo:2 -->

- [Grant Permissions to `human.idjag-learner.claude`](#grant-permissions-to-humanidjag-learnerclaude)
- [Verify](#verify)
- [Understand the Result](#understand-the-result)
- [Finally](#finally)
- [Closing](#closing)

<!-- /TOC -->

## Grant Permissions to `human.idjag-learner.claude`

The `human.idjag-learner.claude` service needs permission to perform JAG exchange into the target roles it will use.

Create one JAG-exchange role in each target domain: `api` for document access and `mcp` for MCP access. The gateway will request both scopes in one ID-JAG, then exchange it for an access token with audience `mcp`:

```sh
./tools/athenz/create-role.sh "api" "docs-getter-jag-exchanger"
./tools/athenz/create-role.sh "mcp" "mcp-accessor-jag-exchanger"
```

```sh
#   ·  Creating Role: api:role.docs-getter-jag-exchanger...
#   ✔  Role created: api:role.docs-getter-jag-exchanger
#   ·  Creating Role: mcp:role.mcp-accessor-jag-exchanger...
#   ✔  Role created: mcp:role.mcp-accessor-jag-exchanger
```

In Athenz, the `zts.jag_exchange` action controls whether a principal can exchange an ID token for an ID-JAG token scoped to a given role. Grant it for `api:role.docs-getter` and `mcp:role.mcp-accessor`:

```sh
./tools/athenz/add-policy.sh "api" "docs-getter-jag-exchanger" "zts.jag_exchange" "role.docs-getter"
./tools/athenz/add-policy.sh "mcp" "mcp-accessor-jag-exchanger" "zts.jag_exchange" "role.mcp-accessor"
```

```sh
#   ·  Creating Policy: api:policy.docs-getter-jag-exchanger_zts_jag_exchange_role_docs-getter...
#   ✔  Policy created: api:policy.docs-getter-jag-exchanger_zts_jag_exchange_role_docs-getter
#   ·  Creating Policy: mcp:policy.mcp-accessor-jag-exchanger_zts_jag_exchange_role_mcp-accessor...
#   ✔  Policy created: mcp:policy.mcp-accessor-jag-exchanger_zts_jag_exchange_role_mcp-accessor
```

Now add `human.idjag-learner.claude` as a member of both roles:

```sh
./tools/athenz/add-role-member.sh "api" "docs-getter-jag-exchanger" "human.idjag-learner.claude"
./tools/athenz/add-role-member.sh "mcp" "mcp-accessor-jag-exchanger" "human.idjag-learner.claude"
```

```sh
#   ·  Adding Member human.idjag-learner.claude to Role: api:role.docs-getter-jag-exchanger...
#   ✔  human.idjag-learner.claude  →  api:role.docs-getter-jag-exchanger
#   ·  Adding Member human.idjag-learner.claude to Role: mcp:role.mcp-accessor-jag-exchanger...
#   ✔  human.idjag-learner.claude  →  mcp:role.mcp-accessor-jag-exchanger
```

## Verify

Reload the MCP configuration in Claude Code:

```sh
/reload-plugins
```

Open the MCP connection menu:

```sh
/mcp
```

Select **1. Re-Authenticate** to reconnect. This time, with the token exchange permission in place, you will see the connection succeed.

The connection should expose these three tools:

```sh
# get_k8s_docs
# post_k8s_doc
# delete_k8s_doc
```

Then send the same prompt that failed in the previous tutorial:

```sh
Get docs with id-jag-the-hard-way-mcp
```

![16_successful_retrieval_from_server](./assets/16_successful_retrieval_from_server.png)

The response should contain the documents returned by the API.

<a id="whats-happened"></a>

## Understand the Result

The AI Client Gateway resolved the signed-in user's Keycloak ID token, exchanged it for an ID-JAG token, and then fetched an Athenz access token.

The gateway also logs requests and responses. Filter for token-exchange messages and show the latest seven lines:

```sh
kubectl logs deploy/claude-idjag-learner-ai-client-gateway -n human -c ai-client-gateway --tail=100 \
  | grep -E '^\[Athenz (ID-JAG|AT)\]' \
  | tail -n 7
```

```sh
# [Athenz ID-JAG] 🔑 Resolved ID token from bearer session (Claude Code path)
# [Athenz ID-JAG] 🔄 Attempting to exchange new ID-JAG with id-token for scope [api:role.docs-getter mcp:role.mcp-accessor] ...
# [Athenz ID-JAG] 🎯 Target ZTS for ID-JAG: https://athenz-zts-server.athenz:4443/zts/v1/oauth2/token
# [Athenz ID-JAG] 🎫 Granted scope in ID-JAG: "api:role.docs-getter mcp:role.mcp-accessor"
# [Athenz AT] Fetching Athenz Access Token using ID-JAG ...
# [Athenz AT] 🎯 Target ZTS for AT: https://athenz-zts-server.athenz:4443/zts/v1/oauth2/token
# [Athenz AT] 🔑 Successfully fetched Athenz Access Token. Granted scope: ["api:role.docs-getter","mcp-accessor"]
```

## Finally

🎉 Congratulations! You've completed the "ID-JAG The Hard Way" tutorial.

You have connected user sign-in to delegated API access. Athenz policies control token issuance and exchange; the proxy and API enforce each token's audience and scopes. Changes to role membership affect new grants after ZTS observes them, while issued tokens can remain usable until they expire.

<a id="full-architecture"></a>

The diagram below shows the complete flow you have built:

![Core tutorial architecture: IdP, IdP AS, Authorization Server, AI Agent, gateway, MCP, and Resource Server](./assets/core_15_idjag_flow.svg)

## Closing

If you found this tutorial useful, please consider giving either repository a ⭐ on GitHub!

| Repository                                                                       | Stars                                                                                                                                                                                                   | Forks                                                                                                                                                                                              |
|----------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| [Root repository](https://github.com/mlajkim/id-jag-the-hard-way)                | [![Root repository stars](https://img.shields.io/github/stars/mlajkim/id-jag-the-hard-way?style=flat-square&label=stars)](https://github.com/mlajkim/id-jag-the-hard-way/stargazers)                    | [![Root repository forks](https://img.shields.io/github/forks/mlajkim/id-jag-the-hard-way?style=flat-square&label=forks)](https://github.com/mlajkim/id-jag-the-hard-way/forks)                    |
| [Athenz community fork](https://github.com/athenz-community/id-jag-the-hard-way) | [![Athenz community stars](https://img.shields.io/github/stars/athenz-community/id-jag-the-hard-way?style=flat-square&label=stars)](https://github.com/athenz-community/id-jag-the-hard-way/stargazers) | [![Athenz community forks](https://img.shields.io/github/forks/athenz-community/id-jag-the-hard-way?style=flat-square&label=forks)](https://github.com/athenz-community/id-jag-the-hard-way/forks) |

If you run into any issues or have questions, feel free to [open an issue](https://github.com/mlajkim/id-jag-the-hard-way/issues).
