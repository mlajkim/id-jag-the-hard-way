# Pattern 3a: remote id_token + remote ID-JAG exchange, Access Token returned to Client

**Status: Implemented**

This implements Pattern 3a from the [showcase README](../../README.md). The Client never handles the id_token and presents the **Athenz Access Token** received from the Authorization Server directly to MCP.

`mcp-reverse-proxy` and `simple-mcp-server` are located in [../../components](../../components), and `./mcp-oauth-proxy` is a git submodule referencing a fork of [AthenZ/mcp-oauth-proxy](https://github.com/AthenZ/mcp-oauth-proxy).

## Overview

The AS and Exchanger run in the same process on the remote side. The Client does not communicate directly with the IdP, so the **id_token never appears on the Client side**. The Client connects only to the AS and MCP and uses standard OAuth PKCE.

```mermaid
sequenceDiagram
    actor User as "Human user"
    box rgb(210,235,255) Local (Client machine)
    participant Client
    end
    box rgb(255,235,210) Remote (server side)
    participant AS
    participant Exchanger as "ID-JAG Exchanger"
    participant IdP
    participant ZTS
    participant ZMS
    participant MCP
    participant BE as "backend-api"
    end

    User->>Client: Request an operation
    Client->>MCP: Initial request (no token)
    MCP-->>Client: 401 Unauthorized + WWW-Authenticate (resource_metadata URL)
    Client->>MCP: Fetch Protected Resource Metadata (/.well-known/oauth-protected-resource, RFC 9728)
    MCP-->>Client: Return AS location and scopes_supported
    Client->>AS: Fetch AS Metadata (/.well-known/oauth-authorization-server, RFC 8414)
    AS-->>Client: Return authorization_endpoint and token_endpoint
    Client->>AS: Request an authorization code with PKCE (id_token is not passed)
    AS->>IdP: Authenticate the user as an OIDC RP
    IdP-->>AS: id_token
    Note over AS,Exchanger: Exchanger is an internal AS function running in the same process with no network hop
    AS->>Exchanger: Pass the id_token and request an ID-JAG exchange
    Exchanger->>ZTS: Request a delegation assertion with the Exchanger identity, which is the AS identity, and the id_token
    ZTS->>ZMS: Check role membership
    ZMS-->>ZTS: Allow
    ZTS-->>Exchanger: Issue ID-JAG
    Exchanger->>ZTS: Exchange ID-JAG for an Access Token
    ZTS-->>Exchanger: Issue Access Token
    Exchanger-->>AS: Return Access Token
    AS-->>Client: Return Access Token through the authorization code flow

    Client->>MCP: Present Access Token
    MCP->>MCP: Validate signature, aud, and scope
    Note over MCP,BE: Only when the backend-api must be called
    MCP->>ZTS: Exchange the previous AT with the MCP identity
    ZTS->>ZMS: Check the role for backend-api
    ZTS-->>MCP: Issue a new Access Token
    MCP->>BE: Present delegated Access Token
    BE->>BE: Validate signature, aud, and scope
    BE-->>MCP: Response
    MCP-->>Client: Response
```

**Characteristics**: This pattern uses a standard OAuth Authorization Server such as mcp-oauth-proxy (MoP). The Client never handles the id_token and uses only standard OAuth 2.1 PKCE.

The flow from the unauthenticated MCP request through `401` and discovery follows the MCP Authorization specification, including RFC 9728 Protected Resource Metadata and RFC 8414 AS Metadata. The Client discovers the AS location from MCP at runtime.

## Build and deploy

**Bootstrap the shared infrastructure first**

```sh
make -C showcases/mcp_x_idjag bootstrap-common
```

This builds the shared Kind, Keycloak, and Athenz infrastructure. The Athenz setup takes some time.

**Deploy Pattern 3a**

```sh
make -C showcases/mcp_x_idjag pattern-3a
```

This bootstraps and deploys Pattern 3a's roles, identities, API server, MCP, MoP, the backend-free echo MCP, and the routing-only Envoy Gateway.

To access the two public MCP endpoints locally, run:

```sh
make -C showcases/mcp_x_idjag pattern-3a-port-forward
```

`pattern-3a-port-forward` forwards the routing-only Envoy Gateway to local port 3001; the MoP remains on local HTTPS port 8082.

### Using it from Claude Code

Pattern 3a is compatible with Claude Code's built-in remote MCP OAuth flow. Claude Code discovers the Protected Resource Metadata from the MCP endpoint, follows the MoP Authorization Server metadata, opens Keycloak for the user login, and receives an Athenz Access Token through the standard authorization-code + PKCE flow. Do not add a static `Authorization` header.

Register the MCP endpoint with `claude mcp add` from the repository root. Keep `NODE_EXTRA_CA_CERTS` exported in the same shell that starts Claude Code:

```sh
export NODE_EXTRA_CA_CERTS="$PWD/showcases/mcp_x_idjag/patterns/pattern-3a-remote-return/mop-tls/ca.crt"
claude mcp add --scope local --transport http \
  pattern-3a-docs http://docs.pattern-3a.localhost:3001/mcp

# Optional: register the backend-free echo MCP as a second server.
claude mcp add --scope local --transport http \
  pattern-3a-echo http://echo.pattern-3a.localhost:3001/mcp

claude mcp list
claude
```

In Claude Code, run `/mcp`, select `pattern-3a-docs` or `pattern-3a-echo`, and complete the Keycloak login when prompted. Then use `get_k8s_docs` with the docs server or `echo_pattern_3a` with the echo server. The first server demonstrates the full MCP → ID-JAG → backend API chain; the echo server demonstrates MCP authorization without a backend call.

`NODE_EXTRA_CA_CERTS` is needed when Claude Code contacts the locally generated MoP CA during OAuth discovery and token exchange. If the Pattern 3a TLS files are recreated, export the variable again.
