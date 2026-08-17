// Command echo-mcp is the backend-free MCP used by Pattern 3a's multi-MCP
// routing example. Authentication and Athenz authorization are deliberately
// provided by the mcp-reverse-proxy sidecar, not by this process.
package main

import (
	"context"
	"log"
	"net/http"
	"os"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

type echoPattern3aArgs struct{}

func main() {
	port := getEnv("PORT", "8081")

	server := mcp.NewServer(&mcp.Implementation{
		Name:    "echo-mcp-pattern-3a",
		Version: "0.1.0",
	}, nil)
	mcp.AddTool(server, &mcp.Tool{
		Name:        "echo_pattern_3a",
		Description: "Return the fixed response from Pattern 3a's backend-free echo MCP.",
	}, func(context.Context, *mcp.CallToolRequest, echoPattern3aArgs) (*mcp.CallToolResult, any, error) {
		return &mcp.CallToolResult{
			Content: []mcp.Content{&mcp.TextContent{Text: "echo_pattern_3a: fixed response from Pattern 3a"}},
		}, nil, nil
	})

	handler := newCompatibleStreamableHTTPHandler(server)
	mux := http.NewServeMux()
	mux.Handle("/mcp", handler)

	log.Printf("echo-mcp listening on :%s (backend: none)", port)
	if err := http.ListenAndServe(":"+port, mux); err != nil {
		log.Fatal(err)
	}
}

// Keep legacy MCP sessions stateful while accepting the 2026-07-28 protocol,
// whose HTTP transport is stateless by design.
func newCompatibleStreamableHTTPHandler(server *mcp.Server) http.Handler {
	stateful := mcp.NewStreamableHTTPHandler(
		func(*http.Request) *mcp.Server { return server },
		// The upstream sees the public Gateway Host after the authenticated
		// reverse-proxy hop; the reverse proxy is the trust boundary here.
		&mcp.StreamableHTTPOptions{DisableLocalhostProtection: true},
	)
	stateless := mcp.NewStreamableHTTPHandler(
		func(*http.Request) *mcp.Server { return server },
		&mcp.StreamableHTTPOptions{
			Stateless:                  true,
			DisableLocalhostProtection: true,
		},
	)

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("MCP-Protocol-Version") >= "2026-07-28" {
			stateless.ServeHTTP(w, r)
			return
		}
		stateful.ServeHTTP(w, r)
	})
}

func getEnv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
