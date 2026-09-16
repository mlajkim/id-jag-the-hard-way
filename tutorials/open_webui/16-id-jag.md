|                    Previous                    |         Current         |                      Next                      |
|:----------------------------------------------:|:-----------------------:|:----------------------------------------------:|
| [AI Client Gateway](./15-ai-client-gateway.md) | **ID-JAG — Open WebUI** | *None: You are at the end of the tutorial! 🎉* |

# ID-JAG — Open WebUI

In this tutorial, we will finally resolve the authorization issues encountered in the previous step. We will configure the proper token exchange policies in Athenz, allowing the AI Client Gateway to successfully exchange your Keycloak ID Token for an ID-JAG token. Once these permissions are in place, we will execute the end-to-end prompt to confirm the integration works seamlessly.

<!-- TOC depthFrom:2 depthTo:2 -->

- [Grant Permissions to `ai.open-webui`](#grant-permissions-to-aiopen-webui)
- [Verify](#verify)
- [What's happened?](#whats-happened)
- [Finally](#finally)

<!-- /TOC -->

## Grant Permissions to `ai.open-webui`

Because `ai.open-webui` acts on behalf of our user (`human.idjag-learner`), we need to explicitly authorize it to exchange the login ID Token for an ID-JAG token. We must grant it exchange permission for the API role and the MCP access role.

Create one role for each exchange target:

```sh
./tools/athenz/create-role.sh "api" "docs-getter-jag-exchanger"
./tools/athenz/create-role.sh "api" "mcp-accessor-jag-exchanger"
```

In Athenz, you must allow the `zts.jag_exchange` action on the target roles:

```sh
./tools/athenz/add-policy.sh "api" "docs-getter-jag-exchanger" "zts.jag_exchange" "role.docs-getter"
./tools/athenz/add-policy.sh "api" "mcp-accessor-jag-exchanger" "zts.jag_exchange" "role.mcp-accessor"
```

```sh
#   ·  Creating Policy: api:policy.docs-getter-jag-exchanger_zts_jag_exchange_role_docs-getter...
#   ✔  Policy created: api:policy.docs-getter-jag-exchanger_zts_jag_exchange_role_docs-getter
#   ·  Creating Policy: api:policy.mcp-accessor-jag-exchanger_zts_jag_exchange_role_mcp-accessor...
#   ✔  Policy created: api:policy.mcp-accessor-jag-exchanger_zts_jag_exchange_role_mcp-accessor
```

Next, add `ai.open-webui` as a member of both roles:

```sh
./tools/athenz/add-role-member.sh "api" "docs-getter-jag-exchanger" "ai.open-webui"
./tools/athenz/add-role-member.sh "api" "mcp-accessor-jag-exchanger" "ai.open-webui"
```

```sh
#   ·  Adding Member ai.open-webui to Role: api:role.docs-getter-jag-exchanger...
#   ✔  ai.open-webui  →  api:role.docs-getter-jag-exchanger
#   ·  Adding Member ai.open-webui to Role: api:role.mcp-accessor-jag-exchanger...
#   ✔  ai.open-webui  →  api:role.mcp-accessor-jag-exchanger
```

## Verify

Follow the steps below to verify the setup.

Now, return to the AI Agent UI and test the exact same prompt that failed previously:

```
get docs!
```

![16_successful_attrival_from_server](./assets/16_successful_attrival_from_server.png)

🎉 ID-JAG worked! You got the docs!

## What's happened?

The logs show each authorization boundary in the chain.

1. The AI Client Gateway resolved the signed-in user's Keycloak ID token from the Open WebUI session, exchanged it for an ID-JAG token, and then fetched an Athenz Access Token.

```sh
kubectl logs -n ai deployment/ai-client-gateway --tail=30
```

```sh
# [Athenz ID-JAG] 🔄 Attempting to exchange new ID-JAG with id-token for scope [api:role.docs-getter api:role.mcp-accessor] ...
# [Athenz ID-JAG] 🎯 Target ZTS for ID-JAG: https://athenz-zts-server.athenz:4443/zts/v1/oauth2/token
# [Athenz ID-JAG] 🎫 Granted scope in ID-JAG: ["api:role.docs-getter","api:role.mcp-accessor"]
# [Athenz AT] Fetching Athenz Access Token using ID-JAG ...
# [Athenz AT] 🎯 Target ZTS for AT: https://athenz-zts-server.athenz:4443/zts/v1/oauth2/token
# [Athenz AT] 🔑 Successfully fetched Athenz Access Token. Granted scope: ["docs-getter","mcp-accessor"]
```

2. MCP Runtime Proxy validates the token before forwarding a protected call. Its [verifier](../../components/mcp-runtime-proxy/src/auth.ts) accepts only `alg=RS256` and `typ=at+jwt`, verifies the signature against trusted ZTS signing keys, checks `exp` and any `nbf` restriction, requires audience `api`, and checks the `api:role.mcp-accessor` scope.

Inspect the `auth-proxy` container, which runs MCP Runtime Proxy:

```sh
kubectl logs -n api deployment/mcp -c auth-proxy --tail=50
```

Find an `access_token_verified` event. It is emitted only after all of those checks pass. Check its `audiences`, `scopes`, `keyId`, and `expiresInSeconds`, then match its `requestId` to a `request_completed` event with `upstreamStatus: 200`. Short scopes such as `mcp-accessor` are accepted only when `api` is the sole audience.

A public discovery request can also complete successfully, so `request_completed` alone does not confirm token validation. Reading the JWT's `alg` header alone does not verify its signature either.

3. The existing MCP adapter still performs the downstream token exchange in this tutorial. It authenticates as `api.api-mcp` and exchanges the incoming token for an API-specific `docs-getter` Access Token before calling the API.

<details>
<summary>Confirm the adapter's token exchange</summary>

```sh
kubectl logs -n api deployment/mcp -c mcp --tail=20
```

Look for a successful `[Token Exchange]` entry requesting `api:role.docs-getter` and granting `docs-getter`.

</details>

4. The API independently [validates the exchanged token](../../components/idthw-demo-api/src/auth.ts) using trusted ZTS signing keys, checks its type, lifetime, and audience, and requires `api:role.docs-getter` before returning the docs.

```sh
kubectl logs -n api deployment/api-server --tail=20
```

```sh
# Look for event "request_completed", method "GET", status 200.
```

At every hop, the Principle of Least Privilege was enforced — each component only held the minimum permissions it needed.

## Finally

Thank you for following along. Hope it was helpful.

If you found this tutorial helpful, please consider giving either repository a ⭐ on GitHub!

| Repository                                                                       | Stars                                                                                                                                                                                                   | Forks                                                                                                                                                                                              |
|----------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| [Root repository](https://github.com/mlajkim/id-jag-the-hard-way)                | [![Root repository stars](https://img.shields.io/github/stars/mlajkim/id-jag-the-hard-way?style=flat-square&label=stars)](https://github.com/mlajkim/id-jag-the-hard-way/stargazers)                    | [![Root repository forks](https://img.shields.io/github/forks/mlajkim/id-jag-the-hard-way?style=flat-square&label=forks)](https://github.com/mlajkim/id-jag-the-hard-way/forks)                    |
| [Athenz community fork](https://github.com/athenz-community/id-jag-the-hard-way) | [![Athenz community stars](https://img.shields.io/github/stars/athenz-community/id-jag-the-hard-way?style=flat-square&label=stars)](https://github.com/athenz-community/id-jag-the-hard-way/stargazers) | [![Athenz community forks](https://img.shields.io/github/forks/athenz-community/id-jag-the-hard-way?style=flat-square&label=forks)](https://github.com/athenz-community/id-jag-the-hard-way/forks) |

If you run into any issues or have questions, feel free to [open an issue](https://github.com/mlajkim/id-jag-the-hard-way/issues).
