// Implements envoy.service.auth.v3.Authorization/Check, agentgateway's
// gRPC ext_authz protocol. Runs (per agentgateway's hardcoded policy order)
// after jwtAuthentication has already validated the client's id_token and
// stripped the Authorization header - this service never sees the id_token
// itself, only the already-validated `sub` claim (via jwt_payload metadata,
// auto-injected by agentgateway when the policy's grpc.requestMetadata is left
// unset) and the client's DPoP proof (via the DPoP header, forwarded by
// default since includeRequestHeaders is unset).
import { buildHtu, verifyProof, DpopError } from "./dpop.js";

const STATUS_OK = 0;
const STATUS_PERMISSION_DENIED = 7;
const HTTP_UNAUTHORIZED = 401;

// google.protobuf.Value -> plain JS. proto-loader/grpc-js decodes the oneof
// `kind` as whichever field is actually set on the object.
function valueToJs(value) {
  if (!value) return null;
  if ("nullValue" in value && value.nullValue !== undefined) return null;
  if ("stringValue" in value && value.stringValue !== undefined) return value.stringValue;
  if ("numberValue" in value && value.numberValue !== undefined) return value.numberValue;
  if ("boolValue" in value && value.boolValue !== undefined) return value.boolValue;
  if (value.structValue) return structToJs(value.structValue);
  if (value.listValue) return (value.listValue.values || []).map(valueToJs);
  return null;
}

function structToJs(struct) {
  const out = {};
  for (const [key, value] of Object.entries(struct?.fields || {})) {
    out[key] = valueToJs(value);
  }
  return out;
}

function extractSub(checkRequest) {
  const filterMetadata = checkRequest.attributes?.metadata_context?.filter_metadata;
  const jwtAuthnStruct = filterMetadata?.["envoy.filters.http.jwt_authn"];
  if (!jwtAuthnStruct) return null;
  const decoded = structToJs(jwtAuthnStruct);
  return decoded?.jwt_payload?.sub ?? null;
}

function denied(code, message, statusCode = HTTP_UNAUTHORIZED) {
  return {
    status: { code: STATUS_PERMISSION_DENIED, message: `${code}: ${message}` },
    denied_response: {
      status: { code: statusCode },
      body: JSON.stringify({ error: code, message }),
    },
  };
}

const allowed = { status: { code: STATUS_OK } };

export function makeCheckHandler({ pinStore, replayCache, freshnessSeconds }) {
  return async function check(call, callback) {
    try {
      const http = call.request.attributes?.request?.http;
      if (!http) return callback(null, denied("bad_request", "missing http attributes"));

      const sub = extractSub(call.request);
      if (!sub) {
        return callback(null, denied("not_authenticated", "no validated jwt claims found (sub missing)"));
      }

      const dpopHeader = http.headers?.["dpop"];
      const htu = buildHtu(http.scheme || "http", http.host, http.path || "/");

      let proof;
      try {
        proof = await verifyProof(dpopHeader, { htm: http.method, htu, freshnessSeconds });
      } catch (e) {
        if (e instanceof DpopError) return callback(null, denied(e.code, e.message));
        throw e;
      }

      if (replayCache.checkAndRecord(proof.jkt, proof.jti)) {
        return callback(null, denied("replayed_jti", `jti ${proof.jti} already used for this key`));
      }

      const pin = pinStore.get(sub);
      if (!pin) {
        return callback(null, denied("not_registered", `no DPoP key registered for sub ${sub}`, 403));
      }
      if (pin.jkt !== proof.jkt) {
        return callback(null, denied("key_mismatch", `proof key does not match the key pinned for sub ${sub}`, 403));
      }

      return callback(null, allowed);
    } catch (e) {
      console.error("[dpop-verifier] Check RPC failed:", e);
      return callback(null, denied("internal_error", "unexpected verifier error", 500));
    }
  };
}
