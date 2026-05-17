|                    Previous                    |  Current   | Next |
|:----------------------------------------------:|:----------:|:----:|
| [AI Client Gateway](./13-ai-client-gateway.md) | **ID-JAG** | n/a  |

# ID-JAG

🟡 todo; run ai rephrase

In this tutorial, we will finally fix the issues we saw in the previous tutorial.
We will grant the proper token exchange policies in Athenz, allowing the AI Client Gateway to successfully exchange the ID Token for an ID-JAG token. Once that is done, we will be able to successfully execute the end-to-end prompt.

## Give permission to `ai.open-webui`

Since  `ai.open-webui` will do the work on behalf of us `human.idjag-learner`, we need to give permission to `ai.open-webui` to exchange the `id-token` you get when you sign in into `ID_JAG` token. We also need to give permission to `ai.open-webui` to access the `api` domain.

First, create a role under domain `api`:

```sh
./create-role.sh "api" "token-exchangable-ai-agents"
```

In Athenz, you need to allow `zts.jag_exchange` on the target role, which is the `role.docs-getter`, which can be done here:

```sh
./add-policy.sh "api" "token-exchangable-ai-agents" "zts.jag_exchange" "role.docs-getter"

# Creating Policy: api:policy.zts.jag_exchange...
```

Also, the ai agent has to token exchange into the `api:role.mcp-accessor` as well, so let's add that permission as well:

```sh
./add-policy.sh "api" "token-exchangable-ai-agents" "zts.jag_exchange" "role.mcp-accessor"
```

Finally add the ai agent `ai.open-webui` to the role `api.token-exchangable-ai-agents`:

```sh
./add-role-member.sh "api" "token-exchangable-ai-agents" "ai.open-webui"

# Adding Member ai.open-webui to Role: api:role.token-exchangable-ai-agents...
```

And finally, since `ai.open-webui` will connec to the MCP server on behalf, which requires to be a member of the role `api:role.mcp-accessor` that we created, we need to add the agent as a member as well:

```sh
./add-role-member.sh "api" "mcp-accessor" "ai.open-webui"
```

## Verification

Now, test the AI Agent with the exact same prompt that failed previously:

```
get docs!
```
