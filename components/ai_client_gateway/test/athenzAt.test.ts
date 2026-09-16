import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import https from "node:https";
import { after, mock, test } from "node:test";
import { fileURLToPath } from "node:url";

// Never load local credentials or contact ZTS in these request-flow tests.
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

const { getAccessToken } = await import("../src/utils/athenzAt.ts");
const { createSession } = await import("../src/utils/sessionStore.ts");
after(() => mock.restoreAll());

function syntheticJwt(payload: Record<string, unknown>) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode(payload)}.`;
}

for (const { name, audience, scope } of [
  { name: "multi-domain tool call", audience: "mcp", scope: "mcp:role.mcp-accessor api:role.docs-getter" },
  { name: "MCP discovery scope", audience: "mcp", scope: "mcp:role.mcp-accessor" },
  { name: "legacy single-domain configuration", audience: undefined, scope: "api:role.mcp-accessor api:role.docs-getter" },
]) {
  test(name, async (t) => {
    const previousAudience = process.env.ATHENZ_ACCESS_TOKEN_AUDIENCE;
    if (audience) process.env.ATHENZ_ACCESS_TOKEN_AUDIENCE = audience;
    else delete process.env.ATHENZ_ACCESS_TOKEN_AUDIENCE;
    t.after(() => {
      if (previousAudience === undefined) delete process.env.ATHENZ_ACCESS_TOKEN_AUDIENCE;
      else process.env.ATHENZ_ACCESS_TOKEN_AUDIENCE = previousAudience;
    });

    const expiry = Math.floor(Date.now() / 1000) + 3600;
    const idToken = syntheticJwt({ sub: "test-user", exp: expiry });
    const idJag = syntheticJwt({ scope, exp: expiry });
    const accessToken = syntheticJwt({ aud: audience ?? "api", scp: scope.split(" "), exp: expiry });
    const requests: URLSearchParams[] = [];
    t.mock.method(https, "request", (_options: unknown, callback: (response: any) => void) => {
      const request = new EventEmitter() as any;
      let body = "";
      request.write = (chunk: string) => { body += chunk; };
      request.end = () => {
        requests.push(new URLSearchParams(body));
        const response = Object.assign(new EventEmitter(), { statusCode: 200 });
        callback(response);
        response.emit("data", JSON.stringify({ access_token: requests.length === 1 ? idJag : accessToken }));
        response.emit("end");
      };
      return request;
    });

    const session = createSession(idToken, expiry);
    const result = await getAccessToken({ headers: { authorization: `Bearer ${session}` } }, scope);
    assert.equal(result, accessToken);
    assert.equal(requests.length, 2);
    assert.equal(requests[0].get("subject_token"), idToken);
    assert.equal(requests[0].get("requested_token_type"), "urn:ietf:params:oauth:token-type:id-jag");
    assert.equal(requests[0].get("audience"), "https://athenz-zts-server.athenz:4443/zts/v1");
    assert.equal(requests[0].get("scope"), scope);
    assert.equal(requests[1].get("grant_type"), "urn:ietf:params:oauth:grant-type:jwt-bearer");
    assert.equal(requests[1].get("assertion"), idJag);
    assert.equal(requests[1].get("scope"), scope);
    assert.equal(requests[1].get("audience"), audience ?? null);
  });
}
