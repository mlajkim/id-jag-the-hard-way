|                    Previous                    |  Current   |                      Next                      |
|:----------------------------------------------:|:----------:|:----------------------------------------------:|
| [AI Client Gateway](./14-ai-client-gateway.md) | **ID-JAG** | *None: You are at the end of the tutorial! 🎉* |

# ID-JAG

Authorize the AI Client Gateway to exchange your Keycloak ID token for an ID-JAG with the following steps. Then repeat the document request and inspect the token checks at each service.

<!-- TOC depthFrom:2 depthTo:2 -->

- [Grant Permissions to `human.idjag-learner.claude`](#grant-permissions-to-humanidjag-learnerclaude)
- [Verify](#verify)
- [Understand the Result](#understand-the-result)
- [Full Architecture](#full-architecture)
- [Finally](#finally)

<!-- /TOC -->

## Grant Permissions to `human.idjag-learner.claude`

The `human.idjag-learner.claude` service needs permission to perform JAG exchange into the target roles it will use.

Create one JAG-exchange role in each target domain: `api` for document access and `mcp` for MCP access. The gateway will request both scopes in one ID-JAG, then exchange it for an access token with audience `mcp`:

```sh
./tools/athenz/create-role.sh "api" "docs-getter-jag-exchanger"
./tools/athenz/create-role.sh "mcp" "mcp-accessor-jag-exchanger"
```

```sh
  # ·  Creating Role: api:role.docs-getter-jag-exchanger...
  # ✔  Role created: api:role.docs-getter-jag-exchanger
  # ·  Creating Role: mcp:role.mcp-accessor-jag-exchanger...
  # ✔  Role created: mcp:role.mcp-accessor-jag-exchanger
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

```text
/reload-plugins
```

Open the MCP connection menu:

```text
/mcp
```

Select **1. Re-Authenticate** to reconnect. This time, with the token exchange permission in place, you will see the connection succeed.

Then send the same prompt that failed in the previous tutorial:

```
get docs from k8s doc server!
```

![16_successful_retrieval_from_server](./assets/16_successful_retrieval_from_server.png)

The response should contain the documents returned by the API.

<a id="whats-happened"></a>

## Understand the Result

The logs show each authorization boundary in the chain. The gateway requests `mcp:role.mcp-accessor api:role.docs-getter` with access-token audience `mcp`. MCP Runtime Proxy, acting as `mcp.idthw-api-mcp`, then exchanges that token for audience `api`, retaining only `api:role.docs-getter`.

1. The AI Client Gateway resolved the signed-in user's Keycloak ID token, exchanged it for an ID-JAG token, and then fetched an Athenz access token.

```sh
kubectl logs -n human deployment/claude-idjag-learner-ai-client-gateway --tail=300
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

2. MCP Runtime Proxy validates the token before forwarding a protected call. Its [verifier](../components/mcp-runtime-proxy/src/auth.ts) accepts only `alg=RS256` and `typ=at+jwt`, verifies the signature against trusted ZTS signing keys, checks `exp` and any `nbf` restriction, requires audience `mcp`, and checks the `mcp:role.mcp-accessor` scope.

Inspect the `auth-proxy` container, which runs MCP Runtime Proxy:

```sh
kubectl logs -n mcp deployment/mcp -c auth-proxy --tail=50
```

Find an `access token verified` line in the default text logs. It is emitted only after all of those checks pass. Check its `audiences`, `scopes`, `keyId`, and `expiresInSeconds`, then match its `requestId` to a `request completed` line with `upstreamStatus=200`. Short scopes such as `mcp-accessor` are accepted only when `mcp` is the sole audience.

A public discovery request can also complete successfully, so `request completed` alone does not confirm token validation. Reading the JWT's `alg` header alone does not verify its signature either.

With `LOG_FORMAT=json` set on the `auth-proxy` container, the same events appear as `access_token_verified` and `request_completed`, with `"upstreamStatus":200` in the JSON record. Older Runtime Proxy images also use this JSON format by default.

3. MCP Runtime Proxy performs the downstream token exchange as `mcp.idthw-api-mcp`. It writes the API-specific `docs-getter` token to a unique request file and injects the path into the tool call. `idthw-demo-api-mcp` reads that file before calling the API; the proxy removes it after the response.

<details>
<summary>Confirm Runtime Proxy's token exchange</summary>

```sh
kubectl logs -n mcp deployment/mcp -c auth-proxy --tail=20
```

Look for `downstream access token published` with scope `api:role.docs-getter`, followed by `downstream access token removed` for the same request. The exchanged token has audience `api`.

</details>

4. The API independently [validates the exchanged token](../components/idthw-demo-api/src/auth.ts) using trusted ZTS signing keys, checks its type, lifetime, and audience, and requires `api:role.docs-getter` before returning the docs.

```sh
kubectl logs -n api deployment/api-server --tail=20
```

```sh
# Look for event "request_completed", method "GET", status 200.
```

The proxy checks MCP access, and the API checks document access. The downstream exchange changes the audience from `mcp` to `api` and retains only the document-reading scope.

## Full Architecture

This is the complete architecture you have built, from user sign-in to protected document access:

![Core tutorial architecture: IdP, IdP AS, Authorization Server, AI Agent, gateway, MCP, and Resource Server](./assets/core_15_idjag_flow.svg)

## Finally

Thank you for following along. Hope it was helpful.

You have connected user sign-in to delegated API access. Athenz policies control token issuance and exchange; the proxy and API enforce each token's audience and scopes. Changes to role membership affect new grants after ZTS observes them, while issued tokens can remain usable until they expire.

If you found this tutorial useful, please consider giving either repository a ⭐ on GitHub!

| Repository                                                                       | Stars                                                                                                                                                                                                   | Forks                                                                                                                                                                                              |
|----------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| [Root repository](https://github.com/mlajkim/id-jag-the-hard-way)                | [![Root repository stars](https://img.shields.io/github/stars/mlajkim/id-jag-the-hard-way?style=flat-square&label=stars)](https://github.com/mlajkim/id-jag-the-hard-way/stargazers)                    | [![Root repository forks](https://img.shields.io/github/forks/mlajkim/id-jag-the-hard-way?style=flat-square&label=forks)](https://github.com/mlajkim/id-jag-the-hard-way/forks)                    |
| [Athenz community fork](https://github.com/athenz-community/id-jag-the-hard-way) | [![Athenz community stars](https://img.shields.io/github/stars/athenz-community/id-jag-the-hard-way?style=flat-square&label=stars)](https://github.com/athenz-community/id-jag-the-hard-way/stargazers) | [![Athenz community forks](https://img.shields.io/github/forks/athenz-community/id-jag-the-hard-way?style=flat-square&label=forks)](https://github.com/athenz-community/id-jag-the-hard-way/forks) |

If you run into any issues or have questions, feel free to [open an issue](https://github.com/mlajkim/id-jag-the-hard-way/issues).
