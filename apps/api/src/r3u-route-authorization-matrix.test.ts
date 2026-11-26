import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {permissionForMarketingRoute,hasMarketingPermission} from "./marketing-permissions.js";
import type {VerifiedIdentity} from "./oidc-identity.js";
const source=readFileSync(resolve(process.cwd(),"src/main.ts"),"utf8");
const endpoints=[...source.matchAll(/@(Get|Post)\('([^']+)'\)/g)]
 .map(m=>({method:m[1]==="Get"?"GET":"POST",pattern:"/"+m[2]!,
  route:"/"+m[2]!.replace(/:([A-Za-z]+)/g,(_,key:string)=>
   key==="kind"?"BRAIN_STALE":"id-acceptance")}));
const actor=(role:string):VerifiedIdentity=>({
 userId:"offline-user",organizationId:"tenant-a",
 email:"offline@example.invalid",subject:"oidc-offline",role
});
describe("R3-U exhaustive controller permission and danger-route matrix",()=>{
 it("T03-025 covers all 165 real API method/path decorators in the single permission registry",()=>{
  expect(endpoints).toHaveLength(165);
  expect(permissionForMarketingRoute('POST','/marketing/performance/submissions/id-acceptance/qualification')).toBe('SUBMIT_EVIDENCE');
  expect(endpoints).toContainEqual({method:"POST",
   pattern:"/marketing/social/discussions/triage-preview",
   route:"/marketing/social/discussions/triage-preview"});
  expect(endpoints).toContainEqual({method:"GET",
   pattern:"/marketing/journeys/:id/dossier",
   route:"/marketing/journeys/id-acceptance/dossier"});
  expect(endpoints).toContainEqual({method:"POST",
   pattern:"/marketing/learning/knowledge/agent-context-preview",
   route:"/marketing/learning/knowledge/agent-context-preview"});
   expect(endpoints.some(e=>e.method==='POST'&&
    e.pattern==='/marketing/assets/:id/offline-revisions')).toBe(true);
  expect(new Set(endpoints.map(r=>r.method+" "+r.pattern)).size).toBe(endpoints.length);
  for(const e of endpoints){
   if(e.route==="/health"||e.route==="/readyz")continue;
   const permission=permissionForMarketingRoute(e.method,e.route);
   if(["/marketing/me","/marketing/sessions","/marketing/sessions/revoke"].includes(e.route)){
    expect(permission,e.pattern).toBeNull();
   }else expect(permission,e.method+" "+e.pattern).not.toBeNull();
  }
 });
 it("T03-026 prevents non-managers from executing every registered approval and governance mutation",()=>{
  for(const e of endpoints.filter(e=>e.method==="POST"&&
   /approv|revoke|activate|rights-review|dispatch-reservation|tenancy\/roles|incident/.test(e.pattern))){
   const permission=permissionForMarketingRoute(e.method,e.route);
   if(permission===null)continue;
   expect(hasMarketingPermission(actor("VIEWER"),permission),e.pattern).toBe(false);
   expect(hasMarketingPermission(actor("MARKETING_SPECIALIST"),permission),e.pattern).toBe(false);
  }
 });
 it("T03-027 fails closed for unregistered and genuinely external publishing routes",()=>{
  for(const path of ["/marketing/email/send","/marketing/publications/publish",
   "/marketing/audience/export","/marketing/integrations/oauth/token",
   "/marketing/approvals/override","/marketing/users/impersonate"]){
   for(const method of ["POST","DELETE"])
    expect(()=>permissionForMarketingRoute(method,path),method+" "+path).toThrow("permission registry");
  }
 });
 it("T03-028 prohibits destructive methods across every real controller action",()=>{
  for(const e of endpoints.filter(e=>e.route!=="/health")){
   expect(()=>permissionForMarketingRoute("DELETE",e.route),e.route).toThrow("permission registry");
   expect(()=>permissionForMarketingRoute("PUT",e.route),e.route).toThrow("permission registry");
   expect(()=>permissionForMarketingRoute("PATCH",e.route),e.route).toThrow("permission registry");
  }
 });
});
