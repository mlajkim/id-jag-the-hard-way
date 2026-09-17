import { createAccessTokenVerifier, type AccessTokenVerifier } from "./auth.ts"

export function createConfiguredAccessTokenVerifier(env: NodeJS.ProcessEnv): AccessTokenVerifier | undefined {
  const mode = env.ACCESS_TOKEN_ENABLED ?? "false"
  if (mode !== "true" && mode !== "false") {
    throw new Error("ACCESS_TOKEN_ENABLED must be true or false")
  }
  if (mode === "false") return undefined

  return createAccessTokenVerifier({
    jwksUrl: new URL(env.ATHENZ_JWKS_URL ?? "https://athenz-zts-server.athenz:4443/zts/v1/oauth2/keys?rfc=true"),
    expectedIssuer: env.ATHENZ_EXPECTED_ISSUER,
    allowInsecureHttp: env.ATHENZ_JWKS_ALLOW_INSECURE_HTTP === "true",
  })
}
