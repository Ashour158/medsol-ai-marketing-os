import { NextRequest, NextResponse } from "next/server";

const routes = new Set(["agents", "requests", "workflows"]);
const apiBase = process.env.MARKETING_API_INTERNAL_URL ?? "http://localhost:3001";

async function forward(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const [resource, id, action] = path;
  if (!resource || !routes.has(resource) || path.length > 3 ||
      (resource === "agents" && (path.length !== 1 || request.method !== "GET")) ||
      (resource === "requests" && (path.length !== 1 || request.method !== "POST")) ||
      (resource === "workflows" && !(
        (path.length === 1 && request.method === "POST") ||
        (path.length === 2 && request.method === "GET" && !!id) ||
        (path.length === 3 && request.method === "POST" && action === "resume" && !!id)
      ))) return NextResponse.json({ error: "Route not supported" }, { status: 404 });
  const authorization = request.headers.get("authorization");
  const organizationId = request.headers.get("x-organization-id");
  if (!authorization?.startsWith("Bearer ") || !organizationId) {
    return NextResponse.json({ error: "Bearer token and organization ID required" }, { status: 401 });
  }
  try {
    const response = await fetch(new URL("/marketing/" + path.map(encodeURIComponent).join("/"), apiBase), {
      method: request.method,
      headers: { authorization, "x-organization-id": organizationId, ...(request.method === "POST" ? { "content-type": "application/json" } : {}) },
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
