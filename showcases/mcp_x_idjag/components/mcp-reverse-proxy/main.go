// Command mcp-reverse-proxy is the only auth-aware component Pattern 3a's
// showcase writes itself. It runs as a sidecar in the same Pod as
// simple-mcp-server (../simple-mcp-server) and does exactly three things:
//
//  1. Serves RFC 9728 Protected Resource Metadata itself, pointing at MoP
//     (the Authorization Server), so Claude Code can discover it from a 401.
//     simple-mcp-server stays completely OAuth-agnostic; this proxy is the
//     actual resource-server boundary, so it owns this document.
//  2. Authorizes each request's Access Token against Athenz using
//     github.com/AthenZ/athenz-authorizer - the same policy-cache library
//     the official docker.io/athenz/authorization-proxy wraps - checking
//     the mcp-accessor role on the "mcp" resource, equivalent to
//     api_server/authorization_proxy's McpAuthFilter.
//  3. Reverse-proxies authorized requests, unmodified, to simple-mcp-server
//     over localhost (same Pod). It never mints or transforms tokens.
package main

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"strings"
	"time"

	authorizerd "github.com/AthenZ/athenz-authorizer/v5"
	"github.com/modelcontextprotocol/go-sdk/auth"
	"github.com/modelcontextprotocol/go-sdk/oauthex"
)

func main() {
	port := getEnv("PORT", "3000")
	upstreamURL := getEnv("UPSTREAM_MCP_URL", "http://localhost:8081")
	athenzURL := getEnv("ATHENZ_URL", "https://athenz-zts-server.athenz:4443/zts/v1")
	athenzDomain := getEnv("ATHENZ_DOMAIN", "api")
	mcpResource := getEnv("MCP_RESOURCE", "mcp")
	mcpAction := getEnv("MCP_ACTION", "access")
	publicBaseURL := getEnv("PUBLIC_BASE_URL", "http://localhost:"+port)
	// MoP's own issuer URL (its PUBLIC_BASE_URL), not this proxy's - this is
	// the Authorization Server the PRM document tells clients to use.
	asIssuerURL := getEnv("AS_ISSUER_URL", "http://localhost:8082")
	// Athenz's self-signed CA (k8s-athenz-sia-provisioned, same file
	// simple-mcp-server trusts) - without this, fetching JWKs/policy data
	// from ZTS over TLS fails with "certificate signed by unknown authority".
	athenzCAFile := getEnv("ATHENZ_CA_FILE", "")

	daemonOpts := []authorizerd.Option{
		authorizerd.WithAthenzURL(strings.TrimPrefix(strings.TrimPrefix(athenzURL, "https://"), "http://")),
		authorizerd.WithAthenzDomains(athenzDomain),
		// This proxy never presents a client certificate to ZTS: fetching
		// public keys and signed policy data is anonymous, same as the
		// official athenz/authorization-proxy and this repo's own
		// McpAuthFilter.disableSslVerification()-based ZPE checks. Cert-bound
		// (mTLS) access tokens are out of scope here, hence verifyCertThumbprint=false.
		authorizerd.WithAccessTokenParam(authorizerd.NewAccessTokenParam(true, false, "1h", "1h", false, nil, "Authorization")),
	}
	if athenzCAFile != "" {
		caCert, err := os.ReadFile(athenzCAFile)
		if err != nil {
			log.Fatalf("failed to read ATHENZ_CA_FILE %q: %v", athenzCAFile, err)
		}
		pool := x509.NewCertPool()
		if !pool.AppendCertsFromPEM(caCert) {
			log.Fatalf("no valid certificates found in ATHENZ_CA_FILE %q", athenzCAFile)
		}
		daemonOpts = append(daemonOpts, authorizerd.WithHTTPClient(&http.Client{
			Timeout:   30 * time.Second,
			Transport: &http.Transport{TLSClientConfig: &tls.Config{RootCAs: pool}},
		}))
	}

	daemon, err := authorizerd.New(daemonOpts...)
	if err != nil {
		log.Fatalf("failed to initialize Athenz authorizer: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if err := daemon.Init(ctx); err != nil {
		log.Fatalf("failed to initialize Athenz authorizer daemons: %v", err)
	}
	errs := daemon.Start(ctx)
	go func() {
		for err := range errs {
			log.Printf("[athenz-authorizer] background error: %v", err)
		}
	}()

	upstream, err := url.Parse(upstreamURL)
	if err != nil {
		log.Fatalf("invalid UPSTREAM_MCP_URL %q: %v", upstreamURL, err)
	}
	proxy := httputil.NewSingleHostReverseProxy(upstream)

	prmURL := publicBaseURL + "/.well-known/oauth-protected-resource"
	prm := &oauthex.ProtectedResourceMetadata{
		Resource:             publicBaseURL + "/mcp",
		AuthorizationServers: []string{asIssuerURL},
	}

	mux := http.NewServeMux()
	mux.Handle("/.well-known/oauth-protected-resource", auth.ProtectedResourceMetadataHandler(prm))
	mux.Handle("/mcp", authorize(daemon, mcpResource, mcpAction, prmURL, proxy))

	log.Printf("mcp-reverse-proxy listening on :%s (upstream: %s, athenz domain: %s)", port, upstreamURL, athenzDomain)
	if err := http.ListenAndServe(":"+port, mux); err != nil {
		log.Fatal(err)
	}
}

// authorize gates req against Athenz before forwarding to next. On success it
// adds the same X-Athenz-* informational headers athenz/authorization-proxy
// does; on failure it returns 401 with a WWW-Authenticate challenge pointing
// at this proxy's own PRM endpoint, so Claude Code can start OAuth discovery.
func authorize(daemon authorizerd.Authorizerd, resource, action, prmURL string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		if token == "" {
			denyMissingToken(w, prmURL)
			return
		}

		principal, err := daemon.AuthorizeAccessToken(r.Context(), token, action, resource, nil)
		if err != nil {
			log.Printf("[mcp-reverse-proxy] REJECTED action=%s resource=%s: %v", action, resource, err)
			denyUnauthorized(w, prmURL, err)
			return
		}

		r.Header.Set("X-Athenz-Principal", principal.Name())
		if roles := principal.Roles(); len(roles) > 0 {
			r.Header.Set("X-Athenz-Role", strings.Join(roles, ","))
		}
		r.Header.Set("X-Athenz-Domain", athenzDomainOf(resource))
		log.Printf("[mcp-reverse-proxy] AUTHORIZED action=%s resource=%s principal=%s", action, resource, principal.Name())
		next.ServeHTTP(w, r)
	})
}

func athenzDomainOf(resource string) string {
	domain, _, ok := strings.Cut(resource, ":")
	if !ok {
		return resource
	}
	return domain
}

func denyMissingToken(w http.ResponseWriter, prmURL string) {
	w.Header().Set("WWW-Authenticate", fmt.Sprintf(`Bearer error="invalid_token", error_description="Missing Authorization header", resource_metadata=%q`, prmURL))
	http.Error(w, `{"error":"invalid_token","error_description":"Missing Authorization header"}`, http.StatusUnauthorized)
}

func denyUnauthorized(w http.ResponseWriter, prmURL string, cause error) {
	w.Header().Set("WWW-Authenticate", fmt.Sprintf(`Bearer error="invalid_token", error_description=%q, resource_metadata=%q`, cause.Error(), prmURL))
	http.Error(w, fmt.Sprintf(`{"error":"invalid_token","error_description":%q}`, cause.Error()), http.StatusUnauthorized)
}

func getEnv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
