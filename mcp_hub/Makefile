PORT ?= 3102
OPEN_UI ?= false

.PHONY: build local

build:
	npm run build

local:
	npm install
	if [ "$(OPEN_UI)" = "true" ]; then (../tools/open.sh "http://localhost:$(PORT)" &); fi
	npm run dev -- --port $(PORT)
