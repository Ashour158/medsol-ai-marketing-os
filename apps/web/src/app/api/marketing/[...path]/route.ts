import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, sameOrigin, unseal, type Session } from "../../../../lib/marketing-auth";

const routes = new Set(["agents", "requests", "workflows", "approvals", "overview", "campaigns", "objectives", "products", "me", "brain", "operations", "learning"]);
const apiBase = process.env.MARKETING_API_INTERNAL_URL ?? "http://localhost:3001";

async function forward(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const [resource, id, action] = path;
  if (!resource || !routes.has(resource) || path.length > 3 ||
      (resource === "me" && (path.length !== 1 || request.method !== "GET")) ||
      (resource === "overview" && (path.length !== 1 || request.method !== "GET")) ||
      (resource === "objectives" && (path.length !== 1 || !["GET", "POST"].includes(request.method))) ||
      (resource === "products" && (path.length !== 1 || request.method !== "GET")) ||
      (resource === "campaigns" && !(request.method === "GET" && (path.length === 1 || (path.length === 2 && !!id)))) ||
      (resource === "learning" && !(path.length === 2 && (
        (request.method === "GET" && (id === "signals" || id === "proposals")) ||
        (request.method === "POST" && (id === "signals" || id === "verify" || id === "proposals"))
      ))) ||
      (resource === "brain" && !(path.length === 2 && ((id === "plan" && request.method === "GET") || (id === "assess" && request.method === "POST")))) ||
      (resource === "operations" && !(path.length === 2 && id === "delivery" && request.method === "GET")) ||
      (resource === "agents" && !(request.method === "GET" && (
        path.length === 1 ||
        (path.length === 2 && (id === "executions" || id === "operations" || id === "budget")) ||
        (path.length === 3 && id === "executions" && !!action)
      ))) ||
      (resource === "approvals" && !((path.length === 2 && id === "pending" && request.method === "GET") || (path.length === 2 && id === "decide" && request.method === "POST"))) ||
      (resource === "requests" && (path.length !== 1 || request.method !== "POST")) ||
      (resource === "workflows" && !(
        (path.length === 1 && (request.method === "POST" || request.method === "GET")) ||
        (path.length === 2 && request.method === "GET" && !!id) ||
        (path.length === 3 && request.method === "POST" && action === "resume" && !!id)
      ))) return NextResponse.json({ error: "Route not supported" }, { status: 404 });
  const session = await unseal<Session>(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session || !session.accessToken || !session.organizationId || !session.sessionId || session.expiresAt <= Date.now()) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  if (request.method !== "GET" && !sameOrigin(request)) return NextResponse.json({ error: "Origin validation failed" }, { status: 403 });
  const authorization = "Bearer " + session.accessToken;
  const organizationId = session.organizationId;
  try {
    const response = await fetch(new URL("/marketing/" + path.map(encodeURIComponent).join("/"), apiBase), {
      method: request.method,
      headers: { authorization, "x-organization-id": organizationId, "x-marketing-session-id": session.sessionId, ...(request.method === "POST" ? { "content-type": "application/json" } : {}) },
      ...(request.method === "POST" ? { body: await request.text() } : {}),
      cache: "no-store",
      signal: AbortSignal.timeout(15000)
    });
    const body = await response.text();
    return new NextResponse(body, { status: response.status, headers: { "content-type": response.headers.get("content-type") ?? "application/json", "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Marketing API unavailable" }, { status: 502 });
  }
}
export const GET = forward;
export const POST = forward;
