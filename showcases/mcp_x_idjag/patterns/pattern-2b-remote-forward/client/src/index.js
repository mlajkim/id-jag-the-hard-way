import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { getValidTokens } from "./auth.js";
import { ensureKeypair, makeProof } from "./dpop.js";
import { ensureRegistered } from "./register.js";

// Bridges Claude Code's stdio MCP transport to the Pattern 2b gateway's HTTP
// endpoint. Claude Code's own OAuth support only drives standard
// authorization_code+PKCE against the MCP server itself (RFC 9728 PRM + RFC
// 8414 AS Metadata discovery, then presenting the returned access_token as a
// Bearer credential to that same server) - Pattern 2b never returns an
// Access Token to the Client at all, and requires presenting an id_token
// plus a DPoP proof instead (see ../../README.md's Feasibility table: no
// general-purpose MCP client can complete this pattern unassisted). This
// script plays that missing "local helper" role: Claude Code only ever sees
// a plain local stdio MCP server.
//
// IMPORTANT: never use console.log here - StdioServerTransport treats
// process.stdout as the raw MCP JSON-RPC channel, and any stray stdout write
// would corrupt the protocol stream. Always use console.error.

const MCP_URL = process.env.PATTERN_2B_MCP_URL || "http://mcp.pattern-2b.localhost:3002/mcp";

async function main() {
  const { idToken, accessToken } = await getValidTokens();
  const keys = await ensureKeypair();
  await ensureRegistered(accessToken, keys);

  const headers = { Authorization: `Bearer ${idToken}` };
  const dpopFetch = async (url, init) => {
    const proof = await makeProof(init?.method ?? "GET", url.toString(), keys);
    const withProof = new Headers(init?.headers);
    withProof.set("DPoP", proof);
    return fetch(url, { ...init, headers: withProof });
  };

  const upstream = new StreamableHTTPClientTransport(new URL(MCP_URL), {
    requestInit: { headers },
    fetch: dpopFetch,
  });
  const downstream = new StdioServerTransport();

  upstream.onmessage = (msg) => downstream.send(msg);
  downstream.onmessage = (msg) => upstream.send(msg);

  const shutdown = () => {
    upstream.close().catch(() => {});
    downstream.close().catch(() => {});
    process.exit(0);
  };
  upstream.onclose = shutdown;
  downstream.onclose = shutdown;
  upstream.onerror = (e) => console.error("[pattern-2b-client] upstream error:", e);
  downstream.onerror = (e) => console.error("[pattern-2b-client] stdio error:", e);

  await upstream.start();
  await downstream.start();
  console.error(`[pattern-2b-client] bridging stdio <-> ${MCP_URL}`);
}

main().catch((e) => {
  console.error("[pattern-2b-client] fatal:", e);
  process.exit(1);
});
