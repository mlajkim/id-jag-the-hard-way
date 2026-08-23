
.PHONY: list \
	bootstrap-common \
	bootstrap-common-clean \
	mcp-hub-deploy mcp-hub-port-forward mcp-hub-kill-port-forward mcp-hub-clean \
	pattern-3a pattern-3a-port-forward pattern-3a-kill-port-forward pattern-3a-clean \
	pattern-2b pattern-2b-port-forward pattern-2b-kill-port-forward pattern-2b-clean \
	pattern-3b pattern-3b-port-forward pattern-3b-kill-port-forward pattern-3b-clean

REPO_ROOT := $(abspath $(CURDIR)/../..)

MCP_HUB_NAMESPACE ?= mcp-hub
MCP_HUB_ATHENZ_DOMAIN ?= mcp-hub
MCP_HUB_PORT ?= 3102

# Pattern-specific bootstrap inputs. These are deliberately separate so
# `make bootstrap-common pattern-2b pattern-3a` configures each pattern with
# its own namespace, Athenz domain, permissions, and service list.
PATTERN_3A_NAMESPACE ?= mcp-pattern-3a
PATTERN_3A_ATHENZ_DOMAIN ?= mcp.pattern3a
PATTERN_3A_ATHENZ_PARENT_DOMAIN ?= mcp
PATTERN_3A_PERMISSIONS_YAML ?= $(CURDIR)/patterns/pattern-3a-remote-return/permissions.yaml
PATTERN_3A_SERVICES ?= mcp-sa pattern-3a-mop-sa pattern-3a-echo-mcp-sa
PATTERN_3A_AS_ISSUER_URL ?= https://localhost:8082
PATTERN_3A_PUBLIC_BASE_URL ?= http://localhost:3001

PATTERN_2B_NAMESPACE ?= mcp-pattern-2b
PATTERN_2B_ATHENZ_DOMAIN ?= mcp.pattern2b
PATTERN_2B_ATHENZ_PARENT_DOMAIN ?= mcp
PATTERN_2B_PERMISSIONS_YAML ?= $(CURDIR)/patterns/pattern-2b-remote-forward/permissions.yaml
PATTERN_2B_SERVICES ?= mcp-sa pattern-2b-echo-mcp-sa
PATTERN_2B_AS_ISSUER_URL ?= http://localhost:3002
PATTERN_2B_PUBLIC_BASE_URL ?= http://localhost:3002

PATTERN_3A_MAKE_VARS = PATTERN_NAMESPACE="$(PATTERN_3A_NAMESPACE)" ATHENZ_DOMAIN="$(PATTERN_3A_ATHENZ_DOMAIN)" ATHENZ_PARENT_DOMAIN="$(PATTERN_3A_ATHENZ_PARENT_DOMAIN)"
PATTERN_2B_MAKE_VARS = PATTERN_NAMESPACE="$(PATTERN_2B_NAMESPACE)" ATHENZ_DOMAIN="$(PATTERN_2B_ATHENZ_DOMAIN)" ATHENZ_PARENT_DOMAIN="$(PATTERN_2B_ATHENZ_PARENT_DOMAIN)"

PATTERN_3B_NAMESPACE ?= mcp-pattern-3b
PATTERN_3B_ATHENZ_DOMAIN ?= mcp.pattern3b
PATTERN_3B_ATHENZ_PARENT_DOMAIN ?= mcp
PATTERN_3B_PERMISSIONS_YAML ?= $(CURDIR)/patterns/pattern-3b-remote-forward/permissions.yaml
PATTERN_3B_SERVICES ?= mcp-sa pattern-3b-agentgateway pattern-3b-echo-mcp-sa
PATTERN_3B_AS_ISSUER_URL ?= http://localhost:3003
PATTERN_3B_PUBLIC_BASE_URL ?= http://localhost:3003/docs

PATTERN_3B_MAKE_VARS = PATTERN_NAMESPACE="$(PATTERN_3B_NAMESPACE)" ATHENZ_DOMAIN="$(PATTERN_3B_ATHENZ_DOMAIN)" ATHENZ_PARENT_DOMAIN="$(PATTERN_3B_ATHENZ_PARENT_DOMAIN)"

list:
	@echo "Implemented patterns:"
	@echo "  pattern-3a-remote-return  (run bootstrap-common first, then pattern-3a or"
	@echo "                             pattern-3a-port-forward)"
	@echo "  pattern-2b-remote-forward (run bootstrap-common first, then pattern-2b or"
	@echo "                             pattern-2b-port-forward; it can coexist with Pattern 3a"
	@echo "                             in its own namespace/Athenz domain)"
	@echo "  pattern-3b-remote-forward (run bootstrap-common first, then pattern-3b or"
	@echo "                             pattern-3b-port-forward; it can coexist with Patterns 2b/3a"
	@echo "                             in its own namespace/Athenz domain)"
	@echo "Placeholders (README only):"
	@echo "  pattern-1-local-exchange, pattern-2a-remote-return"
	@echo "Shared infrastructure:"
	@echo "  bootstrap-common           (Kind + Keycloak + Athenz ZMS/ZTS + MCP Hub)"
	@echo "Pattern-specific bootstrap:"
	@echo "  pattern-3a                 (Pattern 3a bootstrap, register, and deploy)"
	@echo "  pattern-2b                 (Pattern 2b bootstrap, register, and deploy)"
	@echo "  pattern-3b                 (Pattern 3b bootstrap, register, and deploy)"
	@echo "Cleanup:"
	@echo "  pattern-3a-clean          (remove Pattern 3a resources and local TLS files)"
	@echo "  pattern-2b-clean          (remove Pattern 2b resources and local key files)"
	@echo "  pattern-3b-clean          (remove Pattern 3b resources and local key files)"
	@echo "  bootstrap-common-clean   (remove shared infrastructure only; keep Kind and patterns)"
	@echo "Build from an empty machine:"
	@echo "  bootstrap-common pattern-3a  (shared bootstrap, then Pattern 3a)"
	@echo "  bootstrap-common pattern-2b  (shared bootstrap, then Pattern 2b)"
	@echo "  bootstrap-common pattern-3b  (shared bootstrap, then Pattern 3b)"
	@echo "  bootstrap-common pattern-2b pattern-3a  (shared bootstrap once, then both patterns)"


bootstrap-common:
	./bootstrap-common/01-kind-cluster.sh
	./bootstrap-common/02-keycloak.sh
	./bootstrap-common/03-athenz.sh
	PATTERN_NAMESPACE="$(MCP_HUB_NAMESPACE)" ATHENZ_DOMAIN="$(MCP_HUB_ATHENZ_DOMAIN)" ATHENZ_PARENT_DOMAIN="mcp" \
		./bootstrap-common/05-athenz-identityprovider.sh hub-ui
	$(MAKE) mcp-hub-deploy
	@echo "Shared infrastructure ready (Kind + Keycloak + Athenz ZMS/ZTS + MCP Hub)."

bootstrap-common-clean:
	$(REPO_ROOT)/tools/keep-k8s-port-forward.sh stop
	$(MAKE) mcp-hub-clean
	@echo "Removing bootstrap-common Keycloak resources..."
	kubectl delete namespace idp --ignore-not-found
	@echo "Removing Athenz through athenz_dist's standard cleanup..."
	$(MAKE) -C $(REPO_ROOT)/athenz_dist clean-kubernetes-athenz
	@echo "Shared showcase cleanup complete (Kind cluster and pattern resources were kept)."

mcp-hub-deploy:
	MCP_HUB_NAMESPACE="$(MCP_HUB_NAMESPACE)" MCP_HUB_ATHENZ_DOMAIN="$(MCP_HUB_ATHENZ_DOMAIN)" \
		MCP_HUB_PORT="$(MCP_HUB_PORT)" ./bootstrap-common/08-mcp-hub.sh

mcp-hub-port-forward:
	kubectl -n "$(MCP_HUB_NAMESPACE)" port-forward service/mcp-hub "$(MCP_HUB_PORT):3102"

mcp-hub-kill-port-forward:
	npx kill-port "$(MCP_HUB_PORT)"

mcp-hub-clean:
	$(MAKE) mcp-hub-kill-port-forward >/dev/null 2>&1 || true
	MCP_HUB_NAMESPACE="$(MCP_HUB_NAMESPACE)" envsubst '$$MCP_HUB_NAMESPACE' \
		< k8s-common/mcp-hub-deployment.yaml | kubectl delete -f - --ignore-not-found
	kubectl delete namespace "$(MCP_HUB_NAMESPACE)" --ignore-not-found

# --- pattern-3a -----------------------------------------------------------------
pattern-3a:
	@kubectl -n athenz get deployment/athenz-zts-server >/dev/null 2>&1 || { echo "Run 'make -C showcases/mcp_x_idjag bootstrap-common pattern-3a' first." >&2; exit 1; }
	$(PATTERN_3A_MAKE_VARS) ./bootstrap-common/04-athenz-roles.sh "$(PATTERN_3A_PERMISSIONS_YAML)"
	$(PATTERN_3A_MAKE_VARS) ./bootstrap-common/05-athenz-identityprovider.sh $(PATTERN_3A_SERVICES)
	$(PATTERN_3A_MAKE_VARS) ./bootstrap-common/06-api-server.sh
	$(PATTERN_3A_MAKE_VARS) ./bootstrap-common/07-mcp-server.sh "$(PATTERN_3A_AS_ISSUER_URL)" "$(PATTERN_3A_PUBLIC_BASE_URL)"
	$(MAKE) -C patterns/pattern-3a-remote-return $(PATTERN_3A_MAKE_VARS) register-mop deploy-mop deploy-gateway
	PATTERN_NAMESPACE="$(PATTERN_3A_NAMESPACE)" ./register-mcp-hub-metadata.sh pattern-3a-remote-return oauth
	@echo "Pattern 3a deployed (MoP + docs MCP + echo MCP + routing-only Envoy Gateway) and ready to test. Use 'make -C showcases/mcp_x_idjag pattern-3a-port-forward' to forward the local ports."

pattern-3a-port-forward:
	$(MAKE) -C patterns/pattern-3a-remote-return $(PATTERN_3A_MAKE_VARS) port-forward

pattern-3a-kill-port-forward:
	$(MAKE) -C patterns/pattern-3a-remote-return $(PATTERN_3A_MAKE_VARS) kill-port-forward

pattern-3a-clean:
	$(MAKE) -C patterns/pattern-3a-remote-return $(PATTERN_3A_MAKE_VARS) clean

# --- pattern-2b -----------------------------------------------------------------
pattern-2b:
	@kubectl -n athenz get deployment/athenz-zts-server >/dev/null 2>&1 || { echo "Run 'make -C showcases/mcp_x_idjag bootstrap-common pattern-2b' first." >&2; exit 1; }
	$(PATTERN_2B_MAKE_VARS) ./bootstrap-common/04-athenz-roles.sh "$(PATTERN_2B_PERMISSIONS_YAML)"
	$(PATTERN_2B_MAKE_VARS) ./bootstrap-common/05-athenz-identityprovider.sh $(PATTERN_2B_SERVICES)
	$(PATTERN_2B_MAKE_VARS) ./bootstrap-common/06-api-server.sh
	$(PATTERN_2B_MAKE_VARS) ./bootstrap-common/07-mcp-server.sh "$(PATTERN_2B_AS_ISSUER_URL)" "$(PATTERN_2B_PUBLIC_BASE_URL)"
	$(MAKE) -C patterns/pattern-2b-remote-forward $(PATTERN_2B_MAKE_VARS) register-gateway deploy-gateway deploy-dpop-verifier deploy-echo-mcp deploy-routes
	PATTERN_NAMESPACE="$(PATTERN_2B_NAMESPACE)" ./register-mcp-hub-metadata.sh pattern-2b-remote-forward dpop-connector
	@echo "Pattern 2b deployed (agentgateway + dpop-verifier + docs MCP + echo MCP) and ready to test. Use 'make -C showcases/mcp_x_idjag pattern-2b-port-forward' to forward the local ports, then 'make -C showcases/mcp_x_idjag/patterns/pattern-2b-remote-forward test'."

pattern-2b-port-forward:
	$(MAKE) -C patterns/pattern-2b-remote-forward $(PATTERN_2B_MAKE_VARS) port-forward

pattern-2b-kill-port-forward:
	$(MAKE) -C patterns/pattern-2b-remote-forward $(PATTERN_2B_MAKE_VARS) kill-port-forward

pattern-2b-clean:
	$(MAKE) -C patterns/pattern-2b-remote-forward $(PATTERN_2B_MAKE_VARS) clean

# --- pattern-3b -----------------------------------------------------------------
pattern-3b:
	@kubectl -n athenz get deployment/athenz-zts-server >/dev/null 2>&1 || { echo "Run 'make -C showcases/mcp_x_idjag bootstrap-common pattern-3b' first." >&2; exit 1; }
	$(PATTERN_3B_MAKE_VARS) ./bootstrap-common/04-athenz-roles.sh "$(PATTERN_3B_PERMISSIONS_YAML)"
	$(PATTERN_3B_MAKE_VARS) ./bootstrap-common/05-athenz-identityprovider.sh $(PATTERN_3B_SERVICES)
	$(PATTERN_3B_MAKE_VARS) ./bootstrap-common/06-api-server.sh
	$(PATTERN_3B_MAKE_VARS) ./bootstrap-common/07-mcp-server.sh "$(PATTERN_3B_AS_ISSUER_URL)" "$(PATTERN_3B_PUBLIC_BASE_URL)"
	$(MAKE) -C patterns/pattern-3b-remote-forward $(PATTERN_3B_MAKE_VARS) register-gateway deploy-gateway deploy-echo-mcp deploy-routes deploy-bff-gateway
	PATTERN_NAMESPACE="$(PATTERN_3B_NAMESPACE)" ./register-mcp-hub-metadata.sh pattern-3b-remote-forward oauth
	@echo "Pattern 3b deployed (mcp-bff-gateway + agentgateway + docs MCP + echo MCP) and ready to test. Use 'make -C showcases/mcp_x_idjag pattern-3b-port-forward' to forward the local port."

pattern-3b-port-forward:
	$(MAKE) -C patterns/pattern-3b-remote-forward $(PATTERN_3B_MAKE_VARS) port-forward

pattern-3b-kill-port-forward:
	$(MAKE) -C patterns/pattern-3b-remote-forward $(PATTERN_3B_MAKE_VARS) kill-port-forward

pattern-3b-clean:
	$(MAKE) -C patterns/pattern-3b-remote-forward $(PATTERN_3B_MAKE_VARS) clean
