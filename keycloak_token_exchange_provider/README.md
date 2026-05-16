# Keycloak Token Exchange Provider

To mount this plugin as a jar for your Athenz ZTS, do the following:

```sh
kubectl patch deployment athenz-zts-server -n athenz --patch-file keycloak_token_exchange_provider/hack/static/zts-plugin-jar-mount-patch.yaml
```

Then see if a jar `keycloak-token-provider.jar` is mounted:

```sh
kubectl -n athenz exec deployment/athenz-zts-server -c athenz-zts-server -- sh -c "ls -al /opt/athenz/zts/lib/jars | grep keycloak"

# -rw-r--r-- 1 root   root      3237 May  1 14:26 keycloak-token-provider.jar
```

> [!NOTE]
> Make sure to have the `jwks_uri` fetchable from your server. you can always to `curl` inside your pod/server etc
> - Format found here: https://github.com/AthenZ/athenz/blob/master/servers/zts/src/test/resources/provider.config.json

Even if the jar is mounted on the Athenz server, the athenz does not use the jar file unless you let it know to trust it.

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
        "issuerUri": "https://localhost:9089/realms/local-openwebui",
        "jwksUri": "http://host.docker.internal:9090/realms/local-openwebui/protocol/openid-connect/certs",
        "providerClassName": "com.mlajkim.athenz.OpenWebuiKeycloakTokenProvider"
      }
    ]
EOF

# configmap/zts-providers-config created
```

Then let the ZTS server to mount the config created above:

```sh
make -C keycloak_jar apply-providers-config-patch
```

Check if config is mounted:

```sh
kubectl -n athenz exec deployment/athenz-zts-server -c athenz-zts-server -- sh -c "cat /opt/athenz/zts/conf/providers.json"

# [
#   {
#     "issuerUri": "https://localhost:9089/realms/local-openwebui",
#     "jwksUri": "http://host.docker.internal:9090/realms/local-openwebui/protocol/openid-connect/certs",
#     "providerClassName": "com.mlajkim.athenz.OpenWebuiKeycloakTokenProvider"
#   }
# ]
```

Then give setting

```sh
athenz.zts.oauth_provider_config_file=/opt/athenz/zts/conf/providers.json
```

![zts_properties_setting](./assets/zts_properties_setting.png)

Finally restart ZTS server:

```sh
kubectl -n athenz rollout restart deployment athenz-zts-server
```

Check if class, and its config are well written and understood by ZTS:

```sh
# 12:34:56.233 [main] INFO  c.y.a.c.s.util.config.ConfigManager - configuration "athenz.zts.oauth_provider_config_file" created
```

Please note that the oauth_token's preferred name will be converted into `human.[preferred_name]` in Athenz.

# Docs

For more details, please refer to [docs](./docs/README.md).
