|                    Previous                    |            Current            |           Next           |
|:----------------------------------------------:|:-----------------------------:|:------------------------:|
| [Identity Provider](./11-identity-provider.md) | **Trusted Identity Provider** | [ID-JAG](./13-id-jag.md) |

# Trusted Identity Provider

In this tutorial, we will make the authorization server (Athenz) to trust Keycloak as an identity provider.

## Learn what to do

So far we have running Athenz and Keycloak locally, but Athenz does not trust any IdP unless it is configured specifically. To exchange Keycloak generated id-token into ID-JAG token, Athenz server needs to trust & verify Keycloak server. Also Athenz does not know what kind of specific rules each IdP has the whole world.

So we need to:

- Let Athenz know how to verify IdP that we use (which will be Keycloak in our case)
- Let Athenz trust the IdP
- Let Athenz know where to go for (jwks_uri) when the trusted IdP signed token is arrived

## Install Plugin into ZTS Server


Every Athuorization Server has its own rule to trust, but in Athenz we need to create a plugin & give a setting to use the plugin.

Fortunately we already have one under the directory `keycloak_token_exchange_provider`. Now let's apply the patch to our Athenz server to use the plugin:

```sh
kubectl patch deployment athenz-zts-server -n athenz --patch-file keycloak_token_exchange_provider/hack/static/zts-plugin-jar-mount-patch.yaml
```

> [!NOTE]
> You just run the following patch yaml: https://github.com/athenz-community/keycloak-token-exchange-identity-provider-manifest/blob/main/hack/static/zts-providers-config-patch.yaml

Check if the JAR is stored inside the Athenz server:

```sh
kubectl -n athenz exec deployment/athenz-zts-server -c athenz-zts-server -- sh -c "ls -al /opt/athenz/zts/lib/jars | grep keycloak"

# -rw-r--r-- 1 root   root      3237 May  1 14:26 keycloak-token-provider.jar
```

Even if the jar is mounted on the Athenz server, the athenz does not use the jar file unless you let it know where it is. In Athenz, you give the config to the server through configmap and restart the server to let it know.

First of all, let's create a config file for the plugin:

```sh
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: ConfigMap
metadata:
  name: zts-providers-config
  namespace: athenz
data:
  providers.json: |
    [
      {
        "issuerUri": "http://localhost:9090/realms/master",
        "jwksUri": "http://host.docker.internal:9090/realms/master/protocol/openid-connect/certs",
        "providerClassName": "com.mlajkim.athenz.KeycloakTokenExchangeProvider"
      }
    ]
EOF

# configmap/zts-providers-config created
```

> [!NOTE]
> You can check if the ZTS server can access the jwksUri by:
>
> ```sh
> kubectl -n athenz exec deployment/athenz-zts-server -c athenz-zts-server -- sh -c "curl -k http://host.docker.internal:9090/realms/master/protocol/openid-connect/certs | jq ."
>
> # {
> #  "keys": [
> #    {
> #      "kid": "LFe-YnLUWVVdHDlDZ1U7vBTDnuv7H5gn0FRQLij-d4Y",
> # ...
> ```

Then let the ZTS server to mount the config created above:

```sh
kubectl patch deployment athenz-zts-server -n athenz --patch-file keycloak_token_exchange_provider/hack/static/zts-providers-config-patch.yaml

# deployment.apps/athenz-zts-server patched
```

Wait for few seconds and check:

```sh
kubectl -n athenz exec deployment/athenz-zts-server -c athenz-zts-server -- sh -c "cat /opt/athenz/zts/conf/providers.json"

# [
#   {
#     "issuerUri": "https://localhost:9090/realms/master",
#     "jwksUri": "http://host.docker.internal:9090/realms/master/protocol/openid-connect/certs",
#     "providerClassName": "com.mlajkim.athenz.KeycloakTokenExchangeProvider"
#   }
# ]
```

Then give setting for `zts.properties` under `athenz/athenz-zts-conf`:

```sh
athenz.zts.oauth_provider_config_file=/opt/athenz/zts/conf/providers.json
```

![zts_properties_setting](./assets/12_zts_properties_setting.png)

Finally restart ZTS server so that it can read the modified configuration above:

```sh
kubectl -n athenz rollout restart deployment athenz-zts-server

# deployment.apps/athenz-zts-server restarted
```

> [!NOTE]
> If well read, you will see something like the following:
>
> ```sh
> # 12:34:56.233 [main] INFO  c.y.a.c.s.util.config.ConfigManager - configuration "athenz.zts.oauth_provider_config_file" created
> ```

Please note that the oauth_token's preferred name will be converted into `human.[preferred_name]` in the plugin we just created. You may customize the plugin by yourself if needed.

## What we have done?

We just created a plugin `KeycloakTokenExchangeProvider` that handles the given Keycloak generated id-token, check the summary and return it:





## What's next?

You may have noticed that manually inserting the Access Token into the UI is cumbersome. Furthermore, the access token we provided for the MCP server only represents a single user (`human.idjag-learner`). In an enterprise environment, many users will need to use their own Access Tokens for shared tools, making a static, hardcoded token impractical.

In the next tutorial, we will automate this flow: signing in as idjag-learner to retrieve an ID Token, exchanging it for an ID-JAG token, and ultimately obtaining an Access Token. The tool server will then use this dynamically generated Access Token to communicate securely with the MCP Server.