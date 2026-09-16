PORT ?= 14444
ATHENZ_JWKS_URL ?= https://localhost:8443/zts/v1/oauth2/keys?rfc=true
IMAGE ?= idthw-demo-api:dev

.PHONY: check test local build-image

check:
	npm run check

test:
	npm test

local:
	PORT=$(PORT) ATHENZ_JWKS_URL="$(ATHENZ_JWKS_URL)" npm start

build-image:
	docker build -t $(IMAGE) .
