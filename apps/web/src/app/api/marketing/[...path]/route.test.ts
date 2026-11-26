import {afterAll,afterEach,beforeAll,describe,expect,it,vi} from "vitest";
import {readFileSync} from "node:fs";
import {randomBytes} from "node:crypto";
import {fileURLToPath} from "node:url";
import {NextRequest} from "next/server";
import {GET,POST} from "./route";
import {SESSION_COOKIE,seal} from "../../../../lib/marketing-auth";

/** Test the actual Next BFF handler, encrypted cookie and internal fetch
 * boundary. No browser/remote platform/real marketing API is contacted.
 * Controller inventory is read from the one existing source of API routes.
 */
const controllerFile=fileURLToPath(new URL(
  "../../../../../../api/src/main.ts",import.meta.url));
const endpoints=[...readFileSync(controllerFile,"utf8")
 .matchAll(/@(Get|Post)\('([^']+)'\)/g)]
 .filter(x=>!["health","readyz"].includes(x[2]??"")&&!x[2]?.startsWith("marketing/sessions"))
 .map(x=>({method:x[1]==="Get"?"GET":"POST",
  template:"/"+x[2]!,path:"/"+x[2]!.replace(/:([A-Za-z]+)/g,(_,key:string)=>
   key==="kind"?"BRAIN_STALE":"id-acceptance")}));
const initial={...process.env};
const origin="https://marketing.medsol.example";
const sessionId="11111111-1111-4111-8111-111111111111";
let cookie="";
const response=()=>new Response(JSON.stringify({ok:true}),{
 status:200,headers:{"content-type":"application/json"}});
function request(path:string,method:"GET"|"POST"="GET",options?:{
  cookie?:string;origin?:string;body?:string;query?:string;
  headers?:Record<string,string>
}):NextRequest{
 const headers:Record<string,string>={
  ...(options?.cookie===null?{}:{cookie:options?.cookie??cookie}),
  ...(method==="POST"?{
   origin:options?.origin??origin,
   "content-type":"application/json"
  }:{}),
  ...options?.headers
 };
 return new NextRequest(origin+"/api"+path+(options?.query??""),{
  method,headers,...(method==="POST"?{body:options?.body??'{"offline":true}'}:{})
 });
}
const ctx=(path:string[])=>({params:Promise.resolve({path})});
async function call(path:string,method:"GET"|"POST"="GET",options?:Parameters<typeof request>[2]){
 const segments=path.split("/").filter(Boolean).slice(1);
 return (method==="GET"?GET:POST)(request(path,method,options),ctx(segments));
}
function mockUpstream(){
 const transport=vi.fn().mockImplementation(async()=>response());
 vi.stubGlobal("fetch",transport);
 return transport;
}
beforeAll(async()=>{
 process.env.MARKETING_SESSION_SECRET=randomBytes(32).toString("base64url");
 process.env.MARKETING_PUBLIC_ORIGIN=origin;
 process.env.MARKETING_ENTRA_TENANT_ID="11111111-1111-4111-8111-111111111111";
 process.env.MARKETING_OIDC_ISSUER="https://login.microsoftonline.com/11111111-1111-4111-8111-111111111111/v2.0";
 process.env.MARKETING_OIDC_CLIENT_ID="medsol-offline-web";
 process.env.MARKETING_BOOTSTRAP_ORGANIZATION_ID="tenant-a";
 cookie=SESSION_COOKIE+"="+await seal({accessToken:"offline-oidc-no-provider",
  organizationId:"tenant-a",sessionId,
  expiresAt:Date.now()+3600000},3600);
});
afterEach(()=>vi.unstubAllGlobals());
afterAll(()=>{process.env={...initial};});
describe("R3-U authenticated web boundary contract across actual API inventory",()=>{
 it("T16-001 forwards every approved API campaign/agent/creative/consent route through one authenticated BFF",async()=>{
  // The single added T5B audited context-preview route extends the original
  // 145-route authenticated inventory. All routes must stay BFF-allowlisted.
  expect(endpoints).toHaveLength(172);
  for(const method of ["GET","POST"])expect(endpoints).toContainEqual({method,template:"/marketing/tenancy/activation-reviews",path:"/marketing/tenancy/activation-reviews"});
  for(const method of ["GET","POST"])expect(endpoints).toContainEqual({method,template:"/marketing/audience/message-rehearsals",path:"/marketing/audience/message-rehearsals"});
  expect(endpoints).toContainEqual({method:"POST",template:"/marketing/campaigns/:id/channel-plans/:approvalId/rehearse",path:"/marketing/campaigns/id-acceptance/channel-plans/id-acceptance/rehearse"});
  for(const method of ["GET","POST"])expect(endpoints).toContainEqual({method,template:"/marketing/campaigns/:id/channel-plans",path:"/marketing/campaigns/id-acceptance/channel-plans"});
  for(const method of ["GET","POST"])expect(endpoints).toContainEqual({method,template:"/marketing/products/synthetic-price-proposals",path:"/marketing/products/synthetic-price-proposals"});
  expect(endpoints).toContainEqual({method:"POST",template:"/marketing/performance/experiments",path:"/marketing/performance/experiments"});
  expect(endpoints).toContainEqual({method:"GET",template:"/marketing/performance/experiments/:id",path:"/marketing/performance/experiments/id-acceptance"});
  expect(endpoints).toContainEqual({method:"POST",
   template:"/marketing/performance/submissions/:id/qualification",
   path:"/marketing/performance/submissions/id-acceptance/qualification"});
  expect(endpoints).toContainEqual({method:"GET",
   template:"/marketing/journeys/:id/dossier",
   path:"/marketing/journeys/id-acceptance/dossier"});
  expect(endpoints).toContainEqual({method:"POST",
   template:"/marketing/learning/knowledge/agent-context-preview",
   path:"/marketing/learning/knowledge/agent-context-preview"});
  expect(endpoints).toContainEqual({method:"POST",
   template:"/marketing/social/discussions/triage-preview",
   path:"/marketing/social/discussions/triage-preview"});
  expect(endpoints).toContainEqual({method:"POST",
   template:"/marketing/assets/:id/offline-revisions",
   path:"/marketing/assets/id-acceptance/offline-revisions"});
  const transport=mockUpstream();
  for(const {path,method,template} of endpoints){
   const res=await call(path,method as "GET"|"POST");
   expect(res.status,method+" "+template+" unexpectedly blocked by BFF").toBe(200);
   const args=transport.mock.lastCall!;
   expect(String(args[0])).toBe("http://localhost:3001"+path);
   expect(args[1]).toMatchObject({method,cache:"no-store"});
   expect(args[1].headers).toMatchObject({
    authorization:"Bearer offline-oidc-no-provider",
    "x-organization-id":"tenant-a",
    "x-marketing-session-id":sessionId
   });
  }
  expect(transport).toHaveBeenCalledTimes(endpoints.length);
 },45000);
 it("T16-002 fails closed without an authenticated cookie or with a stale signed session",async()=>{
  const transport=mockUpstream();
  expect((await call("/marketing/overview","GET",{cookie:""})).status).toBe(401);
  const expired=await seal({accessToken:"offline-only",organizationId:"tenant-a",
   sessionId,expiresAt:Date.now()-1000},3600);
  expect((await call("/marketing/overview","GET",{
   cookie:SESSION_COOKIE+"="+expired
  })).status).toBe(401);
  expect(transport).not.toHaveBeenCalled();
 });
 it("T16-003 rejects same-site cookie CSRF from an untrusted origin without hitting the API",async()=>{
  const transport=mockUpstream();
  expect((await call("/marketing/approvals/decide","POST",{
   origin:"https://attacker.example"
  })).status).toBe(403);
  expect(transport).not.toHaveBeenCalled();
 });
 it("T16-004 ignores forged tenant/session headers and forwards only authenticated cookie authority",async()=>{
  const transport=mockUpstream();
  const res=await call("/marketing/campaigns/transition","POST",{
   headers:{"x-organization-id":"foreign-client",
    "x-marketing-session-id":"forged",
    authorization:"Bearer attacker"}
  });
  expect(res.status).toBe(200);
  expect(transport.mock.calls[0]![1].headers).toMatchObject({
   authorization:"Bearer offline-oidc-no-provider",
   "x-organization-id":"tenant-a","x-marketing-session-id":sessionId
  });
 });
 it("T16-005 rejects dot segments, slashes, injected punctuation and overlong identifiers",async()=>{
  const transport=mockUpstream();
  for(const segment of ["..","a/b","bad%2Fpath","<script>","a".repeat(129),""]){
   const req=request("/marketing/campaigns","GET");
   const res=await GET(req,{params:Promise.resolve({path:["campaigns",segment]})});
   expect(res.status,segment).toBe(404);
  }
  expect(transport).not.toHaveBeenCalled();
 });
 it("T16-006 limits actual request bytes and query length before forwarding",async()=>{
  const transport=mockUpstream();
  const large='{"data":"'+ "A".repeat(1_500_001)+'"}';
  expect((await call("/marketing/assets/offline-raster","POST",{body:large})).status).toBe(413);
  expect((await call("/marketing/overview","GET",{query:"?q="+"x".repeat(2100)})).status).toBe(414);
  expect(transport).not.toHaveBeenCalled();
 });
 it("T16-007 blocks real social/email send and arbitrary reverse-proxy paths",async()=>{
  const transport=mockUpstream();
  for(const [method,path] of [["POST","/marketing/email/send"],
   ["POST","/marketing/publications/id-1/publish"],
   ["POST","/marketing/social/discussions/reply"],
   ["GET","/marketing/audience/export"],
   ["POST","/marketing/products/synthetic-price-proposals/apply"],
   ["POST","/marketing/campaigns/id-1/channel-plans/dispatch"],
   ["POST","/marketing/audience/message-rehearsals/send"],
   ["POST","/marketing/tenancy/activation-reviews/activate"],
   ["POST","/marketing/products"],
   ["POST","/marketing/tools/registrations/id-1/dispatch"]] as const){
   expect((await call(path,method)).status).toBe(404);
  }
  expect(transport).not.toHaveBeenCalled();
 });
 it("T16-008 upstream responses preserve no-store and do not leak cookie credentials",async()=>{
  const transport=mockUpstream();
  const res=await call("/marketing/journeys/id-1");
  expect(res.status).toBe(200);
  expect(res.headers.get("cache-control")).toBe("no-store");
  const opts=transport.mock.calls[0]![1];
  expect(opts.headers.authorization).toMatch(/^Bearer offline-oidc/);
  expect(opts.headers.cookie).toBeUndefined();
  expect(opts.credentials).toBeUndefined();
 });
});
