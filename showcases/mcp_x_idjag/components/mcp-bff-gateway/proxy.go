package main

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
)

var hopByHopHeaders = map[string]bool{
	"connection":          true,
	"keep-alive":          true,
	"proxy-authenticate":  true,
	"proxy-authorization": true,
	"te":                  true,
	"trailer":             true,
	"transfer-encoding":   true,
	"upgrade":             true,
	"authorization":       true,
}

// proxyHandler is mounted at "/" and handles every path that isn't one of the
// OAuth AS endpoints or /health - i.e. the actual MCP traffic under /docs and
// /echo. It requires a valid session (Bearer <session-id>), resolves the
// session's id_token, and forwards the request unmodified to agentgateway
// with that id_token as a plain Bearer credential - no DPoP proof and no
// client certificate (see ../../patterns/pattern-3b-remote-forward/README.md's
// "Deviations from the ideal design" for why).
type proxyHandler struct {
	agentgatewayBaseURL string
	publicBaseURL       string
	sessions            *sessionStore
	client              *http.Client
}

func newProxyHandler(agentgatewayBaseURL, publicBaseURL string, sessions *sessionStore) *proxyHandler {
	return &proxyHandler{
		agentgatewayBaseURL: agentgatewayBaseURL,
		publicBaseURL:       publicBaseURL,
		sessions:            sessions,
		client:              &http.Client{},
	}
}

func (p *proxyHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path == "/health" {
		http.Error(w, `{"error":"not_found"}`, http.StatusNotFound)
		return
	}

	idToken, ok := p.authenticate(r)
	if !ok {
		w.Header().Set("WWW-Authenticate", fmt.Sprintf(
			`Bearer realm=%q, resource_metadata=%q`,
			p.publicBaseURL, p.publicBaseURL+"/.well-known/oauth-authorization-server",
		))
		http.Error(w, `{"error":"unauthorized","message":"No valid session. Authenticate via the gateway OAuth2 flow."}`, http.StatusUnauthorized)
		return
	}

	upstream, err := url.Parse(p.agentgatewayBaseURL)
	if err != nil {
		http.Error(w, `{"error":"internal_error"}`, http.StatusInternalServerError)
		return
	}
	target := *upstream
	target.Path = r.URL.Path
	target.RawQuery = r.URL.RawQuery

	req, err := http.NewRequestWithContext(r.Context(), r.Method, target.String(), r.Body)
	if err != nil {
		http.Error(w, `{"error":"internal_error"}`, http.StatusInternalServerError)
		return
	}
	for key, values := range r.Header {
		if hopByHopHeaders[strings.ToLower(key)] {
			continue
		}
		for _, v := range values {
			req.Header.Add(key, v)
		}
	}
	req.Header.Set("Authorization", "Bearer "+idToken)

	resp, err := p.client.Do(req)
	if err != nil {
		log.Printf("[mcp-bff-gateway] agentgateway request failed: %v", err)
		http.Error(w, fmt.Sprintf(`{"error":"upstream_request_failed","message":%q}`, err.Error()), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	for key, values := range resp.Header {
		if hopByHopHeaders[strings.ToLower(key)] {
			continue
		}
		for _, v := range values {
			w.Header().Add(key, v)
		}
	}
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}

func (p *proxyHandler) authenticate(r *http.Request) (string, bool) {
	authHeader := r.Header.Get("Authorization")
	if !strings.HasPrefix(authHeader, "Bearer ") {
		return "", false
	}
	sess, ok := p.sessions.get(strings.TrimPrefix(authHeader, "Bearer "))
	if !ok {
		return "", false
	}
	return sess.idToken, true
}
