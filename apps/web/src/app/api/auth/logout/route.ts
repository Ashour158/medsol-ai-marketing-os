import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, secureCookie, sameOrigin, unseal, type Session } from "../../../../lib/marketing-auth";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origin validation failed" }, { status: 403 });
  const session = await unseal<Session>(request.cookies.get(SESSION_COOKIE)?.value);
  if (session?.sessionId && session.accessToken && session.expiresAt > Date.now()) {
    try {
      const base = process.env.MARKETING_API_INTERNAL_URL ?? "http://localhost:3001";
      const result = await fetch(new URL("/marketing/sessions/revoke", base), {
        method: "POST",
        headers: { authorization: "Bearer " + session.accessToken, "x-organization-id": session.organizationId, "x-marketing-session-id": session.sessionId, "content-type": "application/json" },
        body: "{}", cache: "no-store", signal: AbortSignal.timeout(5000)
      });
      if (!result.ok && result.status !== 401) return NextResponse.json({ error: "Server session revocation failed" }, { status: 503 });
    } catch {
      return NextResponse.json({ error: "Server session revocation unavailable" }, { status: 503 });
    }
  }
  const response = NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  response.cookies.set(SESSION_COOKIE, "", secureCookie(0));
  return response;
}
