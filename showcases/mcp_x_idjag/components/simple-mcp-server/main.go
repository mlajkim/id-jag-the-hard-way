// Command simple-mcp-server is an intentionally unauthenticated MCP server.
//
// It exists purely to demonstrate Pattern 3a's data-plane split: all
// authentication, RFC 9728 discovery, and Athenz-role authorization happen in
// the mcp-reverse-proxy sidecar in front of this process (see
// ../mcp-reverse-proxy), not here - this server has no OAuth awareness at all.
// It trusts that any request reaching it has already been authorized, and
// simply re-delegates the caller's Access Token to backend-api via an Athenz
// ID-JAG token-exchange, mirroring api_server/mcp/src/utils/exchange-athenz-at.ts.
package main

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// authHeaderKey stashes the raw incoming Authorization header in the request
// context so tool handlers can re-delegate it, without this server ever
// validating it itself (that is the reverse-proxy sidecar's job).
type authHeaderKey struct{}

type getK8sDocsArgs struct {
	Query string `json:"query,omitempty" jsonschema:"optional search query for Kubernetes docs"`
}

func main() {
	port := getEnv("PORT", "8081")
	backendAPIURL := getEnv("BACKEND_API_URL", "http://api-server.api:8080")
	backendAPIPath := getEnv("BACKEND_API_PATH", "/api/docs")
	ztsURL := getEnv("ZTS_URL", "https://athenz-zts-server.athenz:4443/zts/v1")
	scope := getEnv("BACKEND_SCOPE", "api:role.docs-getter")

	exchanger, err := newTokenExchanger(ztsURL,
		getEnv("ATHENZ_CERT_FILE", "/var/run/athenz/service.cert.pem"),
		getEnv("ATHENZ_KEY_FILE", "/var/run/athenz/service.key.pem"),
		getEnv("ATHENZ_CA_FILE", "/var/run/athenz/ca.cert.pem"),
	)
	if err != nil {
		log.Fatalf("failed to initialize Athenz token exchanger: %v", err)
	}

	server := mcp.NewServer(&mcp.Implementation{Name: "simple-mcp-server", Version: "0.1.0"}, nil)
	mcp.AddTool(server, &mcp.Tool{
		Name:        "get_k8s_docs",
		Description: "Get Kubernetes documentation from backend-api, re-delegating the caller's Access Token via an Athenz ID-JAG token exchange.",
	}, func(ctx context.Context, req *mcp.CallToolRequest, args getK8sDocsArgs) (*mcp.CallToolResult, any, error) {
		token, _ := ctx.Value(authHeaderKey{}).(string)
		token = strings.TrimPrefix(token, "Bearer ")
		if token == "" {
			return nil, nil, fmt.Errorf("missing incoming Authorization header (expected the reverse-proxy sidecar to forward it)")
		}

		exchanged, err := exchanger.exchange(ctx, token, scope)
		if err != nil {
			return nil, nil, fmt.Errorf("Athenz token exchange for scope %q failed: %w", scope, err)
		}

		body, status, err := callBackendAPI(ctx, backendAPIURL+backendAPIPath, exchanged)
		if err != nil {
			return nil, nil, fmt.Errorf("backend-api call failed: %w", err)
		}
		if status >= 400 {
			return nil, nil, fmt.Errorf("backend-api returned HTTP %d: %s", status, body)
		}

		return &mcp.CallToolResult{
			Content: []mcp.Content{&mcp.TextContent{Text: string(body)}},
		}, nil, nil
	})

	mcpHandler := mcp.NewStreamableHTTPHandler(func(*http.Request) *mcp.Server { return server }, nil)

	mux := http.NewServeMux()
	mux.Handle("/mcp", withAuthHeader(mcpHandler))

	log.Printf("simple-mcp-server listening on :%s (backend-api: %s%s)", port, backendAPIURL, backendAPIPath)
	if err := http.ListenAndServe(":"+port, mux); err != nil {
		log.Fatal(err)
	}
}

func withAuthHeader(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := context.WithValue(r.Context(), authHeaderKey{}, r.Header.Get("Authorization"))
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func getEnv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// tokenExchanger performs the id_token-free re-delegation step of the ID-JAG
// chain: it exchanges an already-issued Access Token for a new one scoped to
// backend-api, presenting its own Athenz mTLS identity (Copper Argos-issued)
// as the calling actor. Mirrors exchange-athenz-at.ts's token-exchange grant.
type tokenExchanger struct {
	ztsURL     string
	httpClient *http.Client
}

func newTokenExchanger(ztsURL, certFile, keyFile, caFile string) (*tokenExchanger, error) {
	cert, err := tls.LoadX509KeyPair(certFile, keyFile)
	if err != nil {
		return nil, fmt.Errorf("load Athenz identity cert/key: %w", err)
	}
	caPEM, err := os.ReadFile(caFile)
	if err != nil {
		return nil, fmt.Errorf("read Athenz CA bundle: %w", err)
	}
	caPool := x509.NewCertPool()
	if !caPool.AppendCertsFromPEM(caPEM) {
		return nil, fmt.Errorf("no valid certificates found in %s", caFile)
	}

	return &tokenExchanger{
		ztsURL: ztsURL,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
			Transport: &http.Transport{
				TLSClientConfig: &tls.Config{
					Certificates: []tls.Certificate{cert},
					RootCAs:      caPool,
				},
			},
		},
	}, nil
}

// exchange re-scopes receivedToken (the AT the client presented to the
// reverse-proxy) into a new AT for scope, via RFC 8693 token-exchange. The
// audience domain is derived from the scope's "<domain>:role.<role>" prefix,
// matching exchange-athenz-at.ts's `scope.split(":role.")[0]`.
func (e *tokenExchanger) exchange(ctx context.Context, receivedToken, scope string) (string, error) {
	audience, _, ok := strings.Cut(scope, ":role.")
	if !ok {
		return "", fmt.Errorf("scope %q is not in the expected <domain>:role.<role> form", scope)
	}

	form := url.Values{
		"grant_type":         {"urn:ietf:params:oauth:grant-type:token-exchange"},
		"subject_token":      {receivedToken},
		"subject_token_type": {"urn:ietf:params:oauth:token-type:access_token"},
		"scope":              {scope},
		"audience":           {audience},
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimSuffix(e.ztsURL, "/")+"/oauth2/token", strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := e.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("ZTS token-exchange returned HTTP %d: %s", resp.StatusCode, body)
	}

	var tokenResp struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.Unmarshal(body, &tokenResp); err != nil {
		return "", fmt.Errorf("failed to parse ZTS response: %w", err)
	}
	if tokenResp.AccessToken == "" {
		return "", fmt.Errorf("ZTS response had no access_token")
	}
	return tokenResp.AccessToken, nil
}

func callBackendAPI(ctx context.Context, targetURL, accessToken string) ([]byte, int, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, targetURL, nil)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, 0, err
	}
	return body, resp.StatusCode, nil
}
