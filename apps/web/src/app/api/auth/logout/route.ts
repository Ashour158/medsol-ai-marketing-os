import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, secureCookie, sameOrigin } from "../../../../lib/marketing-auth";
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origin validation failed" }, { status: 403 });
  const response = NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  response.cookies.set(SESSION_COOKIE, "", secureCookie(0));
  return response;
}
