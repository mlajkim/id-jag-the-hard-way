CLUSTER_NAME ?= kind

include pattern.env
export PATTERN_NAMESPACE ATHENZ_DOMAIN ATHENZ_PARENT_DOMAIN

.PHONY: bootstrap \
	deploy deploy-mop deploy-gateway \
	register-mop \
	kill-port-forward port-forward \
	clean

register-mop:
	./register.sh

deploy-mop:
	CLUSTER_NAME=$(CLUSTER_NAME) ./deploy-mop.sh

deploy-gateway:
	./deploy-gateway.sh

port-forward:
	_gateway_service=$$(kubectl get svc -A -l gateway.envoyproxy.io/owning-gateway-name=pattern-3a-gateway --no-headers -o custom-columns='NAMESPACE:.metadata.namespace,NAME:.metadata.name' | awk 'NR==1 {print $$1 ":" $$2}'); \
	test -n "$$_gateway_service" || { echo "Pattern 3a Gateway Service is not ready; run: kubectl get svc -A --show-labels | grep envoy" >&2; exit 1; }; \
	_gateway_namespace=$${_gateway_service%%:*}; \
	_gateway_name=$${_gateway_service#*:}; \
	kubectl -n "$$_gateway_namespace" port-forward "svc/$$_gateway_name" 3001:80 &
	kubectl -n $(PATTERN_NAMESPACE) port-forward svc/pattern-3a-mop 8082:8082 &
	wait

kill-port-forward:
	npx kill-port 3001 8082

clean:
	$(MAKE) kill-port-forward
	./cleanup-echo-athenz.sh
	kubectl -n $(PATTERN_NAMESPACE) delete -f k8s/gateway.yaml --ignore-not-found
	kubectl -n $(PATTERN_NAMESPACE) delete -f k8s/echo-mcp-deployment.yaml --ignore-not-found
	kubectl -n $(PATTERN_NAMESPACE) delete -f k8s/mop-deployment.yaml --ignore-not-found
	kubectl -n $(PATTERN_NAMESPACE) delete configmap pattern-3a-mop-sia pattern-3a-mop-config --ignore-not-found
	kubectl -n $(PATTERN_NAMESPACE) delete secret pattern-3a-mop-tls --ignore-not-found
	kubectl -n $(PATTERN_NAMESPACE) create configmap mcp-reverse-proxy-config \
		--from-literal=AS_ISSUER_URL=http://localhost:8082 \
		--from-literal=PUBLIC_BASE_URL=http://localhost:3001 \
		--dry-run=client -o yaml | kubectl apply -f -
	rm -rf mop-tls
