import { NextRequest, NextResponse } from "next/server";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { authConfig, FLOW_COOKIE, SESSION_COOKIE, seal, secureCookie, unseal } from "../../../../lib/marketing-auth";

type Flow = { state: string; nonce: string; verifier: string; tokenEndpoint: string; jwksUri: string; issuer: string };
export async function GET(request: NextRequest) {
  const cfg = authConfig();
  const redirect = (reason: string) => NextResponse.redirect(new URL("/?auth_error=" + encodeURIComponent(reason), cfg.origin));
  const flow = await unseal<Flow>(request.cookies.get(FLOW_COOKIE)?.value);
  const state = request.nextUrl.searchParams.get("state"), code = request.nextUrl.searchParams.get("code");
  if (!flow || !state || flow.state !== state || !code || request.nextUrl.searchParams.has("error")) return redirect("invalid_callback");
  const response = redirect("authentication_failed");
  response.cookies.set(FLOW_COOKIE, "", secureCookie(0));
  try {
    const tokenResult = await fetch(flow.tokenEndpoint, {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", client_id: cfg.clientId, code, code_verifier: flow.verifier, redirect_uri: cfg.origin + "/api/auth/callback" }),
      cache: "no-store", signal: AbortSignal.timeout(8000)
    });
    if (!tokenResult.ok) return response;
    const tokens = await tokenResult.json();
    if (typeof tokens.id_token !== "string" || typeof tokens.access_token !== "string" || typeof tokens.expires_in !== "number") return response;
    const keys = createRemoteJWKSet(new URL(flow.jwksUri));
    const { payload } = await jwtVerify(tokens.id_token, keys, { issuer: flow.issuer, audience: cfg.clientId, algorithms: ["RS256", "ES256"] });
    if (payload.nonce !== flow.nonce || typeof payload.sub !== "string" || !payload.sub || payload.email_verified !== true || typeof payload.email !== "string") return response;
    // API validates access-token issuer, audience, signature, and authoritative user membership on every request.
    const ttl = Math.min(3600, Math.max(0, Math.floor(tokens.expires_in) - 30));
    if (ttl < 30) return response;
    const session = await seal({ accessToken: tokens.access_token, organizationId: cfg.organizationId, expiresAt: Date.now() + ttl * 1000 }, ttl);
    const success = NextResponse.redirect(new URL("/", cfg.origin));
    success.cookies.set(FLOW_COOKIE, "", secureCookie(0));
    success.cookies.set(SESSION_COOKIE, session, secureCookie(ttl));
    return success;
  } catch { return response; }
}
