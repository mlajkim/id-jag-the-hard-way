CLUSTER_NAME ?= kind

include pattern.env
export PATTERN_NAMESPACE ATHENZ_DOMAIN ATHENZ_PARENT_DOMAIN

.PHONY: register-gateway \
	deploy-gateway deploy-echo-mcp deploy-routes deploy-bff-gateway \
	kill-port-forward port-forward \
	clean

register-gateway:
	./register.sh

deploy-gateway:
	CLUSTER_NAME=$(CLUSTER_NAME) ./deploy-gateway.sh

deploy-echo-mcp:
	CLUSTER_NAME=$(CLUSTER_NAME) ./deploy-echo-mcp.sh

deploy-routes:
	./deploy-routes.sh

deploy-bff-gateway:
	CLUSTER_NAME=$(CLUSTER_NAME) ./deploy-bff-gateway.sh

# Only mcp-bff-gateway's own port needs forwarding - it is the single public
# entry point. agentgateway is reached only from inside the cluster (by
# mcp-bff-gateway, over plain HTTP restricted by NetworkPolicy) and is never
# exposed directly.
port-forward:
	@kubectl -n $(PATTERN_NAMESPACE) get svc pattern-3b-bff-gateway >/dev/null 2>&1 || { \
	  echo "Pattern 3b BFF Gateway Service is not ready; run: kubectl get svc -n $(PATTERN_NAMESPACE)" >&2; exit 1; }
	kubectl -n $(PATTERN_NAMESPACE) port-forward svc/pattern-3b-bff-gateway 3003:3101 &
	wait

kill-port-forward:
	npx kill-port 3003

clean:
	$(MAKE) kill-port-forward
	./cleanup-athenz.sh
	PATTERN_NAMESPACE=$(PATTERN_NAMESPACE) PUBLIC_BASE_URL=x AGENTGATEWAY_BASE_URL=x \
	  envsubst '$$PATTERN_NAMESPACE $$PUBLIC_BASE_URL $$AGENTGATEWAY_BASE_URL' < k8s/bff-gateway-deployment.yaml \
	  | kubectl delete -f - --ignore-not-found
	PATTERN_NAMESPACE=$(PATTERN_NAMESPACE) ATHENZ_DOMAIN=$(ATHENZ_DOMAIN) \
	  envsubst '$$PATTERN_NAMESPACE $$ATHENZ_DOMAIN' < k8s/echo-mcp-deployment.yaml \
	  | kubectl delete -f - --ignore-not-found
	kubectl -n $(PATTERN_NAMESPACE) delete configmap athenz-ca --ignore-not-found
	kubectl -n $(PATTERN_NAMESPACE) delete secret pattern-3b-agentgateway-mtls --ignore-not-found
	@for _file in k8s/agentgateway-routes/*.yaml; do \
	  PATTERN_NAMESPACE=$(PATTERN_NAMESPACE) ATHENZ_DOMAIN=$(ATHENZ_DOMAIN) KEYCLOAK_ISSUER=x KEYCLOAK_CLIENT_ID=x \
	    envsubst '$$PATTERN_NAMESPACE $$ATHENZ_DOMAIN $$KEYCLOAK_ISSUER $$KEYCLOAK_CLIENT_ID' < "$$_file" \
	    | kubectl delete -f - --ignore-not-found; \
	done
	PATTERN_NAMESPACE=$(PATTERN_NAMESPACE) envsubst '$$PATTERN_NAMESPACE' < k8s/agentgateway-networkpolicy.yaml | kubectl delete -f - --ignore-not-found
	PATTERN_NAMESPACE=$(PATTERN_NAMESPACE) envsubst '$$PATTERN_NAMESPACE' < k8s/gateway.yaml | kubectl delete -f - --ignore-not-found
	kubectl delete namespace $(PATTERN_NAMESPACE) --ignore-not-found
	@# agentgateway is shared control-plane infrastructure installed by
	@# deploy-gateway.sh, not owned by this pattern alone - Pattern 2b's own
	@# Gateway also uses the "agentgateway" GatewayClass. Only tear down the
	@# shared Helm releases/GatewayClass/namespace if no other pattern still
	@# has a Gateway using it (this pattern's own Gateway was already deleted
	@# above), otherwise cleaning up one pattern would break the other.
	@remaining_agentgateways="$$(kubectl get gateway -A -o json 2>/dev/null | jq -r '.items[] | select(.spec.gatewayClassName=="agentgateway") | "\(.metadata.namespace)/\(.metadata.name)"')"; \
	if [ -n "$$remaining_agentgateways" ]; then \
	  echo "Other pattern(s) still use the shared agentgateway control plane; leaving it in place:"; \
	  echo "$$remaining_agentgateways" | sed 's/^/    /'; \
	else \
	  echo "No remaining Gateways use agentgateway; removing the shared control plane"; \
	  if command -v helm >/dev/null 2>&1; then \
	    helm uninstall agentgateway --namespace agent-gateway --ignore-not-found || true; \
	    helm uninstall agentgateway-crds --namespace agent-gateway --ignore-not-found || true; \
	  else \
	    echo "helm is absent; skipping agentgateway Helm release cleanup"; \
	  fi; \
	  kubectl delete gatewayclass agentgateway --ignore-not-found; \
	  kubectl delete namespace agent-gateway --ignore-not-found; \
	fi
