import https from "https";
import fs from "fs";
import { URLSearchParams } from "url";
import jwt from "jsonwebtoken";
import { extractCookieValue } from "../utils/httpHelpers.js";
import { ZTS_URL, CERT_PATH, KEY_PATH, CA_PATH } from "../config/env.js";
import { getSession } from "./sessionStore.js";
import { parseAthenzError } from "./errors.js";
import type { Request } from "express";

const ID_JAG_AUD = "https://athenz-zts-server.athenz:4443/zts/v1";

const httpsAgent = new https.Agent({
  cert: fs.readFileSync(CERT_PATH),
  key: fs.readFileSync(KEY_PATH),
  ca: fs.readFileSync(CA_PATH),
});

function getJwtExpiration(token: string): number | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString("utf8"));
    return payload.exp;
  } catch {
    return null;
  }
}

async function exchangeIdTokenToIdJag(idToken: string, scope: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      requested_token_type: "urn:ietf:params:oauth:token-type:id-jag",
      subject_token_type: "urn:ietf:params:oauth:token-type:id_token",
      subject_token: idToken,
      scope: scope,
      audience: ID_JAG_AUD,
    }).toString();

    const targetUrl = ZTS_URL.replace(/\/$/, "") + "/oauth2/token";
    const url = new URL(targetUrl);
    console.error(`[Athenz ID-JAG] 🎯 Target ZTS for ID-JAG: ${targetUrl}`);

    const req = https.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: "POST",
      agent: httpsAgent,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(body),
      },
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data).access_token);
          } catch {
            reject(new Error("Failed to parse Athenz ZTS Response"));
          }
        } else {
          reject(parseAthenzError(data, res.statusCode ?? 0, "id_token_to_idjag", scope));
        }
      });
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function resolveIdToken(req: Request): string | undefined {
  const authHeader = req.headers["authorization"];
  if (authHeader?.startsWith("Bearer ")) {
    const bearerValue = authHeader.slice(7);
    const session = getSession(bearerValue);
    if (session) {
      console.error("[Athenz ID-JAG] 🔑 Resolved ID token from bearer session (Claude Code path)");
      return session.idToken;
    }
  }
  const cookieHeader = req.headers.cookie;
  return extractCookieValue(cookieHeader, "oauth_id_token");
}

export async function exchangeToIdjag(req: Request, scope: string): Promise<string> {
  const idToken = resolveIdToken(req);

  const now = Math.floor(Date.now() / 1000);
  const idTokenExp = idToken ? getJwtExpiration(idToken) : null;
  if (!idToken || !idTokenExp || idTokenExp <= now) {
    const err: any = new Error("ID token has expired. Please re-login.");
    err.code = "ID_TOKEN_EXPIRED";
    throw err;
  }

  console.error(`[Athenz ID-JAG] 🔄 Attempting to exchange new ID-JAG with id-token for scope [${scope}] ...`);
  const idJag = await exchangeIdTokenToIdJag(idToken, scope);

  const decoded = jwt.decode(idJag) as any;
  const grantedScope = decoded?.scp ?? decoded?.scope ?? "(none)";
  console.error(`[Athenz ID-JAG] 🎫 Granted scope in ID-JAG: ${JSON.stringify(grantedScope)}`);

  return idJag;
}
