CLUSTER_NAME ?= kind

include pattern.env
export PATTERN_NAMESPACE ATHENZ_DOMAIN ATHENZ_PARENT_DOMAIN

.PHONY: register-gateway \
	deploy-gateway deploy-dpop-verifier deploy-echo-mcp deploy-routes \
	test \
	kill-port-forward port-forward \
	clean

register-gateway:
	./register.sh

deploy-gateway:
	CLUSTER_NAME=$(CLUSTER_NAME) ./deploy-gateway.sh

deploy-dpop-verifier:
	CLUSTER_NAME=$(CLUSTER_NAME) ./deploy-dpop-verifier.sh

deploy-echo-mcp:
	CLUSTER_NAME=$(CLUSTER_NAME) ./deploy-echo-mcp.sh

deploy-routes:
	./deploy-routes.sh

test:
	cd client && npm install && npm test

port-forward:
	@kubectl -n $(PATTERN_NAMESPACE) get svc pattern-2b-gateway >/dev/null 2>&1 || { \
	  echo "Pattern 2b Gateway Service is not ready; run: kubectl get svc -n $(PATTERN_NAMESPACE)" >&2; exit 1; }
	kubectl -n $(PATTERN_NAMESPACE) port-forward svc/pattern-2b-gateway 3002:80 &
	wait

kill-port-forward:
	npx kill-port 3002

clean:
	$(MAKE) kill-port-forward
	./clean.sh
