
.PHONY: list \
	bootstrap-common \
	bootstrap-common-clean \
	bootstrap-phase1-kind-cluster bootstrap-phase2-keycloak bootstrap-phase3-athenz \
	bootstrap-phase4-athenz-roles bootstrap-phase5-athenz-identityprovider bootstrap-phase6-api-server \
	bootstrap-phase7-mcp-server \
	pattern-3a pattern-3a-deploy pattern-3a-register pattern-3a-port-forward pattern-3a-kill-port-forward pattern-3a-clean

REPO_ROOT := $(abspath $(CURDIR)/../..)
PORT_FORWARD_PID_FILE := $(REPO_ROOT)/tools/.port-forward.pid

# Services created by bootstrap-common's default Pattern 3a invocation. Override
# CLEAN_SERVICES when bootstrap-common was invoked with a custom SERVICES list.
CLEAN_SERVICES ?= mcp-sa pattern-3a-mop-sa

# When `pattern-3a` is one of the goals on this `make` invocation, default
# bootstrap-common's own required PERMISSIONS_YAML/SERVICES/AS_ISSUER_URL to
# Pattern 3a's own values - `?=` still lets an explicit command-line value win.
ifneq ($(filter pattern-3a,$(MAKECMDGOALS)),)
PERMISSIONS_YAML ?= $(CURDIR)/patterns/pattern-3a-remote-return/permissions.yaml
SERVICES ?= mcp-sa pattern-3a-mop-sa
AS_ISSUER_URL ?= https://localhost:8082
endif

list:
	@echo "Implemented patterns:"
	@echo "  pattern-3a-remote-return  (make pattern-3a for a from-scratch setup, or"
	@echo "                             pattern-3a-deploy / pattern-3a-port-forward once the"
	@echo "                             cluster already has tutorials 01-16's state)"
	@echo "Placeholders (README only):"
	@echo "  pattern-1-local-exchange, pattern-2a-remote-return, pattern-2b-remote-forward, pattern-3b-remote-forward"
	@echo "Shared building block for any pattern's own bootstrap.sh:"
	@echo "  bootstrap-common PERMISSIONS_YAML=... SERVICES=\"svc1 svc2\" AS_ISSUER_URL=... (chains"
	@echo "                             bootstrap-phase1..7, each also invocable on its own -"
	@echo "                             see bootstrap-common/*.sh)"
	@echo "Cleanup:"
	@echo "  pattern-3a-clean          (remove Pattern 3a resources and local TLS files)"
	@echo "  bootstrap-common-clean   (remove shared bootstrap resources; keep the Kind cluster)"
	@echo "One-shot Pattern 3a build from an empty machine:"
	@echo "  pattern-3a  (chains bootstrap-common then this pattern's own register+deploy steps -"
	@echo "                             PERMISSIONS_YAML/SERVICES/AS_ISSUER_URL default automatically)"


bootstrap-common: bootstrap-phase1-kind-cluster bootstrap-phase2-keycloak bootstrap-phase3-athenz \
	bootstrap-phase4-athenz-roles bootstrap-phase5-athenz-identityprovider bootstrap-phase6-api-server \
	bootstrap-phase7-mcp-server
	@echo "Shared setup complete (tutorials 03-14 + Copper Argos infra + MCP server ready)."

bootstrap-common-clean: pattern-3a-clean
	@echo "Stopping shared Kubernetes port-forwarder..."
	@if [ -f "$(PORT_FORWARD_PID_FILE)" ]; then \
		_pid="$$(cat "$(PORT_FORWARD_PID_FILE)" 2>/dev/null || true)"; \
		if [ -n "$$_pid" ] && ps -p "$$_pid" -o command= 2>/dev/null | grep -q '[k]eep-k8s-port-forward.sh'; then \
			kill -- "-$$_pid" 2>/dev/null || kill "$$_pid" 2>/dev/null || true; \
		fi; \
		rm -f "$(PORT_FORWARD_PID_FILE)"; \
	fi
	@echo "Removing bootstrap-common API and MCP resources..."
	kubectl delete namespace api --ignore-not-found
	@echo "Removing bootstrap-common Keycloak resources..."
	kubectl delete namespace idp --ignore-not-found
	@echo "Removing Athenz through athenz_dist's standard cleanup..."
	$(MAKE) -C $(REPO_ROOT)/athenz_dist clean-kubernetes-athenz
	@echo "Removing bootstrap-common service keys..."
	@for _service in $(CLEAN_SERVICES); do \
		rm -f "$(REPO_ROOT)/keys/$${_service}.key" \
			"$(REPO_ROOT)/keys/$${_service}.public.key" \
			"$(REPO_ROOT)/keys/$${_service}.crt" \
			"$(REPO_ROOT)/keys/$${_service}.jwt"; \
	done
	@echo "bootstrap-common cleanup complete (Kind cluster was kept)."

bootstrap-phase1-kind-cluster:
	./bootstrap-common/01-kind-cluster.sh

bootstrap-phase2-keycloak:
	./bootstrap-common/02-keycloak.sh

bootstrap-phase3-athenz:
	./bootstrap-common/03-athenz.sh

bootstrap-phase4-athenz-roles:
	@test -n "$(PERMISSIONS_YAML)" || { echo "PERMISSIONS_YAML=<path> is required"; exit 1; }
	./bootstrap-common/04-athenz-roles.sh "$(PERMISSIONS_YAML)"

bootstrap-phase5-athenz-identityprovider:
	@test -n "$(SERVICES)" || { echo "SERVICES=\"svc1 svc2\" is required"; exit 1; }
	./bootstrap-common/05-athenz-identityprovider.sh $(SERVICES)

bootstrap-phase6-api-server:
	./bootstrap-common/06-api-server.sh

bootstrap-phase7-mcp-server:
	@test -n "$(AS_ISSUER_URL)" || { echo "AS_ISSUER_URL=<url> is required"; exit 1; }
	./bootstrap-common/07-mcp-server.sh "$(AS_ISSUER_URL)" "$(PUBLIC_BASE_URL)"

# --- pattern-3a -----------------------------------------------------------------
pattern-3a: bootstrap-common pattern-3a-deploy
	@echo "Pattern 3a deployed (MoP + MCP server) and ready to test. Use 'make -C showcases/mcp_x_idjag pattern-3a-port-forward' to forward the local ports for MoP and the MCP server."

pattern-3a-deploy:
	$(MAKE) -C patterns/pattern-3a-remote-return register-mop deploy-mop

pattern-3a-port-forward:
	$(MAKE) -C patterns/pattern-3a-remote-return port-forward

pattern-3a-kill-port-forward:
	$(MAKE) -C patterns/pattern-3a-remote-return kill-port-forward

pattern-3a-clean:
	$(MAKE) -C patterns/pattern-3a-remote-return clean
