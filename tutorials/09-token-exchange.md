|                  Previous                  |      Current       |                              Next                              |
|:------------------------------------------:|:------------------:|:--------------------------------------------------------------:|
| [AI Client Agent](./08-ai-client-agent.md) | **Token Exchange** | [Protect MCP Server](./10-protect-mcp-server-with-keycloak.md) |

# Token Exchange

🟡 TODO: Requires rephrasing with AI

In this tutorial, we will fix the "Not Authorized for Token Impersonation" error we encountered in the previous section. This error occurred because the MCP server attempted to exchange the Access Token it received from the AI client for a new token, but it lacked the necessary permissions to do so.

We will use the **OAuth 2.0 Token Exchange** (RFC 8693) mechanism to resolve this. The MCP server will exchange the user's Access Token for a new token that grants it permission to access the API server on behalf of the user.

## Allow MCP Server to exchange given Access Token

Even if the original requester's permission has access right to `get` on `api:docs` resource, it does not mean that anyone can exchange the access token for the requester. We need to have another separate role to specfically allow the impersonation or token exchange.

So to do that, let's add a role `api:role.docs-token-exchanger`, where name implies that the members of this role can exchange the access token for the target scope `api:role.docs-getter`:

```sh
./create-role.sh "api" "docs-token-exchanger"
```

In Athenz, you not only has to explicit allow where to exchange into, but also where it is originally from. Since MCP server is within the domain `api`, we can add both policies here:

```sh
./add-policy.sh "api" "docs-token-exchanger" "zts.token_source_exchange" "api"
./add-policy.sh "api" "docs-token-exchanger" "zts.token_target_exchange" "api:role.docs-getter"
```

Finally add a member that you want to allow to exchange (despite the exchange could have no permission to it):

```sh
./add-role-member.sh "api" "docs-token-exchanger" "api.api-mcp"
```

## Verification

Now get the Access Token once again (just in case it is expired):

```sh
_scope="api:role.docs-getter"
_my_access_token=$(./fetch-access-token.sh \
  "./keys/idjag-learner.crt" \
  "./keys/idjag-learner.key" \
  "${_scope}" \
  "./keys/api_docs-getter.jwt")

cat "./keys/api_docs-getter.jwt"
```

Go to `User Icon` > `Admin Panel` > `Settings` > `Integrations` > `API MCP Server`'s Configure Icon

Attached the access token as we did last time:

![09_attach_access_token](./assets/09_attach_access_token.png)

And ask the AI Agent the following that we asked last time but failed:

```
get docs!
```

![09_succcesfully_get_docs_through_ai_for_the_first_time](./assets/09_succcesfully_get_docs_through_ai_for_the_first_time.png)

## What's happened?

With the new role to specficially allow its member to exchange an access token for a target scope, the MCP server can exchange the given access token into another token, as the following:

![09_arc_success_to_token_exchange](./assets/09_arc_success_to_token_exchange.png)

## What's next?

As the architecture above, we have been protected the API Server with the Athenz AT. However, at this point, the MCP server itself is never protected and anyone can access the MCP server. despite the core server is the API, you do not want to simply expose your MCP server without any protection, so next we will add an authentication layer for the MCP server so that only the authenticated users can access the MCP server.

Next: [Protect MCP Server](./10-protect-mcp-server-with-keycloak.md)
