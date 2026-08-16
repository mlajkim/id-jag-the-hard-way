CLUSTER_NAME ?= kind

.PHONY: bootstrap \
	deploy deploy-mop \
	register-mop \
	kill-port-forward port-forward \
	clean

register-mop:
	./register.sh

deploy-mop:
	CLUSTER_NAME=$(CLUSTER_NAME) ./deploy-mop.sh

port-forward:
	kubectl -n api port-forward svc/mcp 3001:3000 &
	kubectl -n api port-forward svc/pattern-3a-mop 8082:8082 &
	wait

kill-port-forward:
	npx kill-port 3001 8082

clean:
	$(MAKE) kill-port-forward
	kubectl -n api delete -f k8s/mop-deployment.yaml --ignore-not-found
	kubectl -n api delete configmap pattern-3a-mop-sia pattern-3a-mop-config --ignore-not-found
	kubectl -n api delete secret pattern-3a-mop-tls --ignore-not-found
	rm -rf mop-tls
