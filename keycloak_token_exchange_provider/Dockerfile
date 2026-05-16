FROM alpine:latest

COPY target/original-keycloak-token-provider-1.0.0.jar /plugin.jar

# without chmod 644, it will be root, and possibly fail:
CMD ["/bin/sh", "-c", "cp /plugin.jar /export/keycloak-token-provider.jar && chmod 644 /export/keycloak-token-provider.jar"]
