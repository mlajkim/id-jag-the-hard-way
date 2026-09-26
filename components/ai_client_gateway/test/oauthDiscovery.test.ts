import assert from "node:assert/strict";
import { once } from "node:events";
import fs from "node:fs";
import { after, mock, test } from "node:test";
import { fileURLToPath } from "node:url";
import express from "express";

// Discovery is public: never load local credentials for these HTTP tests.
const credentialPaths = new Set(
  ["ai-client-gateway.crt", "ai-client-gateway.key", "ca.crt"].map((name) =>
    fileURLToPath(new URL(`../certs/${name}`, import.meta.url)),
  ),
);
const readFileSync = fs.readFileSync;
mock.method(fs, "readFileSync", (path: any, ...args: any[]) => {
  if (credentialPaths.has(String(path))) return Buffer.from("unused test fixture");
  return Reflect.apply(readFileSync, fs, [path, ...args]);
});

const app = express();
const server = app.listen(0, "127.0.0.1");
await once(server, "listening");
const address = server.address();
assert.ok(address && typeof address !== "string");
const baseUrl = `http://127.0.0.1:${address.port}`;
process.env.PUBLIC_BASE_URL = baseUrl;

const { default: oauthRouter } = await import("../src/routes/oauth.ts");
const { proxyMiddleware } = await import("../src/middlewares/proxy.ts");
app.use(express.json());
app.use(oauthRouter);
app.use(proxyMiddleware);

after(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  mock.restoreAll();
});

for (const { path, resourcePath, metadataPath } of [
  {
    path: "/mcp",
    resourcePath: "/mcp",
    metadataPath: "/.well-known/oauth-protected-resource/mcp",
  },
  {
    path: "/tool-operation",
    resourcePath: "",
    metadataPath: "/.well-known/oauth-protected-resource",
  },
]) {
  test(`OAuth discovery from an unauthenticated ${path} request`, async () => {
    const denied = await fetch(`${baseUrl}${path}`);
    assert.equal(denied.status, 401);
    const challenge = denied.headers.get("www-authenticate");
    assert.ok(challenge);
    const metadataUrl = /resource_metadata="([^"]+)"/.exec(challenge)?.[1];
    assert.equal(metadataUrl, `${baseUrl}${metadataPath}`);

    const resourceResponse = await fetch(metadataUrl!);
    assert.equal(resourceResponse.status, 200);
    const resource = await resourceResponse.json();
    assert.equal(resource.resource, `${baseUrl}${resourcePath}`);
    assert.deepEqual(resource.authorization_servers, [baseUrl]);

    const authorizationResponse = await fetch(
      `${resource.authorization_servers[0]}/.well-known/oauth-authorization-server`,
    );
    assert.equal(authorizationResponse.status, 200);
    const authorization = await authorizationResponse.json();
    assert.equal(authorization.issuer, baseUrl);
    assert.equal(authorization.authorization_endpoint, `${baseUrl}/oauth/authorize`);
    assert.equal(authorization.token_endpoint, `${baseUrl}/oauth/token`);
    assert.ok(authorization.code_challenge_methods_supported.includes("S256"));
  });
}

test("legacy authorization-server discovery and client registration remain available", async () => {
  const response = await fetch(`${baseUrl}/.well-known/oauth-authorization-server`);
  assert.equal(response.status, 200);
  const metadata = await response.json();
  assert.equal(metadata.issuer, baseUrl);
  assert.equal(metadata.registration_endpoint, `${baseUrl}/oauth/register`);

  const redirectUri = "http://127.0.0.1:54321/callback";
  const registrationResponse = await fetch(metadata.registration_endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_id: "test-cli", redirect_uris: [redirectUri] }),
  });
  assert.equal(registrationResponse.status, 201);
  const registration = await registrationResponse.json();
  assert.equal(registration.client_id, "test-cli");
  assert.deepEqual(registration.redirect_uris, [redirectUri]);
  assert.equal(registration.token_endpoint_auth_method, "none");

  const authorizationUrl = new URL(metadata.authorization_endpoint);
  authorizationUrl.search = new URLSearchParams({
    client_id: registration.client_id,
    redirect_uri: redirectUri,
    state: "test-oauth-state",
    code_challenge: "test-pkce-challenge",
    code_challenge_method: "S256",
  }).toString();
  const authorizationResponse = await fetch(authorizationUrl, { redirect: "manual" });
  assert.equal(authorizationResponse.status, 302);
  const redirect = new URL(authorizationResponse.headers.get("location")!);
  assert.equal(redirect.pathname, "/realms/master/protocol/openid-connect/auth");
  assert.equal(redirect.searchParams.get("redirect_uri"), `${baseUrl}/oauth/callback`);
  assert.equal(redirect.searchParams.get("state"), "test-oauth-state");
  assert.equal(redirect.searchParams.get("code_challenge_method"), "S256");
});
