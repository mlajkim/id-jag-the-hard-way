# Pattern 2b: local id_token acquisition, remote ID-JAG exchange, AT forwarded directly to MCP

**Status: Not implemented (placeholder)**

See the [showcase README](../../README.md) for the overview and pattern comparison.

The Exchanger does not return the Access Token to the Client. Instead, it attaches the token to the actual MCP request and forwards it. The Exchanger's role expands from a token exchange service to a gateway that relays real traffic.

## Architecture

```mermaid
flowchart LR
    subgraph Local["Local (Client machine)"]
        Client
    end
    subgraph Remote["Remote (server side)"]
        IdP
        Exchanger["ID-JAG Exchanger<br/>(= Gateway)"]
        ZTS
        ZMS
        MCP
        BE["backend-api"]
    end

    Client -->|Authenticate user| IdP
    Client -->|id_token + actual request<br/>DPoP + pinning required| Exchanger
    Exchanger -->|Request ID-JAG with identity + id_token, then exchange for AT| ZTS
    ZTS -->|Check role| ZMS
    Exchanger -->|Attach AT and forward| MCP
    MCP -->|Exchange for a delegated token| ZTS
    MCP -->|Present delegated AT| BE
    Client -. "Cannot reach MCP directly" .-> MCP

    style Local fill:#d2ebff,stroke:#333
    style Remote fill:#ffebd2,stroke:#333
```

The main difference from 2a is that the **Client → MCP path does not exist**. MCP is hidden behind the Exchanger, which handles both token exchange and data-plane traffic. This makes the Exchanger prone to becoming a single point of failure or bottleneck.

## Sequence

```mermaid
sequenceDiagram
    actor User as "Human user"
    box rgb(210,235,255) Local (Client machine)
    participant Client
    end
    box rgb(255,235,210) Remote (server side)
    participant IdP
    participant Exchanger as "ID-JAG Exchanger (= Gateway)"
    participant ZTS
    participant ZMS
    participant MCP
    participant BE as "backend-api"
    end

    User->>Client: Request an operation
    Client->>Exchanger: Initial request (no token)
    Note over Client,Exchanger: MCP is hidden behind the Exchanger (Gateway) and is not directly reachable by the Client
    Exchanger-->>Client: 401 Unauthorized + WWW-Authenticate (resource_metadata URL)
    Client->>Exchanger: Fetch Protected Resource Metadata (/.well-known/oauth-protected-resource, RFC 9728)
    Exchanger-->>Client: Return required scope
    Client->>IdP: Authenticate user
    IdP-->>Client: id_token
    Client->>Exchanger: Present id_token and the actual MCP request
    Exchanger->>ZTS: Request a delegation assertion (ID-JAG) with the Exchanger identity and id_token
    ZTS->>ZMS: Check role membership
    ZMS-->>ZTS: Allow
    ZTS-->>Exchanger: Issue ID-JAG
    Exchanger->>ZTS: Exchange ID-JAG for an Access Token
    ZTS-->>Exchanger: Issue Access Token
    Note over Exchanger,MCP: The Access Token is not returned to the Client and is attached to the request before forwarding
    Exchanger->>MCP: Forward the request with the Access Token
    MCP->>MCP: Validate signature, aud, and scope
    Note over MCP,BE: Only when the backend-api must be called
    MCP->>ZTS: Exchange the previous AT with the MCP identity
    ZTS->>ZMS: Check the role for backend-api
    ZTS-->>MCP: Issue a new Access Token
    MCP->>BE: Present delegated Access Token
    BE->>BE: Validate signature, aud, and scope
    BE-->>MCP: Response
    MCP-->>Exchanger: Response
    Exchanger-->>Client: Response
```

**Characteristics**: The Access Token never reaches the Client, reducing its storage and exposure risk. However, every request passes through the Exchanger, making it a potential single point of failure and bottleneck.

Unlike 2a, MCP is hidden behind the Exchanger (Gateway). Therefore, the initial request without a token, the 401 response, and Protected Resource Metadata retrieval all target the Exchanger itself.

**Requirement**: As in 2a, presenting the id_token to the Exchanger requires DPoP and public-key pinning. In addition, the Exchanger needs a session store that caches the Access Token issued by the initial exchange. Subsequent requests must validate the DPoP proof and use the cached Access Token.
