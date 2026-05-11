# FAQs for ID-JAG

> [!TIP]
> AJ, Keep asking yourself what kind of FAQs out there, with AI.

<!-- TOC -->

- [FAQs for ID-JAG](#faqs-for-id-jag)
  - [Can I simply make MCP pass down the received AT to the API Server?](#can-i-simply-make-mcp-pass-down-the-received-at-to-the-api-server)
  - [ID-JAG](#id-jag)
    - [What's the point of id_token=>id_jag=>AT, when you can simply do id_token=>id_jag?](#whats-the-point-of-id_tokenid_jagat-when-you-can-simply-do-id_tokenid_jag)
  - [Token Exchange](#token-exchange)
  - [What's the difference between Impersonation and Delegation?](#whats-the-difference-between-impersonation-and-delegation)
  - [Enterprise Level Operation](#enterprise-level-operation)
    - [What kind of tasks that employees (end user of AI Client Agent) do?](#what-kind-of-tasks-that-employees-end-user-of-ai-client-agent-do)
    - [What kind of tasks that IdP should do?](#what-kind-of-tasks-that-idp-should-do)
    - [What kind of tasks that AI Client Provider should do?](#what-kind-of-tasks-that-ai-client-provider-should-do)
    - [What kind of tasks that API Provider Should do?](#what-kind-of-tasks-that-api-provider-should-do)
    - [What kind of tasks that AS provder should do?](#what-kind-of-tasks-that-as-provder-should-do)
  - [Athenz IAM](#athenz-iam)
    - [What is action "zts.token_source_exchange" on "api:api" really mean?](#what-is-action-ztstoken_source_exchange-on-apiapi-really-mean)
    - [What is action "zts.token_target_exchange" on "api:api:role.docs-getter" really mean?](#what-is-action-ztstoken_target_exchange-on-apiapiroledocs-getter-really-mean)
  - [AI User](#ai-user)
    - [Can we set service account (non-human ID) instead of AI User?](#can-we-set-service-account-non-human-id-instead-of-ai-user)

<!-- /TOC -->


## Can I simply make MCP pass down the received AT to the API Server?

No, You are not supposed to pass down


> If the MCP server makes requests to upstream APIs, it may act as an OAuth client to them. The access token used at the upstream API is a separate token, issued by the upstream authorization server. The MCP server MUST NOT pass through the token it received from the MCP client.
> - https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization

## ID-JAG

### What's the point of id_token=>id_jag=>AT, when you can simply do id_token=>id_jag?


## Token Exchange

## What's the difference between Impersonation and Delegation?



## Enterprise Level Operation

### What kind of tasks that employees (end user of AI Client Agent) do?

### What kind of tasks that IdP should do?

### What kind of tasks that AI Client Provider should do?

### What kind of tasks that API Provider Should do?

### What kind of tasks that AS provder should do?


## Athenz IAM

### What is action "zts.token_source_exchange" on "api:api" really mean?

### What is action "zts.token_target_exchange" on "api:api:role.docs-getter" really mean?



## AI User


### Can we set service account (non-human ID) instead of AI User?

(from Sudo-san)