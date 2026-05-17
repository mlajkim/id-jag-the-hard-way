|                    Previous                    |  Current   | Next |
|:----------------------------------------------:|:----------:|:----:|
| [Identity Provider](./11-identity-provider.md) | **ID-JAG** | n/a  |

# ID-JAG
🟡 todo; run ai rephrase

In this tutorial, we will follow the ID-JAG, Identity Assertion JWT Authorization Grant.

## What is ID-JAG?

ID-JAG is a draft for a new authorization standard currently proposed primarily by companies like Okta, where it extends the trust model of single sign-on (SSO) into the realm of API access. In short, it aims to apply the trust established with an IdP through SSO to API access between applications, or between an agent and a service.

You can learn more in details in the following section:

- [Identity Assertion JWT Authorization Grant - IETF](https://datatracker.ietf.org/doc/draft-ietf-oauth-identity-assertion-authz-grant/)
- [Why ID-JAG is the future of AI agent security - LY Corp. Tech Blog](https://techblog.lycorp.co.jp/en/20260417a)

## How ID-JAG specficiation helps us

When you login through Keycloak, the Keycloak generates an id-token that represents you, just like your ID. Through the ID-JAG process, we can

1. Exchange the id-token into ID-JAG token with new audience the `ai.open-webui` client
1. Fetch Access token with audience `api` and its scope with the `ai.open-webui` aud ID-JAG

This way we no longer have to manually insert access token for each tool. Also each  tool can be shared between every user in the ai client agent without any manual intervention.

## Run AI Client Proxy

ID-JAG is somewhat new and not all AI client agents support it yet. Also, if you want to have extra layers of security, such as not handing the Access Token to the AI Client Agent, we use the AI Client Proxy.

The proxy is included in this project specifically. So try to do this:

```sh
make -C ai_client_gateway local
```

And you will encounter an error following:

```sh
# Error: ENOENT: no such file or directory, open '~/id-jag-the-hard-way-workspace/ai_client_gateway/certs/open-webui.crt'
#     at Object.openSync (node:fs:563:18)
#     at Object.readFileSync (node:fs:447:35)
#     at file:///Users/jekim/id-jag-the-hard-way-workspace/ai_client_gateway/src/utils/idtokenIntoIdjag.js:17:12
```

This is because the AI Client Proxy requires the TLS certificate that represents itself.

```sh
mkdir -p ./ai_client_gateway/certs
./create-private-key.sh "./ai_client_gateway/certs/open-webui"

# Generating RSA key pair for: ./ai_client_gateway/certs/open-webui...
# Done! Keys generated: ./ai_client_gateway/certs/open-webui.key, ./ai_client_gateway/certs/open-webui.public.key
```

We will create a service `ai.open-webui`, and since we do not hace the TLD yet, we will do:

```sh
./create-tld.sh "ai"

# Creating TLD: ai...
# {"description":"TLD for ai","org":"ajkimkim","auditEnabled":false,"ypmId":0,"autoDeleteTenantAssumeRoleAssertions":false,"name":"ai","modified":"2026-05-16T07:44:39.295Z","id":"17e2d0f0-50fb-11f1-8af4-88f84977247b"}
# Done!
```

Then create a service with the key created above:

```sh
./create-service.sh "ai" "open-webui" "./ai_client_gateway/certs/open-webui.public.key"

# Registering Service: ai.open-webui...
```

Enable cert provider for the service `api.api-mcp`:

```sh
./enable-cert-provider.sh "ai" "open-webui"

# [Template(s) successfully applied to domain]
```

And finally generate X.509 Certificate:

```sh
./fetch-cert.sh "ai" "open-webui" "./ai_client_gateway/certs/open-webui.key" "v1"

# Fetching X.509 Certificate for ai.open-webui...
# Done! Certificate saved to: ./ai_client_gateway/certs/open-webui.crt
```

Finally, the `ai_client_gateway` expects Athenz CA certificate, which you can simply copy from `athenz_dist/certs`

```sh
cp ./athenz_dist/certs/ca.cert.pem ./ai_client_gateway/certs/ca.crt
```

Check certificate created:
```sh
ls -al ./ai_client_gateway/certs/

# total 24
# drwxr-xr-x   5 mlajkim  staff   160 May 2 16:47 .
# drwxr-xr-x  13 mlajkim  staff   416 May 2 16:43 ..
# -rw-r--r--   1 mlajkim  staff  1834 May 2 16:49 ca.crt
# -rw-r--r--   1 mlajkim  staff  1716 May 2 16:47 open-webui.crt
# -rw-------   1 mlajkim  staff  1675 May 2 16:43 open-webui.key
# -rw-r--r--   1 mlajkim  staff   451 May 2 16:43 open-webui.public.key
```



## Run Server Again

With certificate, we expect the `ai_client_gateway` to run successfully.

```sh
make -C ai_client_gateway local

# ...
# 🚀 OpenWebUI OpenAPI Gateway listening on 0.0.0.0:3101
# 🔗 Upstream API: http://localhost:8102
# 🌍 Public Base URL: http://localhost:3101
```

## Modify Tool Target

Instead of directly setting the target to the MCP, we will now set the target to the `ai_client_gateway`. 

Login as admin that has the permission to change the tool on Open WebUI, then navigate to `User Icon` > `Admin Panel` > `Settings` > `Integrations`,

Click the configure icon for the API MCP Server.

Make the following change:

1. Change the MCP Authorization Server URL to the proxy URL `http://localhost:3101`.
1. Change the 

![13_edit_connection_of_tool](./assets/13_edit_connection_of_tool.png)

## Verification

Now re-login as non-admin account, which will be `human.idjag-learner` on Open WebUI  

![13_logged_in_as_idjag_learner](./assets/13_logged_in_as_idjag_learner.png)

Now try asking "Can you get the weather for the following location?".  
