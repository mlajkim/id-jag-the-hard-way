import { makeProof } from "./dpop.js";

const DPOP_REGISTER_URL = process.env.PATTERN_2B_DPOP_REGISTER_URL || "http://dpop-verifier.pattern-2b.localhost:3002/register";

// Called unconditionally on every startup (no local "already registered"
// marker) - dpop-verifier's /register is idempotent for a key it already
// owns, so this is a no-op confirmation on steady-state runs and only does
// real work on first run or after dpop-verifier has forgotten its in-memory
// pins (e.g. a pod restart).
//
// Authenticates with the Keycloak access_token, not the id_token: an
// id_token is meant for the RP itself, not for presenting to a resource-
// server-style endpoint as a bearer credential, whereas an access_token is
// the RFC-appropriate credential for exactly this. The MCP call in
// test-e2e.mjs still uses the id_token, because agentgateway's crossAppAccess
// ID-JAG exchange only accepts subject_token_type=id_token - that's unrelated
// to this endpoint.
export async function ensureRegistered(accessToken, keys) {
  const proof = await makeProof("POST", DPOP_REGISTER_URL, keys);
  const res = await fetch(DPOP_REGISTER_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, DPoP: proof },
  });

  if (res.status === 409) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      "a different DPoP key is already pinned for this account with dpop-verifier - this connector's local " +
        "key/token cache may be from a different machine or a previous identity. key rotation isn't supported " +
        `yet. (${body.message || "key_already_registered"})`,
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`DPoP key registration failed: ${res.status} ${body}`);
  }
}
