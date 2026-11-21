import { NextRequest, NextResponse } from "next/server";
import { createRemoteJWKSet, jwtVerify } from "jose";
import {resolveMarketingOrganizationId,stagingOidcSubject,
 hasOidcScope,assertStagingDiscoveryUrl} from "@medsol/contracts";
import { authConfig, entraTenant, oidcClientSecret, FLOW_COOKIE, SESSION_COOKIE, seal, secureCookie, unseal } from "../../../../lib/marketing-auth";

type Flow = { state: string; nonce: string; verifier: string; tokenEndpoint: string; jwksUri: string; issuer: string };
export async function GET(request: NextRequest) {
  const cfg = authConfig();
  const redirect = (reason: string) => NextResponse.redirect(new URL("/?auth_error=" + encodeURIComponent(reason), cfg.origin));
  const flow = await unseal<Flow>(request.cookies.get(FLOW_COOKIE)?.value);
  const state = request.nextUrl.searchParams.get("state"), code = request.nextUrl.searchParams.get("code");
  if (!flow || !state || flow.state !== state || !code ||
      flow.issuer!==cfg.issuer || request.nextUrl.searchParams.has("error"))
    return redirect("invalid_callback");
  const response = redirect("authentication_failed");
  response.cookies.set(FLOW_COOKIE, "", secureCookie(0));
  try {
    if(cfg.identityProvider==='STAGING_OIDC'){
      assertStagingDiscoveryUrl(cfg.issuer,flow.tokenEndpoint);
      assertStagingDiscoveryUrl(cfg.issuer,flow.jwksUri);
      if(flow.jwksUri!==process.env.MARKETING_OIDC_JWKS_URL)
       throw new Error("Unpinned staging JWKS");
    }
    const clientSecret = oidcClientSecret(cfg.issuer);
    if (!clientSecret) throw new Error("Trusted confidential OIDC client credential required");
    const tokenResult = await fetch(flow.tokenEndpoint, {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", client_id: cfg.clientId, client_secret: clientSecret, code, code_verifier: flow.verifier, redirect_uri: cfg.origin + "/api/auth/callback" }),
      cache: "no-store", signal: AbortSignal.timeout(8000)
    });
    if (!tokenResult.ok) return response;
    const tokens = await tokenResult.json();
    if (typeof tokens.id_token !== "string" || typeof tokens.access_token !== "string" || typeof tokens.expires_in !== "number") return response;
    const keys = createRemoteJWKSet(new URL(flow.jwksUri));
    const { payload } = await jwtVerify(tokens.id_token, keys, { issuer: flow.issuer, audience: cfg.clientId, algorithms: ["RS256", "ES256"] });
    if(payload.nonce!==flow.nonce||typeof payload.sub!=="string"||!payload.sub)
      return response;
    if(cfg.identityProvider==='STAGING_OIDC'){
      // Both ID and API-access identities are independently RSA-signature verified.
      // Deny authorization-code mix-ups before the canonical Nest session is minted.
      const {payload:access}=await jwtVerify(tokens.access_token,keys,{
       issuer:flow.issuer,audience:process.env.MARKETING_OIDC_AUDIENCE,
       algorithms:["RS256","ES256"]});
      if(stagingOidcSubject(flow.issuer,access.sub)!==
         stagingOidcSubject(flow.issuer,payload.sub)||
         access.marketing_org_id!==payload.marketing_org_id||
         !hasOidcScope(access,"marketing"))return response;
    }else if(typeof payload.oid!=="string"||typeof payload.tid!=="string"||
      payload.tid.toLowerCase()!==entraTenant())return response;
    // The ID-token organization is signed and separately revalidated against
    // the ACCESS token's signed claim and authoritative user on the Nest API.
    const organizationId=resolveMarketingOrganizationId(payload,cfg.organizationId,cfg.tenantMode);
    // API validates access-token issuer, audience, signature, and authoritative user membership on every request.
    const ttl = Math.min(3600, Math.max(0, Math.floor(tokens.expires_in) - 30));
    if (ttl < 30) return response;
    const expiresAt = Date.now() + ttl * 1000;
    const apiBase = process.env.MARKETING_API_INTERNAL_URL ?? "http://localhost:3001";
    const registration = await fetch(new URL("/marketing/sessions", apiBase), {
      method: "POST", headers: { authorization: "Bearer " + tokens.access_token, "x-organization-id": organizationId, "content-type": "application/json" },
      body: JSON.stringify({ expiresAt }), cache: "no-store", signal: AbortSignal.timeout(8000)
    });
    if (!registration.ok) return response;
    const registered = await registration.json();
    if (typeof registered.sessionId !== "string") return response;
    const session = await seal({ accessToken: tokens.access_token, organizationId, expiresAt, sessionId: registered.sessionId }, ttl);
    const success = NextResponse.redirect(new URL("/", cfg.origin));
    success.cookies.set(FLOW_COOKIE, "", secureCookie(0));
    success.cookies.set(SESSION_COOKIE, session, secureCookie(ttl));
    return success;
  } catch { return response; }
}
