PORT ?= 3102
OPEN_UI ?= false
MCP_HUB_ZTS_URL ?= https://localhost:$(shell ../tools/port.sh zts)/zts/v1
GENAI_PROXY_URL ?= http://127.0.0.1:$(shell ../tools/port.sh genai-proxy)

.PHONY: build local

build:
	npm install
	npm run build
	cp -R public .next/standalone/
	mkdir -p .next/standalone/.next
	cp -R .next/static .next/standalone/.next/

local: build
	if [ "$(OPEN_UI)" = "true" ]; then (../tools/open.sh "http://localhost:$(PORT)" &); fi
	PORT="$(PORT)" HOSTNAME="127.0.0.1" MCP_HUB_ZTS_URL="$(MCP_HUB_ZTS_URL)" GENAI_PROXY_URL="$(GENAI_PROXY_URL)" node .next/standalone/server.js
