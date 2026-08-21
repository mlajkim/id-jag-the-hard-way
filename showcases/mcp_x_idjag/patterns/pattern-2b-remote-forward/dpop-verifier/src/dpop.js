// Shared DPoP (RFC 9449) proof verification logic, used by both the ext_authz
// Check RPC (grpcCheck.js) and the /register endpoint (register.js).
import { decodeProtectedHeader, importJWK, jwtVerify, calculateJwkThumbprint } from "jose";

export class DpopError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
}

// path_and_query is the raw ":path" style value (may include "?..."); htu never
// includes the query string or fragment per RFC 9449.
export function buildHtu(scheme, host, pathAndQuery) {
  const path = pathAndQuery.split("?")[0].split("#")[0];
  return `${scheme}://${host}${path}`;
}

// Verifies a DPoP proof JWT's own signature (against its self-embedded jwk),
// structure, and binding to the given request - NOT replay/pinning, which the
// caller must do afterward using the returned jkt/jti (replay needs shared
// state across requests, pinning needs the caller's own sub lookup).
export async function verifyProof(proofJwt, { htm, htu, freshnessSeconds }) {
  if (!proofJwt) throw new DpopError("no_dpop_proof", "missing DPoP header");

  let header;
  try {
    header = decodeProtectedHeader(proofJwt);
  } catch {
    throw new DpopError("invalid_proof", "could not decode DPoP proof header");
  }
  if (header.typ !== "dpop+jwt") {
    throw new DpopError("invalid_proof", `unexpected typ ${header.typ}`);
  }
  if (!header.jwk) {
    throw new DpopError("invalid_proof", "DPoP proof header is missing an embedded jwk");
  }

  let key;
  try {
    key = await importJWK(header.jwk, header.alg);
  } catch {
    throw new DpopError("invalid_proof", "could not import DPoP proof's embedded jwk");
  }

  let payload;
  try {
    ({ payload } = await jwtVerify(proofJwt, key, { typ: "dpop+jwt" }));
  } catch {
    throw new DpopError("invalid_proof", "DPoP proof signature verification failed");
  }

  const { htm: proofHtm, htu: proofHtu, iat, jti } = payload;
  if (typeof proofHtm !== "string" || typeof proofHtu !== "string" || typeof iat !== "number" || typeof jti !== "string") {
    throw new DpopError("invalid_proof", "DPoP proof is missing required claims (htm/htu/iat/jti)");
  }
  if (proofHtm !== htm || proofHtu !== htu) {
    throw new DpopError("htm_htu_mismatch", `proof bound to ${proofHtm} ${proofHtu}, request was ${htm} ${htu}`);
  }
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - iat) > freshnessSeconds) {
    throw new DpopError("stale_proof", `iat ${iat} outside freshness window (${freshnessSeconds}s)`);
  }

  const jkt = await calculateJwkThumbprint(header.jwk, "sha256");
  return { jwk: header.jwk, jkt, jti, iat };
}
