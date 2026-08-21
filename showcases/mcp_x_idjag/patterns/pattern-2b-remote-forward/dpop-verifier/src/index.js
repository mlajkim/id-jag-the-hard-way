import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import * as grpc from "@grpc/grpc-js";
import protoLoader from "@grpc/proto-loader";
import { createPinStore, createReplayCache } from "./store.js";
import { makeCheckHandler } from "./grpcCheck.js";
import { makeRegisterHandler } from "./register.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const HTTP_PORT = Number(process.env.PORT || 8090);
const GRPC_PORT = Number(process.env.GRPC_PORT || 50051);
const KEYCLOAK_ISSUER = process.env.KEYCLOAK_ISSUER || "http://localhost:34443/realms/master";
const KEYCLOAK_JWKS_URL =
  process.env.KEYCLOAK_JWKS_URL || "http://keycloak.idp:8080/realms/master/protocol/openid-connect/certs";
const KEYCLOAK_AUDIENCE = process.env.KEYCLOAK_AUDIENCE || "human.idjag-learner.pattern2b-client";
const DPOP_IAT_FRESHNESS_SECONDS = Number(process.env.DPOP_IAT_FRESHNESS_SECONDS || 100);
const DPOP_REPLAY_TTL_SECONDS = Number(process.env.DPOP_REPLAY_TTL_SECONDS || DPOP_IAT_FRESHNESS_SECONDS * 2);

const pinStore = createPinStore();
const replayCache = createReplayCache(DPOP_REPLAY_TTL_SECONDS * 1000);

const app = express();
app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.post(
  "/register",
  makeRegisterHandler({
    pinStore,
    replayCache,
    freshnessSeconds: DPOP_IAT_FRESHNESS_SECONDS,
    jwksUrl: KEYCLOAK_JWKS_URL,
    issuer: KEYCLOAK_ISSUER,
    audience: KEYCLOAK_AUDIENCE,
  }),
);
app.listen(HTTP_PORT, () => console.log(`[dpop-verifier] HTTP (/register, /health) listening on :${HTTP_PORT}`));

const packageDefinition = protoLoader.loadSync(path.join(__dirname, "..", "proto", "ext_authz.proto"), {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
  includeDirs: [path.join(__dirname, "..", "proto")],
});
const proto = grpc.loadPackageDefinition(packageDefinition);

const server = new grpc.Server();
server.addService(proto.envoy.service.auth.v3.Authorization.service, {
  check: makeCheckHandler({ pinStore, replayCache, freshnessSeconds: DPOP_IAT_FRESHNESS_SECONDS }),
});
server.bindAsync(`0.0.0.0:${GRPC_PORT}`, grpc.ServerCredentials.createInsecure(), (err, port) => {
  if (err) {
    console.error("[dpop-verifier] failed to bind gRPC server:", err);
    process.exit(1);
  }
  console.log(`[dpop-verifier] gRPC ext_authz (Check) listening on :${port}`);
});
