import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, sameOrigin, unseal, type Session } from "../../../../lib/marketing-auth";

const routes = new Set(["agents", "requests", "workflows", "approvals", "overview", "campaigns", "objectives", "products", "me", "brain", "operations", "learning", "brand", "command-center", "performance", "architecture", "tenancy", "assets", "publications", "integrations", "media"]);
const apiBase = process.env.MARKETING_API_INTERNAL_URL ?? "http://localhost:3001";

async function forward(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const [resource, id, action, operation] = path;
  if (!resource || !routes.has(resource) || path.length > 5 ||
      (resource === "me" && (path.length !== 1 || request.method !== "GET")) ||
      (resource === "architecture" && !(path.length === 2 && id === "blueprint" && request.method === "GET")) ||
      (resource === "publications" && !(
       (path.length===1&&(request.method==="GET"||request.method==="POST")) ||
       (path.length===2&&!!id&&request.method==="GET") ||
       (path.length===3&&!!id&&request.method==="GET"&&
          (action==="preflight"||action==="performance")) ||
       (path.length===3&&!!id&&request.method==="POST"&&
          (action==="simulate"||action==="cancel"))
      )) ||
      (resource === "assets" && !(
        (request.method==="GET" && (path.length===1 ||
          (path.length===2 && !!id) ||
          (path.length===3 && id==="approvals" && !!action))) ||
        (request.method==="POST" && (
          path.length===1 ||
          (path.length===3 && !!id && id!=="revisions" && action==="revisions") ||
          (path.length===4 && id==="revisions" && !!action &&
             (operation==="rights-review" || operation==="submit-approval"))
        ))
      )) ||
      (resource === "tenancy" && !(
       (path.length===2 && (id==="brands"||id==="agency-grants"||id==="roles") &&
        (request.method==="GET"||request.method==="POST")) ||
       (path.length===3 && id==="roles" && action==="assign" && request.method==="POST") ||
       (path.length===4 && id==="roles" && !!action && operation==="disable" &&
        request.method==="POST") ||
       (path.length===4 && id==="agency-grants" && !!action &&
        operation==="revoke" && request.method==="POST")
      )) ||
      (resource === "performance" && !((path.length===2&&request.method==="GET"&&id==="observations")||
        (path.length===3&&request.method==="GET"&&id==="campaigns"&&!!action)||
        (path.length===2&&request.method==="POST"&&(id==="ingest"||id==="review")))) ||
      (resource === "command-center" && !(
        (request.method === "GET" && (path.length === 1 || (path.length === 3 && id === "incidents" && ["BRAIN_NEEDS_INTERVENTION","BRAIN_STALE","OUTBOX_DEAD_LETTER"].includes(action??"")))) ||
        (request.method === "POST" && path.length === 5 && id === "incidents" && ["BRAIN_NEEDS_INTERVENTION","BRAIN_STALE","OUTBOX_DEAD_LETTER"].includes(action??"") && !!operation && path[4] === "acknowledge")
      )) ||
      (resource === "overview" && (path.length !== 1 || request.method !== "GET")) ||
      (resource === "objectives" && (path.length !== 1 || !["GET", "POST"].includes(request.method))) ||
      (resource === "products" && (path.length !== 1 || request.method !== "GET")) ||
      (resource === "campaigns" && !(request.method === "GET" && (path.length === 1 || (path.length === 2 && !!id)))) ||
      (resource === "brand" && !(path.length===2 && ((request.method==="GET"&&(id==="active"||id==="revisions"))||(request.method==="POST"&&(id==="propose"||id==="decide"))))) ||
      (resource === "learning" && !((path.length === 3 && id === "skills" && (action === "evaluate" || action === "decide") && request.method === "POST") || (path.length === 2 && (
        (request.method === "GET" && (id === "signals" || id === "proposals" || id === "trends")) ||
        (request.method === "POST" && (id === "signals" || id === "verify" || id === "proposals" || id === "discover"))
      )))) ||
      (resource === "brain" && !(
        (path.length === 2 && ((id === "plan" && request.method === "GET") || (id === "assess" && request.method === "POST") || (id === "runs" && (request.method === "GET" || request.method === "POST")))) ||
        (path.length === 3 && id === "runs" && request.method === "GET") ||
        (path.length === 4 && id === "runs" && !!action && ((operation === "recovery" && request.method === "GET") || ((operation === "execute" || operation === "quarantine") && request.method === "POST")))
      )) ||
      (resource === "operations" && !(path.length === 2 && (id === "delivery" || id === "workers") && request.method === "GET")) ||
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
    const response = await fetch(new URL("/marketing/" + path.map(encodeURIComponent).join("/") + (request.nextUrl.searchParams.toString()?"?"+request.nextUrl.searchParams.toString():""), apiBase), {
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
