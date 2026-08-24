// OAuth2 Authorization Server endpoints for the Pattern 3b BFF.
//
// The real Client (Claude Code, or any generic MCP client) discovers this
// gateway as the AS via GET /.well-known/oauth-authorization-server, then
// drives a standard PKCE authorization_code flow against it. This gateway is
// itself Keycloak's OIDC RP: it redirects the Client's browser to Keycloak,
// completes the login on the Client's behalf, and stores the resulting
// id_token in a server-side session. The Client is only ever handed the
// opaque session id, never the id_token and never a real Athenz Access
// Token - satisfying Pattern 3b's "remote id_token acquisition, AT never
// returned to the Client" design.
package main

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

// pendingAuth holds the real Client's own PKCE state (its redirect_uri) just
// long enough to complete the round trip through Keycloak.
type pendingAuth struct {
	codeVerifier string
	redirectURI  string
}

type oauthServer struct {
	publicBaseURL     string
	keycloakURL       string // server-to-server calls (in-cluster address)
	keycloakPublicURL string // where the human's browser is redirected
	keycloakRealm     string
	keycloakClientID  string // this gateway's own Keycloak client, not the Client's

	sessions *sessionStore

	mu      sync.Mutex
	pending map[string]pendingAuth
}

func newOAuthServer(publicBaseURL, keycloakURL, keycloakPublicURL, keycloakRealm, keycloakClientID string, sessions *sessionStore) *oauthServer {
	return &oauthServer{
		publicBaseURL:     publicBaseURL,
		keycloakURL:       keycloakURL,
		keycloakPublicURL: keycloakPublicURL,
		keycloakRealm:     keycloakRealm,
		keycloakClientID:  keycloakClientID,
		sessions:          sessions,
		pending:           make(map[string]pendingAuth),
	}
}

func (o *oauthServer) keycloakBase() string {
	return fmt.Sprintf("%s/realms/%s/protocol/openid-connect", o.keycloakURL, o.keycloakRealm)
}

func (o *oauthServer) keycloakPublicBase() string {
	return fmt.Sprintf("%s/realms/%s/protocol/openid-connect", o.keycloakPublicURL, o.keycloakRealm)
}

func (o *oauthServer) registerRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /.well-known/oauth-authorization-server", o.handleMetadata)
	mux.HandleFunc("POST /oauth/register", o.handleRegister)
	mux.HandleFunc("GET /oauth/authorize", o.handleAuthorize)
	mux.HandleFunc("GET /oauth/callback", o.handleCallback)
	mux.HandleFunc("POST /oauth/token", o.handleToken)
}

func (o *oauthServer) handleMetadata(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"issuer":                           o.publicBaseURL,
		"authorization_endpoint":           o.publicBaseURL + "/oauth/authorize",
		"token_endpoint":                   o.publicBaseURL + "/oauth/token",
		"registration_endpoint":            o.publicBaseURL + "/oauth/register",
		"response_types_supported":         []string{"code"},
		"grant_types_supported":            []string{"authorization_code"},
		"code_challenge_methods_supported": []string{"S256"},
	})
}

// handleRegister implements RFC 7591 dynamic client registration. Generic MCP
// clients (Claude Code included) expect this endpoint to exist; we accept any
// registration and return a stable client_id.
func (o *oauthServer) handleRegister(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ClientID     string   `json:"client_id"`
		RedirectURIs []string `json:"redirect_uris"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)

	clientID := body.ClientID
	if clientID == "" {
		clientID = "mcp-client-" + randomID()
	}
	redirectURIs := body.RedirectURIs
	if redirectURIs == nil {
		redirectURIs = []string{}
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"client_id":                  clientID,
		"client_id_issued_at":        time.Now().Unix(),
		"redirect_uris":              redirectURIs,
		"grant_types":                []string{"authorization_code"},
		"response_types":             []string{"code"},
		"token_endpoint_auth_method": "none",
	})
}

func (o *oauthServer) handleAuthorize(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	redirectURI := q.Get("redirect_uri")
	state := q.Get("state")
	if redirectURI == "" || state == "" {
		http.Error(w, "Missing redirect_uri or state", http.StatusBadRequest)
		return
	}

	verifier := generateVerifier()
	challenge := deriveChallenge(verifier)

	o.mu.Lock()
	o.pending[state] = pendingAuth{codeVerifier: verifier, redirectURI: redirectURI}
	o.mu.Unlock()

	params := url.Values{}
	params.Set("client_id", o.keycloakClientID)
	params.Set("response_type", "code")
	params.Set("redirect_uri", o.publicBaseURL+"/oauth/callback")
	params.Set("scope", "openid email profile")
	params.Set("state", state)
	params.Set("code_challenge", challenge)
	params.Set("code_challenge_method", "S256")

	http.Redirect(w, r, o.keycloakPublicBase()+"/auth?"+params.Encode(), http.StatusFound)
}

func (o *oauthServer) handleCallback(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	if kErr := q.Get("error"); kErr != "" {
		http.Error(w, "Keycloak error: "+kErr, http.StatusBadRequest)
		return
	}

	code := q.Get("code")
	state := q.Get("state")

	o.mu.Lock()
	pending, ok := o.pending[state]
	if ok {
		delete(o.pending, state)
	}
	o.mu.Unlock()

	if !ok || code == "" {
		http.Error(w, "Invalid state or missing code", http.StatusBadRequest)
		return
	}

	form := url.Values{}
	form.Set("grant_type", "authorization_code")
	form.Set("client_id", o.keycloakClientID)
	form.Set("code", code)
	form.Set("redirect_uri", o.publicBaseURL+"/oauth/callback")
	form.Set("code_verifier", pending.codeVerifier)

	tokenReq, err := http.NewRequest(http.MethodPost, o.keycloakBase()+"/token", strings.NewReader(form.Encode()))
	if err != nil {
		http.Error(w, "Failed to build Keycloak token request: "+err.Error(), http.StatusInternalServerError)
		return
	}
	tokenReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	// Keycloak derives each issued token's "iss" claim from the Host header of
	// this request, not from KEYCLOAK_URL's actual network target. Athenz ZTS
	// only recognizes the browser-facing KEYCLOAK_PUBLIC_URL as a trusted
	// issuer (see bootstrap-common/03-athenz.sh's issuerUri), so this request
	// must present that Host even though it physically connects to the
	// in-cluster KEYCLOAK_URL - otherwise ZTS cannot map the token's identity
	// to an Athenz principal and every role check fails.
	if publicHost := hostOf(o.keycloakPublicURL); publicHost != "" {
		tokenReq.Host = publicHost
	}

	resp, err := http.DefaultClient.Do(tokenReq)
	if err != nil {
		http.Error(w, "Keycloak token exchange failed: "+err.Error(), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	var tokenBody struct {
		IDToken string `json:"id_token"`
	}
	decodeErr := json.NewDecoder(resp.Body).Decode(&tokenBody)
	if resp.StatusCode >= 300 {
		http.Error(w, fmt.Sprintf("Keycloak token exchange failed: %d", resp.StatusCode), http.StatusBadGateway)
		return
	}
	if decodeErr != nil || tokenBody.IDToken == "" {
		http.Error(w, "Keycloak did not return an id_token", http.StatusBadGateway)
		return
	}

	exp := time.Now().Add(time.Hour).Unix()
	if claims, err := decodeJWTPayload(tokenBody.IDToken); err == nil {
		if e, ok := claims["exp"].(float64); ok {
			exp = int64(e)
		}
	}

	sessionID := o.sessions.create(tokenBody.IDToken, exp)

	// Redirect back to the real Client's redirect_uri with the session id as
	// the authorization code. Neither the id_token nor any Athenz token ever
	// reaches this response.
	redirectParams := url.Values{}
	redirectParams.Set("code", sessionID)
	redirectParams.Set("state", state)
	http.Redirect(w, r, pending.redirectURI+"?"+redirectParams.Encode(), http.StatusFound)
}

func (o *oauthServer) handleToken(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseForm(); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_request"})
		return
	}
	code := r.FormValue("code")
	if code == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{
			"error": "invalid_request", "error_description": "Missing code",
		})
		return
	}

	sess, ok := o.sessions.get(code)
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{
			"error": "invalid_grant", "error_description": "Code not found or expired",
		})
		return
	}

	expiresIn := sess.exp - time.Now().Unix()
	if expiresIn < 0 {
		expiresIn = 0
	}

	writeJSON(w, http.StatusOK, map[string]any{
		// The bearer credential handed back is the opaque session id, never a
		// real Athenz Access Token or the underlying id_token.
		"access_token": code,
		"token_type":   "Bearer",
		"expires_in":   expiresIn,
		"scope":        "openid email profile",
	})
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

// RFC 7636 helpers.

func generateVerifier() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return base64.RawURLEncoding.EncodeToString(b)
}

func deriveChallenge(verifier string) string {
	sum := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

func decodeJWTPayload(token string) (map[string]any, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return nil, fmt.Errorf("invalid JWT")
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, err
	}
	var claims map[string]any
	if err := json.Unmarshal(payload, &claims); err != nil {
		return nil, err
	}
	return claims, nil
}

func hostOf(rawURL string) string {
	u, err := url.Parse(rawURL)
	if err != nil {
		return ""
	}
	return u.Host
}
