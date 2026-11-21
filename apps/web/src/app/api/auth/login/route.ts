import { NextResponse } from "next/server";
import {assertStagingDiscoveryUrl} from "@medsol/contracts";
import { authConfig, entraScope, challenge, FLOW_COOKIE, randomToken, seal, secureCookie } from "../../../../lib/marketing-auth";

export async function GET() {
  try {
    const cfg = authConfig();
    const issuer = new URL(cfg.issuer);
    if (issuer.protocol !== "https:") throw new Error("OIDC issuer must use HTTPS");
    const discovery = await fetch(new URL(".well-known/openid-configuration", cfg.issuer.endsWith("/") ? cfg.issuer : cfg.issuer + "/"), { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!discovery.ok) throw new Error("OIDC discovery unavailable");
    const metadata = await discovery.json();
    if (metadata.issuer !== cfg.issuer || typeof metadata.authorization_endpoint !== "string" || typeof metadata.token_endpoint !== "string" || typeof metadata.jwks_uri !== "string") throw new Error("OIDC discovery invalid");
    for(const key of ["authorization_endpoint","token_endpoint","jwks_uri"]){
      if(new URL(metadata[key]).protocol!=="https:")throw new Error("OIDC endpoints must use HTTPS");
      if(cfg.identityProvider==='STAGING_OIDC')
       assertStagingDiscoveryUrl(cfg.issuer,metadata[key]);
    }
    if(cfg.identityProvider==='STAGING_OIDC'&&
       metadata.jwks_uri!==process.env.MARKETING_OIDC_JWKS_URL)
     throw new Error("Staging JWKS discovery must match pinned keys URL");
    const state = randomToken(), nonce = randomToken(), verifier = randomToken();
    const flow = await seal({ state, nonce, verifier, tokenEndpoint: metadata.token_endpoint, jwksUri: metadata.jwks_uri, issuer: cfg.issuer }, 300);
    const url = new URL(metadata.authorization_endpoint);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", cfg.clientId);
    url.searchParams.set("redirect_uri", cfg.origin + "/api/auth/callback");
    url.searchParams.set("scope",cfg.identityProvider==='STAGING_OIDC'?
     "openid profile marketing":"openid profile "+entraScope());
    url.searchParams.set("state", state);
    url.searchParams.set("nonce", nonce);
    url.searchParams.set("code_challenge", challenge(verifier));
    url.searchParams.set("code_challenge_method", "S256");
    const response = NextResponse.redirect(url);
    response.cookies.set(FLOW_COOKIE, flow, secureCookie(300));
    return response;
  } catch { return NextResponse.json({ error: "Identity provider configuration unavailable" }, { status: 503 }); }
}
