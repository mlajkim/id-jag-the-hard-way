# Pattern 2a: local id_token acquisition, remote ID-JAG exchange, AT returned to Client

**Status: Not implemented (placeholder)**

See the [showcase README](../../README.md) for the overview and pattern comparison.

The Client obtains an id_token as an OIDC RP, presents it to a separate Exchanger, and receives an Access Token that it presents directly to MCP.

## Architecture

```mermaid
flowchart LR
    subgraph Local["Local (Client machine)"]
        Client
    end
    subgraph Remote["Remote (server side)"]
        IdP
        Exchanger["ID-JAG Exchanger"]
        ZTS
        ZMS
        MCP
        BE["backend-api"]
    end

    Client -->|Authenticate user| IdP
    Client -->|Present id_token<br/>DPoP + pinning required| Exchanger
    Exchanger -->|Request ID-JAG with identity + id_token, then exchange for AT| ZTS
    ZTS -->|Check role| ZMS
    Client -->|Present Access Token| MCP
    MCP -->|Exchange for a delegated token| ZTS
    MCP -->|Present delegated AT| BE

    style Local fill:#d2ebff,stroke:#333
    style Remote fill:#ffebd2,stroke:#333
```

The Client reaches both the Exchanger and MCP. Presenting the id_token to the Exchanger requires DPoP and public-key pinning, while presenting the Access Token to MCP relies on MCP's own signature, audience, and scope validation.

## Sequence

```mermaid
sequenceDiagram
    actor User as "Human user"
    box rgb(210,235,255) Local (Client machine)
    participant Client
    end
    box rgb(255,235,210) Remote (server side)
    participant IdP
    participant Exchanger as "ID-JAG Exchanger"
    participant ZTS
    participant ZMS
    participant MCP
    participant BE as "backend-api"
    end

    User->>Client: Request an operation
    Client->>MCP: Initial request (no token)
    MCP-->>Client: 401 Unauthorized + WWW-Authenticate (resource_metadata URL)
    Client->>MCP: Fetch Protected Resource Metadata (/.well-known/oauth-protected-resource, RFC 9728)
    MCP-->>Client: Return Exchanger endpoint and required scope
    Client->>IdP: Authenticate user
    IdP-->>Client: id_token
    Client->>Exchanger: Present id_token and request Access Token
    Exchanger->>ZTS: Request a delegation assertion (ID-JAG) with the Exchanger identity and the id_token received from the Client
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

**Characteristics**: The Client must obtain an id_token as an OIDC RP, so the id_token reaches the end user's device.

The Protected Resource Metadata (RFC 9728) points the Client to the Exchanger endpoint. Because the Exchanger does not expose standard AS endpoints such as `/authorize` and `/token`, AS Metadata (RFC 8414) discovery is not used.

**Requirement**: Presenting the id_token to the Exchanger requires DPoP (RFC 9449) and public-key pinning. Because the id_token reaches the Client device, presenting it as a plain Bearer token would allow a stolen token to be misused. If the IdP cannot embed `cnf.jkt` in the id_token, the Exchanger must pre-register a public key for each Client and compare it with the key in the DPoP proof. DPoP validation includes the signature, `iat` freshness, and `jti` replay detection.
