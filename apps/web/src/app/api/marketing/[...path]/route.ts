import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, sameOrigin, unseal, type Session } from "../../../../lib/marketing-auth";

const routes = new Set(["agents", "requests", "workflows", "approvals", "overview", "campaigns", "objectives", "products", "me", "brain", "operations", "learning", "brand", "command-center", "performance", "architecture", "tenancy", "assets", "publications", "integrations", "media", "audience", "email", "tools", "journeys", "social"]);
const apiBase = process.env.MARKETING_API_INTERNAL_URL ?? "http://localhost:3001";

async function forward(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const [resource, id, action, operation] = path;
  // URL normalization can turn untrusted "..", separators or encoded
  // slashes into another endpoint after allowlisting. Reject them first.
  if (!Array.isArray(path) || path.some(segment =>
       typeof segment !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(segment)))
    return NextResponse.json({ error: "Invalid route segment" }, { status: 404 });
  if (request.nextUrl.search.length > 2048)
    return NextResponse.json({ error: "Query too long" }, { status: 414 });
  if (!resource || !routes.has(resource) || (path.length > 5 && !(resource==="tenancy" && request.method==="GET" &&
       [6,7].includes(path.length))) ||
      (resource === "me" && (path.length !== 1 || request.method !== "GET")) ||
      (resource === "journeys" && !((path.length === 2 || (path.length === 3 && action === "dossier")) &&
        !!id && /^[A-Za-z0-9_-]{1,128}$/.test(id) && request.method === "GET")) ||
      (resource === "architecture" && !(
        (path.length===2&&id==="readiness"&&request.method==="GET")||
        (path.length===4&&id==="runs"&&!!action&&operation==="recovery"&&request.method==="GET")||
        (path.length===2&&id==="blueprint"&&request.method==="GET")||
        (path.length===3&&id==="blueprint"&&action==="simulate"&&request.method==="POST")||
        (path.length===2&&id==="deployments"&&["GET","POST"].includes(request.method))||
        (path.length===4&&id==="deployments"&&!!action&&
         ["approve","activate","revoke"].includes(operation??"")&&request.method==="POST")||
        (path.length===2&&id==="runs"&&request.method==="POST")||
        (path.length===4&&id==="runs"&&!!action&&operation==="tick"&&request.method==="POST")
      )) ||
      (resource === "audience" && !(
        (path.length===2&&id==="loyalty"&&request.method==="POST")||
        (path.length===3&&id==="loyalty"&&!!action&&request.method==="GET")||
        (path.length===2&&id==="message-rehearsals"&&["GET","POST"].includes(request.method))||
        (path.length===2&&id==="synthetic-contacts"&&
          (request.method==="GET"||request.method==="POST")) ||
        (path.length===4&&id==="synthetic-contacts"&&!!action&&
          operation==="consent"&&request.method==="POST")
      )) ||
      (resource === "social" && !(
        (path.length===3&&id==="discussions"&&action==="triage-preview"&&request.method==="POST")||
        (path.length===2&&id==="cases"&&["GET","POST"].includes(request.method))||
        (path.length===4&&id==="cases"&&!!action&&operation==="transition"&&request.method==="POST")
      )) ||
      (resource === "email" && !(
        path.length===2&&id==="simulations"&&
        (request.method==="GET"||request.method==="POST")
      )) ||
      (resource === "tools" && !(
        (path.length===2&&id==="registrations"&&
          (request.method==="GET"||request.method==="POST")) ||
        (path.length===4&&id==="registrations"&&!!action&&
          ["approve","revoke","inspect"].includes(operation??"")&&
          request.method==="POST")
      )) ||
      (resource === "integrations" && !(
        (path.length===3&&id==="trials"&&(
          (action==="catalog"&&request.method==="GET")||
          (action==="run"&&request.method==="POST"))) ||
        (path.length===1&&(request.method==="GET"||request.method==="POST")) ||
        (path.length===2&&request.method==="GET"&&!!id) ||
        (path.length===3&&request.method==="GET"&&!!id&&action==="health") ||
        (path.length===3&&request.method==="POST"&&!!id&&
          (action==="suspend"||action==="revoke"))
      )) ||
      (resource === "media" && !(
        (path.length===2&&id==="evidence"&&request.method==="GET") ||
        (path.length===3&&id==="evidence"&&!!action&&request.method==="GET") ||
        (path.length===4&&id==="evidence"&&!!action&&
          ["revoke","verify-offline"].includes(operation??"")&&
          request.method==="POST")
      )) ||
      (resource === "publications" && !(
       (path.length===1&&(request.method==="GET"||request.method==="POST")) ||
       (path.length===2&&!!id&&request.method==="GET") ||
       (path.length===3&&!!id&&request.method==="GET"&&
          (action==="preflight"||action==="performance"||action==="reconciliation"||action==="release-readiness"||action==="dispatch-reservation")) ||
       (path.length===3&&!!id&&request.method==="POST"&&
          (action==="simulate"||action==="cancel"||action==="dispatch-hold"||action==="dispatch-reservation")) ||
       (path.length===4&&!!id&&request.method==="POST"&&
          action==="dispatch-reservation"&&operation==="expire")
      )) ||
      (resource === "assets" && !(
        (request.method==="GET" && (path.length===1 ||
          (path.length===2 && !!id) ||
          (path.length===3 && id==="approvals" && !!action) ||
          (path.length===4 && id==="revisions" && !!action &&
            ["offline-preview","layered-preview"].includes(operation??"")))) ||
        (request.method==="POST" && (
          path.length===1 ||
          (path.length===2 && id==="offline-raster") ||
          (path.length===3 && !!id && id!=="revisions" &&
            (action==="revisions"||action==="offline-revisions"||action==="offline-layered-revisions")) ||
          (path.length===4 && id==="revisions" && !!action &&
             (operation==="rights-review" || operation==="submit-approval"))
        ))
      )) ||
      (resource === "tenancy" && !(
       (path.length===2 && (id==="brands"||id==="agency-grants"||id==="roles"||id==="activation-reviews") &&
        (request.method==="GET"||request.method==="POST")) ||
       (path.length===3 && id==="roles" && action==="assign" && request.method==="POST") ||
       (path.length===4 && id==="roles" && !!action && operation==="disable" &&
        request.method==="POST") ||
       (path.length===4 && id==="agency-grants" && !!action &&
        operation==="revoke" && request.method==="POST") ||
       (request.method==="GET"&&[6,7].includes(path.length)&&
        id==="clients"&&/^[A-Za-z0-9_-]+$/.test(action??"")&&
        operation==="brands"&&/^[A-Za-z0-9_-]+$/.test(path[4]??"")&&
        path[5]==="campaigns"&&
        (path.length===6||/^[A-Za-z0-9_-]+$/.test(path[6]??"")))
      )) ||
      (resource === "performance" && !(
        (path.length===2&&id==="forms"&&["GET","POST"].includes(request.method))||
        (path.length===2&&id==="experiments"&&request.method==="POST")||
        (path.length===3&&id==="experiments"&&!!action&&request.method==="GET")||
        (path.length===4&&id==="submissions"&&!!action&&operation==="qualification"&&request.method==="POST")||
        (path.length===4&&id==="forms"&&!!action&&operation==="submit"&&request.method==="POST")||(path.length===2&&request.method==="GET"&&id==="observations")||
        (path.length===3&&request.method==="GET"&&id==="campaigns"&&!!action)||
        (path.length===2&&request.method==="POST"&&(id==="ingest"||id==="review")))) ||
      (resource === "command-center" && !(
        (request.method === "GET" && (path.length === 1 || (path.length === 3 && id === "incidents" && ["BRAIN_NEEDS_INTERVENTION","BRAIN_STALE","OUTBOX_DEAD_LETTER"].includes(action??"")))) ||
        (request.method === "POST" && path.length === 5 && id === "incidents" && ["BRAIN_NEEDS_INTERVENTION","BRAIN_STALE","OUTBOX_DEAD_LETTER"].includes(action??"") && !!operation && path[4] === "acknowledge")
      )) ||
      (resource === "overview" && (path.length !== 1 || request.method !== "GET")) ||
      (resource === "objectives" && (path.length !== 1 || !["GET", "POST"].includes(request.method))) ||
      (resource === "products" && !((path.length===1&&request.method==="GET")||(path.length===2&&id==="synthetic-price-proposals"&&["GET","POST"].includes(request.method)))) ||
      (resource === "campaigns" && !(
        (path.length===5&&!!id&&action==="channel-plans"&&!!operation&&path[4]==="rehearse"&&request.method==="POST")||
        (path.length===3&&!!id&&action==="channel-plans"&&["GET","POST"].includes(request.method))||
        (request.method === "GET" && (path.length === 1 || (path.length === 2 && !!id))) ||
        (request.method === "POST" && (path.length === 1 ||
          (path.length === 2 && id === "transition")))
      )) ||
      (resource === "brand" && !(path.length===2 && ((request.method==="GET"&&(id==="active"||id==="revisions"))||(request.method==="POST"&&(id==="propose"||id==="decide"))))) ||
      (resource === "learning" && !(
        (path.length===2&&id==="watches"&&["GET","POST"].includes(request.method))||
        (path.length===4&&id==="watches"&&!!action&&operation==="transition"&&request.method==="POST")||
        (path.length===2&&id==="graph"&&request.method==="POST")||
        (path.length===3&&id==="graph"&&!!action&&request.method==="GET")||
        (path.length===4&&id==="graph"&&!!action&&
         ["review","revoke"].includes(operation??"")&&request.method==="POST")||
        (path.length===2&&id==="memories"&&["GET","POST"].includes(request.method))||
        (path.length===4&&id==="memories"&&!!action&&
         ["review","revoke"].includes(operation??"")&&request.method==="POST")||
        (path.length===3&&id==="knowledge"&&action==="feedback"&&["GET","POST"].includes(request.method))||
        (path.length===3&&id==="knowledge"&&action==="evaluate"&&request.method==="POST")||
        (path.length===2&&id==="knowledge"&&["GET","POST"].includes(request.method))||
        (path.length===3&&id==="knowledge"&&
         ["search","agent-context-preview"].includes(action??"")&&request.method==="POST")||
        (path.length===4&&id==="knowledge"&&!!action&&
         ["review","revoke","promote"].includes(operation??"")&&request.method==="POST")||
        (path.length === 3 && id === "skills" && (action === "evaluate" || action === "decide") && request.method === "POST") ||
        (path.length === 2 && (
         (request.method === "GET" && (id === "signals" || id === "proposals" || id === "trends")) ||
         (request.method === "POST" && (id === "signals" || id === "verify" || id === "proposals" || id === "discover"))
        ))
      )) ||
      (resource === "brain" && !(
        (path.length === 2 && ((id === "plan" && request.method === "GET") || (id === "assess" && request.method === "POST") || (id === "runs" && (request.method === "GET" || request.method === "POST")))) ||
        (path.length === 3 && id === "runs" && request.method === "GET") ||
        (path.length === 4 && id === "runs" && !!action && ((operation === "recovery" && request.method === "GET") || ((operation === "execute" || operation === "quarantine" || operation === "cancel") && request.method === "POST")))
      )) ||
      (resource === "operations" && !(path.length === 2 && (id === "delivery" || id === "workers") && request.method === "GET")) ||
      (resource === "agents" && !(
        (request.method === "GET" && (
          path.length === 1 ||
          (path.length === 2 && ["executions","operations","budget","manifests"].includes(id??"")) ||
          (path.length === 3 && id === "executions" && !!action) ||
          (path.length === 4 && id === "manifests" && action === "baseline" && !!operation)
        )) ||
        (request.method === "POST" && (
          (path.length === 2 && id === "manifests") ||
          (path.length === 3 && id === "manifests" && action === "preview") ||
          (path.length === 4 && id === "manifests" && !!action &&
           ["approve","activate","revoke","rollback"].includes(operation??""))
        ))
      )) ||
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
  // The offline raster owner accepts at most 1 MiB raw PNG (~1.4 MiB
  // encoded). Bound the *actual* incoming body, not the spoofable header.
  // Larger requests must never reach upstream or consume the API quota.
  const postBody = request.method === "POST" ? await request.text() : undefined;
  if (postBody !== undefined && new TextEncoder().encode(postBody).byteLength > 1_500_000)
    return NextResponse.json({ error: "Marketing request too large" }, { status: 413 });
  try {
    const response = await fetch(new URL("/marketing/" + path.map(encodeURIComponent).join("/") + (request.nextUrl.searchParams.toString()?"?"+request.nextUrl.searchParams.toString():""), apiBase), {
      method: request.method,
      headers: { authorization, "x-organization-id": organizationId, "x-marketing-session-id": session.sessionId, ...(request.method === "POST" ? { "content-type": "application/json" } : {}) },
      ...(postBody !== undefined ? { body: postBody } : {}),
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
