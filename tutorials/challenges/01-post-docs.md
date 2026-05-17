|         Previous          |         Current          | Next |
|:-------------------------:|:------------------------:|:----:|
| [ID-JAG](../14-id-jag.md) | **Challenge: Post docs** | n/a  |

# Challenge: Successfully Post Docs

> [!NOTE]
> The challenge has been tested and proven solvable.

You might have noticed that the API server also has the capability to create documentation. However, if you try to use it right now, your request will be denied when you use a prompt like this:

```
Create a new doc for me, with title “I learned a lot through the id-jag-the-hard-way”

and its content “it was fun!”
```

Can you apply what you've learned so far to fix the permission issue and successfully post a new document? Give it a try!

> [!WARNING]
> You must solve WITHOUT modifying the source code of each component. Configuration changes are enough.

## Solution

> [!NOTE]
> The solution will be revealed soon.

# Next Challenge

More content is on the way! Stay tuned for the following advanced topics and solutions:

- Manual Token Fetching: Learn how to retrieve the ID Token, ID-JAG token, and Access Token directly via the command line.
- Direct API Deletion: Authorize document deletion when using a manually fetched Access Token.
- Agent-Specific Deny Policies: Explicitly deny document deletion when requested through the AI Client Agent, even if the human user holds the required deletion permissions.
- Secure Identity Provider: Configure Keycloak to run securely over HTTPS.
- Strict Service-to-Service Security: Enforce mTLS (Mutual TLS) authentication between the MCP Server and the AI Client Gateway.
- Alternative AI Clients: Switch the client interface from Open WebUI to Claude, ensuring seamless integration with the AI Client Gateway.
