import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import open from "open";

// Runs the authorization_code+PKCE dance directly against this repo's
// Keycloak as a public client (no secret - this process lives on the
// developer's own machine, so there's no confidential backend to hold one;
// see register.sh's create-client.sh call with the "public" client type).
// Keycloak is the identity provider itself here (no OIDC broker in front of
// it, unlike test-mcp-gateway's Dex-in-front-of-Keycloak setup) - tokens
// carry the same iss the ZTS KeycloakTokenExchangeProvider trust config in
// bootstrap-common/03-athenz.sh already expects.

const KEYCLOAK_BASE_URL = process.env.KEYCLOAK_BASE_URL || "http://localhost:34443/realms/master";
const KEYCLOAK_CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID || "human.idjag-learner.pattern2b-client";
const CALLBACK_PORT = Number(process.env.PATTERN_2B_CALLBACK_PORT || 8765);
// Must exactly match a redirectURIs entry registered by register.sh.
const REDIRECT_URI = `http://127.0.0.1:${CALLBACK_PORT}/callback`;
const CACHE_PATH =
  process.env.PATTERN_2B_TOKEN_CACHE || path.join(os.homedir(), ".config", "pattern-2b-connector", "token.json");
// Coordinates multiple connector runs sharing the same token cache, so only
// one of them opens a browser when none of them has a valid cached id_token
// yet - the fixed CALLBACK_PORT above couldn't be bound by two processes at
// once anyway.
const LOCK_PATH = path.join(path.dirname(CACHE_PATH), "login.lock");
const LOCK_STALE_MS = 3 * 60 * 1000; // a lock older than this implies its owner crashed
const LOGIN_WAIT_TIMEOUT_MS = 5 * 60 * 1000; // how long a follower waits for the leader to finish
const POLL_INTERVAL_MS = 1000;

function b64url(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Keycloak returns access_token as a JWT sharing the same signing key/claims
// shape as id_token, so it decodes the same way.
function decodeExp(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    return payload.exp ?? null;
  } catch {
    return null;
  }
}

// Both tokens come from the same Keycloak /token call, so they're cached and
// invalidated together - there's no separate refresh flow (no offline_access
// scope is requested), so once either is near expiry a fresh login redoes both.
function readCache() {
  try {
    const { id_token, id_token_exp, access_token, access_token_exp } = JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
    // 60s safety margin so we don't hand a token that expires mid-flight.
    const marginMs = Date.now() + 60_000;
    if (id_token && id_token_exp * 1000 > marginMs && access_token && access_token_exp * 1000 > marginMs) {
      return { idToken: id_token, accessToken: access_token };
    }
  } catch {
    // missing/corrupt cache is just a cache miss
  }
  return null;
}

function writeCache({ idToken, idTokenExp, accessToken, accessTokenExp }) {
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true, mode: 0o700 });
  fs.writeFileSync(
    CACHE_PATH,
    JSON.stringify({
      id_token: idToken,
      id_token_exp: idTokenExp,
      access_token: accessToken,
      access_token_exp: accessTokenExp,
    }),
    { mode: 0o600 },
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Atomic exclusive create: succeeds only if no other process holds the lock.
function tryAcquireLock() {
  try {
    fs.mkdirSync(path.dirname(LOCK_PATH), { recursive: true, mode: 0o700 });
    fs.closeSync(fs.openSync(LOCK_PATH, "wx"));
    return true;
  } catch (e) {
    if (e.code === "EEXIST") return false;
    throw e;
  }
}

function releaseLock() {
  fs.rmSync(LOCK_PATH, { force: true });
}

// Polls for the lock holder ("leader") to finish. Resolves with the
// { idToken, accessToken } it produced, or null if the leader gave up
// (released the lock without a valid cache appearing) or its lock turned out
// to be stale (crashed).
async function waitForLeader(deadlineMs) {
  while (Date.now() < deadlineMs) {
    const cached = readCache();
    if (cached) return cached;
    if (!fs.existsSync(LOCK_PATH)) return null;
    try {
      if (Date.now() - fs.statSync(LOCK_PATH).mtimeMs > LOCK_STALE_MS) {
        console.error("[pattern-2b-client] another process's login lock looks abandoned, taking over");
        fs.rmSync(LOCK_PATH, { force: true });
        return null;
      }
    } catch {
      // lock disappeared between the existsSync check and stat - loop and recheck the cache
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error("timed out waiting for another pattern-2b-client process to finish logging in");
}

function waitForCallback(expectedState) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://127.0.0.1:${CALLBACK_PORT}`);
      if (url.pathname !== "/callback") {
        res.writeHead(404).end();
        return;
      }
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<html><body>Login complete, you can close this tab.</body></html>");
      server.close();
      if (state !== expectedState) {
        reject(new Error(`state mismatch: sent ${expectedState} got ${state}`));
      } else if (!code) {
        reject(new Error("no ?code= in callback"));
      } else {
        resolve(code);
      }
    });
    server.on("error", reject);
    server.listen(CALLBACK_PORT, "127.0.0.1");
  });
}

async function loginViaBrowser() {
  const codeVerifier = b64url(crypto.randomBytes(32));
  const codeChallenge = b64url(crypto.createHash("sha256").update(codeVerifier).digest());
  const state = b64url(crypto.randomBytes(16));

  const authUrl = new URL(`${KEYCLOAK_BASE_URL}/protocol/openid-connect/auth`);
  authUrl.searchParams.set("client_id", KEYCLOAK_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid profile email");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  const callbackPromise = waitForCallback(state);

  try {
    await open(authUrl.toString());
    console.error("[pattern-2b-client] opened browser for Keycloak login");
  } catch {
    console.error(`[pattern-2b-client] could not open a browser automatically - open this URL manually:\n${authUrl}`);
  }

  const code = await callbackPromise;

  const tokenRes = await fetch(`${KEYCLOAK_BASE_URL}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: KEYCLOAK_CLIENT_ID,
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: codeVerifier,
    }),
  });
  const tokenBody = await tokenRes.json();
  if (!tokenRes.ok) {
    throw new Error(`Keycloak token exchange failed: ${tokenRes.status} ${JSON.stringify(tokenBody)}`);
  }

  const idToken = tokenBody.id_token;
  const accessToken = tokenBody.access_token;
  if (!accessToken) {
    throw new Error("Keycloak token response did not include an access_token");
  }
  const idTokenExp = decodeExp(idToken);
  const accessTokenExp = decodeExp(accessToken) ?? Math.floor(Date.now() / 1000) + (tokenBody.expires_in ?? 300);

  const tokens = { idToken, accessToken };
  writeCache({ idToken, idTokenExp, accessToken, accessTokenExp });
  return tokens;
}

async function loginAsLeader() {
  try {
    return await loginViaBrowser();
  } finally {
    releaseLock();
  }
}

// Returns { idToken, accessToken }. idToken is presented to agentgateway (the
// only subject_token_type its crossAppAccess ID-JAG exchange accepts);
// accessToken is presented to dpop-verifier's /register (the more
// RFC-appropriate credential for authenticating to a resource-server-style
// endpoint).
export async function getValidTokens() {
  const cached = readCache();
  if (cached) return cached;

  if (tryAcquireLock()) {
    return loginAsLeader();
  }

  console.error("[pattern-2b-client] another connector process is already logging in, waiting for it");
  const fromLeader = await waitForLeader(Date.now() + LOGIN_WAIT_TIMEOUT_MS);
  if (fromLeader) return fromLeader;

  if (tryAcquireLock()) {
    return loginAsLeader();
  }
  const retried = await waitForLeader(Date.now() + LOGIN_WAIT_TIMEOUT_MS);
  if (retried) return retried;
  throw new Error("failed to obtain tokens: login coordination did not converge");
}
