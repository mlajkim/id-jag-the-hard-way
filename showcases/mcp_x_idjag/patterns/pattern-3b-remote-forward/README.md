# Pattern 3b: remote id_token acquisition and remote ID-JAG exchange, AT forwarded directly to MCP

**Status: Not implemented (placeholder)**

See the [showcase README](../../README.md) for the overview and pattern comparison.

The AS does not return the Access Token to the Client. Instead, it attaches the token to the actual MCP request and forwards it. The Client receives a **session cookie or opaque session ID** instead of an Access Token, requiring a BFF (Backend For Frontend) / Token Handler pattern.

## Architecture

```mermaid
flowchart LR
    subgraph Local["Local (Client machine)"]
        Client
    end
    subgraph Remote["Remote (server side)"]
        AS["AS (= BFF)"]
        Exchanger["ID-JAG Exchanger"]
        IdP
        ZTS
        ZMS
        MCP
        BE["backend-api"]
        AS -->|Pass id_token and request an ID-JAG exchange| Exchanger
    end

    Client -->|Standard OAuth PKCE only<br/>id_token is not passed| AS
    AS -->|OIDC RP authentication| IdP
    Exchanger -->|Request ID-JAG with identity + id_token, then exchange for AT| ZTS
    ZTS -->|Check role| ZMS
    Client -->|Present session ID only| AS
    AS -->|Attach AT and forward| MCP
    MCP -->|Exchange for a delegated token| ZTS
    MCP -->|Present delegated AT| BE
    Client -. "Cannot reach MCP directly (all requests go through AS)" .-> MCP

    style Local fill:#d2ebff,stroke:#333
    style Remote fill:#ffebd2,stroke:#333
```

The differences from 3a are that the **Client → MCP path is not used in production** and that the AS contains both the Exchanger and the session store. The AS combines the roles of OAuth AS, ID-JAG Exchanger, and BFF session broker.

## Sequence

```mermaid
sequenceDiagram
    actor User as "Human user"
    box rgb(210,235,255) Local (Client machine)
    participant Client
    end
    box rgb(255,235,210) Remote (server side)
    participant AS as "AS (= BFF)"
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
    Client->>AS: Request authorization code with PKCE (id_token is not passed)
    AS->>IdP: Authenticate user (AS acts as OIDC RP)
    IdP-->>AS: id_token
    AS->>Exchanger: Pass id_token and request an ID-JAG exchange
    Exchanger->>ZTS: Request a delegation assertion (ID-JAG) with the Exchanger (= AS) identity and id_token
    ZTS->>ZMS: Check role membership
    ZMS-->>ZTS: Allow
    ZTS-->>Exchanger: Issue ID-JAG
    Exchanger->>ZTS: Exchange ID-JAG for an Access Token
    ZTS-->>Exchanger: Issue Access Token
    Exchanger-->>AS: Return Access Token
    Note over AS: Store the Access Token in the server-side session store and do not return it to the Client
    AS-->>Client: Return session cookie/session ID

    Client->>AS: Send the actual MCP request with the session ID
    AS->>AS: Look up the Access Token for the session ID
    AS->>MCP: Forward the request with the Access Token
    MCP->>MCP: Validate signature, aud, and scope
    Note over MCP,BE: Only when the backend-api must be called
    MCP->>ZTS: Exchange the previous AT with the MCP identity
    ZTS->>ZMS: Check the role for backend-api
    ZTS-->>MCP: Issue a new Access Token
    MCP->>BE: Present delegated Access Token
    BE->>BE: Validate signature, aud, and scope
    BE-->>MCP: Response
    MCP-->>AS: Response
    AS-->>Client: Response
```

**Characteristics**: Neither the id_token nor the Access Token reaches the Client; the Client handles only a session identifier. This improves credential protection, but the AS must operate the session store and handle session revocation and CSRF protection.

Discovery begins with direct access to MCP, as in 3a. Because the Client never receives the actual Bearer AT and holds only a session identifier, subsequent tool calls must go through the AS.
