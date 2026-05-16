apply-providers-config-patch:
	@kubectl patch deployment athenz-zts-server -n athenz --patch-file hack/static/zts-providers-config-patch.yaml

# Test Purpose Only Below:

build:
	@mvn clean package \
		-Dmaven.resolver.transport=wagon \
		-Dmaven.wagon.http.ssl.insecure=true \
		-Dmaven.wagon.http.ssl.allowall=true
