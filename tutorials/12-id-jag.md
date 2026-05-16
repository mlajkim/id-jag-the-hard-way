|                    Previous                    |  Current   | Next |
|:----------------------------------------------:|:----------:|:----:|
| [Identity Provider](./11-identity-provider.md) | **ID-JAG** | n/a  |

# ID-JAG

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

## Make Athenz Server Trust the Keyclaok Server

So far we have running Athenz and Keycloak locally, but Athenz does not trust any IdP unless it is configured specifically. To exchange Keycloak generated id-token into ID-JAG token, Athenz server needs to trust & verify Keycloak server.

Every Athuorization Server has its own rule to trust, but in Athenz we need to create a plugin & give a setting to use the plugin.

Forunately we already have one so you do not have to built. Clone the project:

```sh
git clone git@github.com:athenz-community/keycloak-token-exchange-identity-provider-manifest.git keycloak_token_exchange_provider
```

And we are going to run `make` to patch the plugin to the Athenz server:

```sh
kubectl patch deployment athenz-zts-server -n athenz --patch-file keycloak_token_exchange_provider/hack/static/zts-plugin-jar-mount-patch.yaml
```

> [!NOTE]
> You just run the following patch yaml: https://github.com/athenz-community/keycloak-token-exchange-identity-provider-manifest/blob/main/hack/static/zts-providers-config-patch.yaml

