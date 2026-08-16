# Pattern 1: local id_token acquisition and local ID-JAG exchange

**Status: Not implemented (placeholder)**

See the [showcase README](../../README.md) for the overview and pattern comparison.

The Client itself has a verifiable workload identity for Athenz ZTS and performs the id_token → ID-JAG → Access Token exchange within the Client process.

## Architecture

```mermaid
flowchart LR
    subgraph Local["Local (Client machine)"]
        Client
        Exchanger["ID-JAG Exchanger"]
        Client -.->|"Same process; no network hop"| Exchanger
    end
    subgraph Remote["Remote (server side)"]
        IdP
        ZTS
        ZMS
        MCP
        BE["backend-api"]
    end

    Client -->|Authenticate user| IdP
    Exchanger -->|Request ID-JAG with identity + id_token, then exchange for AT| ZTS
    ZTS -->|Check role| ZMS
    Client -->|Present Access Token| MCP
    MCP -->|Exchange for a delegated token| ZTS
    MCP -->|Present delegated AT| BE

    style Local fill:#d2ebff,stroke:#333
    style Remote fill:#ffebd2,stroke:#333
```

The defining characteristic is that the Client and Exchanger run in the same process. No network authentication or DPoP is required for the Exchanger.

## Sequence

```mermaid
sequenceDiagram
    actor User as "Human user"
    box rgb(210,235,255) Local (Client machine)
    participant Client
    participant Exchanger as "ID-JAG Exchanger"
    end
    box rgb(255,235,210) Remote (server side)
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
    MCP-->>Client: Return required role/scope (scopes_supported)
    Client->>IdP: Authenticate user
    IdP-->>Client: id_token
    Note over Client,Exchanger: Exchanger runs inside the Client process with no network hop
    Client->>Exchanger: Request an ID-JAG exchange with the id_token
    Exchanger->>ZTS: Request a delegation assertion with the Exchanger identity, which is the Client identity, and the id_token
    ZTS->>ZMS: Check role membership
    ZMS-->>ZTS: Allow
    ZTS-->>Exchanger: Issue ID-JAG
    Exchanger->>ZTS: Exchange ID-JAG for an Access Token
    ZTS-->>Exchanger: Issue Access Token
    Exchanger-->>Client: Return Access Token

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

**Characteristics**: The Client must have a verifiable workload identity for Athenz ZTS. This pattern is not suitable for general-purpose MCP clients running on an end-user device.

Protected Resource Metadata (RFC 9728) is used to let the Client learn the role/scope required by the connected MCP, not to discover a separate AS. Because the Exchanger runs in the same process, AS Metadata (RFC 8414) discovery is not required.
