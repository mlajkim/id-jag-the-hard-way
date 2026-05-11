|                  Previous                  |      Current       | Next |
|:------------------------------------------:|:------------------:|:----:|
| [AI Client Agent](./08-ai-client-agent.md) | **Token Exchange** | n/a  |

# Token Exchange

🟡 TODO: Requires rephrasing with AI

In this tutorial, we will fix the "Not Authorized for Token Impersonation" error we encountered in the previous section. This error occurred because the MCP server attempted to exchange the Access Token it received from the AI client for a new token, but it lacked the necessary permissions to do so.

We will use the **OAuth 2.0 Token Exchange** (RFC 8693) mechanism to resolve this. The MCP server will exchange the user's Access Token for a new token that grants it permission to access the API server on behalf of the user.

## Allow MCP Server to exchange given Access Token

