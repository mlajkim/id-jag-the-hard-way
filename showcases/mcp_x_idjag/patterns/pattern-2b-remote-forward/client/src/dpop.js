import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { generateKeyPair, exportJWK, importJWK, SignJWT } from "jose";

// Persisted alongside auth.js's token.json - same directory, same permission
// policy. Unlike the id_token cache, this key never expires: it's this
// connector's long-lived DPoP identity, pinned to this user's `sub` by
// dpop-verifier's /register on first use (see register.js).
const KEY_PATH =
  process.env.PATTERN_2B_DPOP_KEY_PATH || path.join(os.homedir(), ".config", "pattern-2b-connector", "dpop-key.json");

export async function ensureKeypair() {
  try {
    const { privateJwk, publicJwk } = JSON.parse(fs.readFileSync(KEY_PATH, "utf8"));
    const privateKey = await importJWK(privateJwk, "ES256");
    return { privateKey, publicJwk };
  } catch {
    // missing/corrupt file - generate and persist a fresh keypair
  }

  const { privateKey, publicKey } = await generateKeyPair("ES256", { extractable: true });
  const privateJwk = await exportJWK(privateKey);
  const publicJwk = await exportJWK(publicKey);

  fs.mkdirSync(path.dirname(KEY_PATH), { recursive: true, mode: 0o700 });
  fs.writeFileSync(KEY_PATH, JSON.stringify({ privateJwk, publicJwk }), { mode: 0o600 });

  return { privateKey, publicJwk };
}

// Unlike ensureKeypair(), never persisted - used by test-e2e.mjs's negative
// case to prove the gateway rejects proofs from a key other than the one
// registered for a sub.
export async function generateEphemeralKeypair() {
  const { privateKey, publicKey } = await generateKeyPair("ES256", { extractable: true });
  return { privateKey, publicJwk: await exportJWK(publicKey) };
}

// htu must be the exact request URL (no query/fragment) the proof will be
// presented against - dpop-verifier compares it verbatim against the actual
// request it receives.
export async function makeProof(htm, htu, { privateKey, publicJwk }) {
  const iat = Math.floor(Date.now() / 1000);
  return new SignJWT({ htm, htu, iat, jti: crypto.randomUUID() })
    .setProtectedHeader({ alg: "ES256", typ: "dpop+jwt", jwk: publicJwk })
    .sign(privateKey);
}
