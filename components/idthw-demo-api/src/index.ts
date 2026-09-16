import { createAccessTokenVerifier } from "./auth.ts"
import { createDemoApiServer } from "./server.ts"

const port = Number(process.env.PORT ?? "8080")
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be between 1 and 65535")

const verify = createAccessTokenVerifier({
  jwksUrl: new URL(process.env.ATHENZ_JWKS_URL ?? "https://athenz-zts-server.athenz:4443/zts/v1/oauth2/keys?rfc=true"),
  expectedIssuer: process.env.ATHENZ_EXPECTED_ISSUER,
  allowInsecureHttp: process.env.ATHENZ_JWKS_ALLOW_INSECURE_HTTP === "true",
})
const server = createDemoApiServer(verify)
server.listen(port, "0.0.0.0", () => console.log(JSON.stringify({
  timestamp: new Date().toISOString(), component: "idthw-demo-api", event: "server_started", port,
})))
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.close(() => process.exit(0)))
}
