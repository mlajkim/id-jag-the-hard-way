// End-to-end verification for Pattern 2b. Run after `make pattern-2b-port-forward`.
//
// A stock MCP client cannot complete this pattern unassisted (see
// ../README.md's feasibility table): the Access Token is never returned to
// the client, so there's no standard OAuth+PKCE flow a generic client can
// drive against the MCP server itself. This script plays the "local helper"
// role instead - PKCE login against Keycloak, DPoP key management, and the
// actual MCP call - so the whole chain can be verified by hand:
//
//   Client -> agentgateway jwtAuthentication -> dpop-verifier ext_authz ->
//   crossAppAccess ID-JAG exchange against the real ZTS -> forwarded AT ->
//   mcp-reverse-proxy's own Athenz check -> simple-mcp-server -> its own
//   delegated exchange -> api-server
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { getValidTokens } from "./src/auth.js";
import { ensureKeypair, generateEphemeralKeypair, makeProof } from "./src/dpop.js";
import { ensureRegistered } from "./src/register.js";

const DOCS_MCP_URL = process.env.PATTERN_2B_MCP_URL || "http://mcp.pattern-2b.localhost:3002/mcp";
const ECHO_MCP_URL = process.env.PATTERN_2B_ECHO_MCP_URL || "http://echo.pattern-2b.localhost:3002/mcp";

function dpopFetchWithKeys(keys) {
  return async (url, init) => {
    const proof = await makeProof(init?.method ?? "GET", url.toString(), keys);
    const headers = new Headers(init?.headers);
    headers.set("DPoP", proof);
    return fetch(url, { ...init, headers });
  };
}

async function callMcp(mcpUrl, idToken, keys) {
  const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), {
    requestInit: { headers: { Authorization: `Bearer ${idToken}` } },
    fetch: dpopFetchWithKeys(keys),
  });
  const client = new Client({ name: "pattern-2b-test-client", version: "1.0.0" }, { capabilities: {} });
  await client.connect(transport);
  return client;
}

async function testDocsFlow(idToken, accessToken, keys) {
  console.log("[test] registering DPoP key with dpop-verifier...");
  await ensureRegistered(accessToken, keys);

  console.log("[test] connecting to the Pattern 2b docs MCP and listing tools...");
  const client = await callMcp(DOCS_MCP_URL, idToken, keys);
  const { tools } = await client.listTools();
  console.log(
    "[test] tools:",
    tools.map((t) => t.name),
  );

  console.log("[test] calling get_k8s_docs...");
  const result = await client.callTool({ name: "get_k8s_docs", arguments: {} });
  console.log("[test] get_k8s_docs result:", JSON.stringify(result, null, 2));
  await client.close();
  console.log("[test] PASS: docs MCP end-to-end call succeeded");
}

async function testEchoFlow(idToken, keys) {
  console.log("[test] connecting to the Pattern 2b echo MCP and listing tools...");
  const client = await callMcp(ECHO_MCP_URL, idToken, keys);
  const { tools } = await client.listTools();
  console.log(
    "[test] echo tools:",
    tools.map((t) => t.name),
  );

  console.log("[test] calling echo_pattern_2b...");
  const result = await client.callTool({ name: "echo_pattern_2b", arguments: {} });
  console.log("[test] echo_pattern_2b result:", JSON.stringify(result, null, 2));
  await client.close();
  console.log("[test] PASS: echo MCP end-to-end call succeeded");
}

async function testNoAuthHeaderRejected(mcpUrl) {
  console.log(`[test] verifying a request with no Authorization header is rejected at ${mcpUrl}...`);
  const res = await fetch(mcpUrl, { method: "POST", headers: { "Content-Type": "application/json" } });
  if (res.status !== 401) {
    throw new Error(`expected 401 with no Authorization header, got ${res.status}`);
  }
  console.log("[test] PASS: no-auth request rejected with 401");
}

async function testWrongDpopKeyRejected(mcpUrl, idToken) {
  console.log(`[test] verifying an unregistered DPoP key is rejected at ${mcpUrl}...`);
  const ephemeralKeys = await generateEphemeralKeypair();
  const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), {
    requestInit: { headers: { Authorization: `Bearer ${idToken}` } },
    fetch: dpopFetchWithKeys(ephemeralKeys),
  });
  const client = new Client({ name: "pattern-2b-negative-test-client", version: "1.0.0" }, { capabilities: {} });
  try {
    await client.connect(transport);
    throw new Error("expected the gateway to reject an unpinned DPoP key, but the connection succeeded");
  } catch (e) {
    if (e.message?.includes("expected the gateway to reject")) throw e;
    console.log("[test] PASS: unpinned DPoP key rejected");
  }
}

async function main() {
  const { idToken, accessToken } = await getValidTokens();
  const keys = await ensureKeypair();

  await testNoAuthHeaderRejected(DOCS_MCP_URL);
  await testNoAuthHeaderRejected(ECHO_MCP_URL);
  await testDocsFlow(idToken, accessToken, keys);
  await testEchoFlow(idToken, keys);
  await testWrongDpopKeyRejected(DOCS_MCP_URL, idToken);
  await testWrongDpopKeyRejected(ECHO_MCP_URL, idToken);

  console.log("[test] all Pattern 2b end-to-end checks passed");
}

main().catch((e) => {
  console.error("[test] FAIL:", e);
  process.exit(1);
});
