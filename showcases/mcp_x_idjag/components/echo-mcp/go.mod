module github.com/mlajkim/id-jag-the-hard-way/showcases/mcp_x_idjag/components/echo-mcp

go 1.26.4

// Support both legacy stateful sessions and the 2026-07-28 stateless protocol
// used by current MCP clients; the handler selects the mode per request.
require github.com/modelcontextprotocol/go-sdk v1.7.0

require (
	github.com/google/jsonschema-go v0.4.3 // indirect
	github.com/segmentio/asm v1.1.3 // indirect
	github.com/segmentio/encoding v0.5.4 // indirect
	github.com/yosida95/uritemplate/v3 v3.0.2 // indirect
	golang.org/x/oauth2 v0.35.0 // indirect
	golang.org/x/sync v0.20.0 // indirect
	golang.org/x/sys v0.41.0 // indirect
	golang.org/x/time v0.15.0 // indirect
)
