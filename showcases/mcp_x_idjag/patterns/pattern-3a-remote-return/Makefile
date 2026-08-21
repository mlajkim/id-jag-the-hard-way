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

# Pattern 3a owns its namespace and the Envoy Gateway installation used by
# its routing-only Gateway.
clean:
	$(MAKE) kill-port-forward
	./cleanup-echo-athenz.sh
	@if kubectl get crd httproutes.gateway.networking.k8s.io >/dev/null 2>&1; then \
		kubectl -n $(PATTERN_NAMESPACE) delete httproute pattern-3a-docs-mcp pattern-3a-echo-mcp --ignore-not-found; \
	else \
		echo "HTTPRoute CRD is absent; skipping Pattern 3a HTTPRoute cleanup"; \
	fi
	@if kubectl get crd gateways.gateway.networking.k8s.io >/dev/null 2>&1; then \
		kubectl -n $(PATTERN_NAMESPACE) delete gateway pattern-3a-gateway --ignore-not-found; \
	else \
		echo "Gateway CRD is absent; skipping Pattern 3a Gateway cleanup"; \
	fi
	@if kubectl get crd gatewayclasses.gateway.networking.k8s.io >/dev/null 2>&1; then \
		kubectl delete gatewayclass pattern-3a-envoy-gateway --ignore-not-found; \
	else \
		echo "GatewayClass CRD is absent; skipping Pattern 3a GatewayClass cleanup"; \
	fi
	@if kubectl get crd envoyproxies.gateway.envoyproxy.io >/dev/null 2>&1; then \
		kubectl -n $(PATTERN_NAMESPACE) delete envoyproxy pattern-3a-envoy-proxy --ignore-not-found; \
	else \
		echo "EnvoyProxy CRD is absent; skipping Pattern 3a EnvoyProxy cleanup"; \
	fi
	kubectl -n $(PATTERN_NAMESPACE) delete -f k8s/echo-mcp-deployment.yaml --ignore-not-found
	kubectl -n $(PATTERN_NAMESPACE) delete -f k8s/mop-deployment.yaml --ignore-not-found
	kubectl -n $(PATTERN_NAMESPACE) delete configmap pattern-3a-mop-sia pattern-3a-mop-config --ignore-not-found
	kubectl -n $(PATTERN_NAMESPACE) delete secret pattern-3a-mop-tls --ignore-not-found
	kubectl delete namespace $(PATTERN_NAMESPACE) --ignore-not-found
	kubectl delete namespace envoy-gateway-system --ignore-not-found
	rm -rf mop-tls
