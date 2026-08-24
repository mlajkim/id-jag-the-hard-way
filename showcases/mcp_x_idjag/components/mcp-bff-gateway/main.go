// Command mcp-bff-gateway is Pattern 3b's BFF/AS. It is the only component
// the Client ever talks to: it acquires the human user's id_token from
// Keycloak on the Client's behalf (remote id_token acquisition), hands the
// Client only an opaque session identifier in exchange, and forwards the
// actual MCP request to agentgateway (which performs the ID-JAG/Access Token
// exchange via crossAppAccess - see ../../patterns/pattern-3b-remote-forward).
package main

import (
	"log"
	"net/http"
	"os"
)

func main() {
	port := getEnv("PORT", "3101")
	publicBaseURL := getEnv("PUBLIC_BASE_URL", "http://localhost:"+port)
	keycloakURL := getEnv("KEYCLOAK_URL", "http://localhost:34443")
	keycloakPublicURL := getEnv("KEYCLOAK_PUBLIC_URL", keycloakURL)
	keycloakRealm := getEnv("KEYCLOAK_REALM", "master")
	keycloakClientID := getEnv("KEYCLOAK_CLIENT_ID", "human.idjag-learner.pattern3b-gateway")
	agentgatewayBaseURL := getEnv("AGENTGATEWAY_BASE_URL", "http://pattern-3b-agentgateway.mcp-pattern-3b.svc.cluster.local:80")

	sessions := newSessionStore()
	oauth := newOAuthServer(publicBaseURL, keycloakURL, keycloakPublicURL, keycloakRealm, keycloakClientID, sessions)
	proxy := newProxyHandler(agentgatewayBaseURL, publicBaseURL, sessions)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
	})
	oauth.registerRoutes(mux)
	// Everything else (in particular /docs/* and /echo/*) is MCP traffic
	// forwarded to agentgateway.
	mux.Handle("/", proxy)

	log.Printf("mcp-bff-gateway listening on :%s", port)
	log.Printf("public base URL: %s", publicBaseURL)
	log.Printf("agentgateway: %s", agentgatewayBaseURL)
	if err := http.ListenAndServe(":"+port, withCORS(mux)); err != nil {
		log.Fatal(err)
	}
}

// withCORS reflects the request's Origin back with credentials allowed -
// this gateway is a local-dev/tutorial component, not a public multi-tenant
// service, so a permissive policy is an accepted simplification.
func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if origin := r.Header.Get("Origin"); origin != "" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Vary", "Origin")
		}
		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "authorization,content-type,accept,cookie")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func getEnv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
