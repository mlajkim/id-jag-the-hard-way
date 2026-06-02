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
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Domain             string
	PolicyDir          string
	ZTSURL             string
	Interval           time.Duration
	Timeout            time.Duration
	RunOnce            bool
	Required           bool
	InsecureSkipVerify bool

	SecretName      string
	SecretNamespace string
	CertKey         string
	PrivateKeyKey   string
	CAKey           string

	KubeTokenFile string
	KubeCAFile    string
}

type k8sSecret struct {
	Data map[string][]byte `json:"data"`
}

func env(name, fallback string) string {
	v := strings.TrimSpace(os.Getenv(name))
	if v == "" {
		return fallback
	}
	return v
}

func envBool(name string, fallback bool) bool {
	v := strings.TrimSpace(strings.ToLower(os.Getenv(name)))
	if v == "" {
		return fallback
	}

	switch v {
	case "1", "true", "yes", "y", "on":
		return true
	case "0", "false", "no", "n", "off":
		return false
	default:
		return fallback
	}
}

func envSeconds(name string, fallback int) time.Duration {
	v := strings.TrimSpace(os.Getenv(name))
	if v == "" {
		return time.Duration(fallback) * time.Second
	}

	i, err := strconv.Atoi(v)
	if err != nil || i <= 0 {
		return time.Duration(fallback) * time.Second
	}

	return time.Duration(i) * time.Second
}

func namespaceFromFile() string {
	b, err := os.ReadFile("/var/run/secrets/kubernetes.io/serviceaccount/namespace")
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(b))
}

func loadConfig() Config {
	ns := env("ZPU_SECRET_NAMESPACE", "")
	if ns == "" {
		ns = namespaceFromFile()
	}
	if ns == "" {
		ns = "api"
	}

	return Config{
		Domain:             env("ZPU_DOMAIN", "api"),
		PolicyDir:          env("ZPU_POLICY_DIR", "/policies"),
		ZTSURL:             env("ZTS_URL", "https://athenz-zts-server.athenz:4443/zts/v1"),
		Interval:           envSeconds("ZPU_INTERVAL_SECONDS", 5),
		Timeout:            envSeconds("ZPU_TIMEOUT_SECONDS", 10),
		RunOnce:            envBool("ZPU_RUN_ONCE", false),
		Required:           envBool("ZPU_REQUIRED", true),
		InsecureSkipVerify: envBool("ZTS_INSECURE_SKIP_VERIFY", true),

		SecretName:      env("ZPU_SECRET_NAME", "api-zpu-cert"),
		SecretNamespace: ns,
		CertKey:         env("ZPU_CERT_KEY", "cert"),
		PrivateKeyKey:   env("ZPU_PRIVATE_KEY_KEY", "key"),
		CAKey:           env("ZPU_CA_KEY", "ca"),

		KubeTokenFile: env("KUBERNETES_TOKEN_FILE", "/var/run/secrets/kubernetes.io/serviceaccount/token"),
		KubeCAFile:    env("KUBERNETES_CA_FILE", "/var/run/secrets/kubernetes.io/serviceaccount/ca.crt"),
	}
}

func k8sHTTPClient(cfg Config) (*http.Client, error) {
	caPEM, err := os.ReadFile(cfg.KubeCAFile)
	if err != nil {
		return nil, fmt.Errorf("read kube ca file: %w", err)
	}

	roots := x509.NewCertPool()
	if !roots.AppendCertsFromPEM(caPEM) {
		return nil, fmt.Errorf("failed to parse kube ca")
	}

	return &http.Client{
		Timeout: cfg.Timeout,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{
				RootCAs:    roots,
				MinVersion: tls.VersionTLS12,
			},
		},
	}, nil
}

func fetchSecret(ctx context.Context, cfg Config) (map[string][]byte, error) {
	host := env("KUBERNETES_SERVICE_HOST", "kubernetes.default.svc")
	port := env("KUBERNETES_SERVICE_PORT", "443")

	tokenBytes, err := os.ReadFile(cfg.KubeTokenFile)
	if err != nil {
		return nil, fmt.Errorf("read kube token file: %w", err)
	}

	client, err := k8sHTTPClient(cfg)
	if err != nil {
		return nil, err
	}

	endpoint := fmt.Sprintf(
		"https://%s:%s/api/v1/namespaces/%s/secrets/%s",
		host,
		port,
		url.PathEscape(cfg.SecretNamespace),
		url.PathEscape(cfg.SecretName),
	)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(string(tokenBytes)))

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("k8s secret request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		return nil, fmt.Errorf("k8s secret request returned status=%d body=%s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var secret k8sSecret
	if err := json.NewDecoder(resp.Body).Decode(&secret); err != nil {
		return nil, fmt.Errorf("decode k8s secret: %w", err)
	}

	if len(secret.Data) == 0 {
		return nil, fmt.Errorf("secret %s/%s has no data", cfg.SecretNamespace, cfg.SecretName)
	}

	return secret.Data, nil
}

func requiredSecretData(data map[string][]byte, key string) ([]byte, error) {
	v, ok := data[key]
	if !ok || len(v) == 0 {
		return nil, fmt.Errorf("missing secret data key %q", key)
	}
	return v, nil
}

func ztsHTTPClient(cfg Config, certPEM, keyPEM, caPEM []byte) (*http.Client, error) {
	clientCert, err := tls.X509KeyPair(certPEM, keyPEM)
	if err != nil {
		return nil, fmt.Errorf("parse client cert/key: %w", err)
	}

	tlsConfig := &tls.Config{
		Certificates:       []tls.Certificate{clientCert},
		InsecureSkipVerify: cfg.InsecureSkipVerify, // matches the tutorial's curl -k behavior
		MinVersion:         tls.VersionTLS12,
	}

	if !cfg.InsecureSkipVerify {
		roots := x509.NewCertPool()
		if !roots.AppendCertsFromPEM(caPEM) {
			return nil, fmt.Errorf("failed to parse zts ca")
		}
		tlsConfig.RootCAs = roots
	}

	return &http.Client{
		Timeout: cfg.Timeout,
		Transport: &http.Transport{
			TLSClientConfig: tlsConfig,
		},
	}, nil
}

func policyFilePath(cfg Config) string {
	fileDomain := strings.ReplaceAll(cfg.Domain, ".", "_")
	return filepath.Join(cfg.PolicyDir, fileDomain+".pol")
}

func syncPolicy(ctx context.Context, cfg Config) error {
	secretData, err := fetchSecret(ctx, cfg)
	if err != nil {
		return err
	}

	certPEM, err := requiredSecretData(secretData, cfg.CertKey)
	if err != nil {
		return err
	}

	keyPEM, err := requiredSecretData(secretData, cfg.PrivateKeyKey)
	if err != nil {
		return err
	}

	caPEM, err := requiredSecretData(secretData, cfg.CAKey)
	if err != nil {
		return err
	}

	client, err := ztsHTTPClient(cfg, certPEM, keyPEM, caPEM)
	if err != nil {
		return err
	}

	ztsBase := strings.TrimRight(cfg.ZTSURL, "/")
	endpoint := fmt.Sprintf("%s/domain/%s/signed_policy_data", ztsBase, url.PathEscape(cfg.Domain))

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return err
	}

	req.Header.Set("Accept", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("zts policy request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("read zts response: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		snippet := string(body)
		if len(snippet) > 1024 {
			snippet = snippet[:1024]
		}
		return fmt.Errorf("zts returned status=%d body=%s", resp.StatusCode, strings.TrimSpace(snippet))
	}

	if err := os.MkdirAll(cfg.PolicyDir, 0755); err != nil {
		return fmt.Errorf("mkdir policy dir: %w", err)
	}

	outFile := policyFilePath(cfg)
	tmpFile := fmt.Sprintf("%s.tmp.%d", outFile, os.Getpid())

	if err := os.WriteFile(tmpFile, body, 0644); err != nil {
		return fmt.Errorf("write temp policy file: %w", err)
	}

	if err := os.Rename(tmpFile, outFile); err != nil {
		_ = os.Remove(tmpFile)
		return fmt.Errorf("replace policy file: %w", err)
	}

	log.Printf("synced domain=%s policy=%s bytes=%d", cfg.Domain, outFile, len(body))
	return nil
}

func main() {
	log.SetFlags(log.LstdFlags | log.Lmicroseconds)

	cfg := loadConfig()

	log.Printf(
		"starting zpu domain=%s zts=%s secret=%s/%s policy_dir=%s interval=%s run_once=%t required=%t insecure_tls=%t",
		cfg.Domain,
		cfg.ZTSURL,
		cfg.SecretNamespace,
		cfg.SecretName,
		cfg.PolicyDir,
		cfg.Interval,
		cfg.RunOnce,
		cfg.Required,
		cfg.InsecureSkipVerify,
	)

	run := func() error {
		ctx, cancel := context.WithTimeout(context.Background(), cfg.Timeout)
		defer cancel()
		return syncPolicy(ctx, cfg)
	}

	if cfg.RunOnce {
		if err := run(); err != nil {
			log.Printf("initial sync failed: %v", err)
			if cfg.Required {
				os.Exit(1)
			}
			os.Exit(0)
		}
		os.Exit(0)
	}

	for {
		if err := run(); err != nil {
			log.Printf("sync failed: %v", err)
		}
		time.Sleep(cfg.Interval)
	}
}
