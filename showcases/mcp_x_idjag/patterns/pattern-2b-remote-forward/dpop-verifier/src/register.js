// POST /register - TOFU pinning of a client's DPoP public key to their `sub`.
// This endpoint sits on its own HTTPRoute that is NOT covered by
// agentgateway's jwtAuthentication policy (see
// k8s/agentgateway-routes/route-dpop-verifier.yaml), so it verifies the
// caller's credential itself, the same way mcp-reverse-proxy verifies Athenz
// access tokens: createRemoteJWKSet + jwtVerify against the issuer's real
// JWKS.
//
// Deliberately authenticated with Keycloak's access_token, not its id_token:
// an id_token is meant for the RP itself to consume, not to be presented to a
// resource-server-style endpoint as a bearer credential (see
// patterns/pattern-2b-remote-forward/README.md). Keycloak issues
// access_token and id_token as JWTs signed with the same realm key, so they
// verify against the same JWKS.
//
// The key being pinned is the DPoP proof's own embedded jwk - not a separate
// field in the request body - so there's no way for the body and the proven
// key to disagree.
import { createRemoteJWKSet, jwtVerify } from "jose";
import { buildHtu, verifyProof, DpopError } from "./dpop.js";

export function makeRegisterHandler({ pinStore, replayCache, freshnessSeconds, jwksUrl, issuer, audience }) {
  const JWKS = createRemoteJWKSet(new URL(jwksUrl));

  return async function register(req, res) {
    const authHeader = req.headers["authorization"];
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "missing_access_token" });
    }
    const accessToken = authHeader.slice(7);

    let sub;
    try {
      // Keycloak access tokens carry the requesting client in `azp`
      // (authorized party), not `aud` - by default `aud` is just the
      // built-in "account" client unless a custom audience mapper is added
      // to the client. Check `azp` instead of asking jose to enforce `aud`.
      const { payload } = await jwtVerify(accessToken, JWKS, { issuer });
      if (payload.azp !== audience) {
        throw new Error(`unexpected "azp" claim value: ${payload.azp}`);
      }
      sub = payload.sub;
    } catch (e) {
      console.log(`[dpop-verifier] /register rejected access_token: ${e.message}`);
      return res.status(401).json({ error: "invalid_access_token", message: e.message });
    }

    const htu = buildHtu(req.protocol, req.get("host"), req.path);
    let proof;
    try {
      proof = await verifyProof(req.headers["dpop"], { htm: req.method, htu, freshnessSeconds });
    } catch (e) {
      if (e instanceof DpopError) {
        return res.status(400).json({ error: e.code, message: e.message });
      }
      throw e;
    }

    if (replayCache.checkAndRecord(proof.jkt, proof.jti)) {
      return res.status(400).json({ error: "replayed_jti" });
    }

    const outcome = pinStore.register(sub, proof.jkt, proof.jwk);
    if (outcome === "conflict") {
      console.log(`[dpop-verifier] /register conflict for sub=${sub}: a different key is already pinned`);
      return res.status(409).json({
        error: "key_already_registered",
        message: "a different DPoP key is already pinned for this account; key rotation is not supported",
      });
    }

    console.log(`[dpop-verifier] /register ${outcome} for sub=${sub} jkt=${proof.jkt}`);
    return res.status(outcome === "created" ? 201 : 200).json({ status: outcome });
  };
}
