import {test,expect,type Page} from "@playwright/test";
import {createHash,randomUUID,sign} from "node:crypto";
import {readFileSync} from "node:fs";
/** Independent signed OIDC maker-checker and actual FORCE RLS PostgreSQL;
 * only synthetic reviewed knowledge, model/provider calls remain disabled.
 */
const ctl="http://127.0.0.1:3216";
type Persona="admin"|"reviewer";
async function login(page:Page,who:Persona){
 const select=await page.request.post(ctl+"/__select-persona?persona="+who);
 expect(select.status()).toBe(200);
 await page.goto("/api/auth/login");
 await page.getByRole("button",{name:"Load authenticated workspace"}).click();
 await expect(page.getByText("Signed in as t1e-stage-"+who+"@example.invalid")).toBeVisible();
}
async function change(page:Page,who:Persona){
 await page.getByRole("button",{name:"Sign out"}).click();
 await expect(page.getByText("Signed in as")).toHaveCount(0);
 await login(page,who);
}
async function req(page:Page,path:string,body?:unknown){
 return page.evaluate(async({path,body,post})=>{
  const res=await fetch("/api/marketing/"+path,{method:post?"POST":"GET",
   cache:"no-store",credentials:"same-origin",
   ...(post?{headers:{"content-type":"application/json"},body:JSON.stringify(body)}:{})});
  let data:unknown;try{data=await res.json()}catch{data=null}
  return{status:res.status,data};
 },{path,body,post:body!==undefined});
}
async function ok(page:Page,path:string,body?:unknown):Promise<any>{
 const r=await req(page,path,body);
 expect(r.status,JSON.stringify(r.data)).toBeGreaterThanOrEqual(200);
 expect(r.status,JSON.stringify(r.data)).toBeLessThan(300);
 return r.data;
}
function release(){
 const id="t3d-"+randomUUID().slice(0,12),agentId="MKT-CMO-001";
 const draft={id,version:1,nodes:[
  {id:"agent",type:"AGENT_TASK",agentId,maxSeconds:45},
  {id:"end",type:"END"},{id:"review",type:"APPROVAL"},
  {id:"start",type:"TRIGGER"}
 ],edges:[{from:"agent",to:"review"},{from:"review",to:"end"},
  {from:"start",to:"agent"}]};
 const manifest={draft,canaryPercent:100,maxSteps:8,
  executionMode:"DETERMINISTIC_NO_MODEL"};
 const digest="sha256:"+createHash("sha256").update(JSON.stringify([
  "medsol-r3g-offline-dag-v1",draft,100,8,"DETERMINISTIC_NO_MODEL"
 ])).digest("hex");
 const signature=sign(null,Buffer.from("medsol-r3g-dag-signature-v1\n"+digest),
  readFileSync("/tmp/medsol-r3y-jwks/t3d-dag-private.pem","utf8"))
  .toString("base64url");
 return{id,manifest,signature,signerKeyId:"t3d-ci-ephemeral"};
}
async function activate(page:Page,r:ReturnType<typeof release>){
 await ok(page,"architecture/deployments",{
  manifest:r.manifest,signature:r.signature,signerKeyId:r.signerKeyId});
 await change(page,"reviewer");
 const all=await ok(page,"architecture/deployments") as Array<{
  blueprintId:string;id:string;revision:number;status:string
 }>;
 const row=all.find(x=>x.blueprintId===r.id&&x.status==="PROPOSED");
 expect(row).toBeDefined();
 await ok(page,"architecture/deployments/"+row!.id+"/approve",{expectedRevision:1});
 await ok(page,"architecture/deployments/"+row!.id+"/activate",{expectedActiveRevision:0});
 await change(page,"admin");
}
async function source(page:Page,agentId:string){
 const text="Long-read genomics sequencing evaluation requires independent "
  +"scientific evidence, source provenance, regulatory review and human "
  +"approval before making diagnostic performance claims. Reproducibility "
  +"must be assessed against independently validated literature.";
 return ok(page,"learning/knowledge",{
  sourceKey:"t3d-evidence-"+randomUUID(),
  title:"Reviewed genomics sequencing evidence fixture",
  sourceUrl:"https://example.org/offline-evidence-fixture",
  expiresAt:"2027-12-31T00:00:00.000Z",
  accessMode:"AGENT_SCOPED",agentScope:[agentId],text
 });
}
async function approveSource(page:Page,id:string){
 await change(page,"reviewer");
 await ok(page,"learning/knowledge/"+id+"/review",{
  decision:"REVIEW",reason:"Verified that the synthetic sample is suitable for offline governance testing"
 });
 await change(page,"admin");
}
async function waiting(page:Page,blueprintId:string){
 const launch=await ok(page,"architecture/runs",{
  blueprintId,requestKey:randomUUID(),
  objective:"Long-read genomics sequencing marketing assessment requires evidence",
  market:"Egypt"
 });
 expect(launch.status).toBe("RUNNING");
 expect(launch.externalEffectsAuthorized).toBe(false);
 const runId=launch.workflowExecutionId as string;
 const tick=await ok(page,"architecture/runs/"+runId+"/tick",{});
 expect(tick.status).toBe("WAITING_APPROVAL");
 const wf=await ok(page,"workflows/"+runId);
 const agent=wf.steps.find((s:{stepKey:string})=>s.stepKey==="agent");
 const human=wf.steps.find((s:{stepKey:string})=>s.stepKey==="review");
 expect(agent.status).toBe("COMPLETED");
 expect(agent.output.knowledgeMode).toBe("CITATIONS_REQUIRED");
 expect(human.status).toBe("WAITING_APPROVAL");
 const evidence=await ok(page,"agents/executions/"+agent.output.agentExecutionId);
 expect(evidence.input.knowledgeContext.untrustedDataNotInstructions).toBe(true);
 expect(evidence.decision.releaseEvidence.externalEffectsAuthorized).toBe(false);
 return{runId,wf,agent,approvalId:human.output.approvalId as string};
}
test("T19-001 signed DAG consults only independently reviewed, scoped evidence and finishes through independent approval",async({page})=>{
 await login(page,"admin");
 const r=release();await activate(page,r);
 const allowed=await source(page,"MKT-CMO-001");
 const outside=await source(page,"MKT-SCI-001");
 await approveSource(page,allowed.id);
 await approveSource(page,outside.id);
 const result=await waiting(page,r.id);
 const refs=result.agent.output.evidenceRefs as Array<{documentId:string}>;
 expect(refs.some(x=>x.documentId===allowed.id)).toBe(true);
 expect(refs.some(x=>x.documentId===outside.id)).toBe(false);
 await change(page,"reviewer");
 const decided=await ok(page,"approvals/decide",{
  organizationId:"r3y-tenant-a",approverUserId:"t1e-stage-reviewer",
  commandId:randomUUID(),correlationId:randomUUID(),
  approvalId:result.approvalId,decision:"APPROVED",
  rationale:"Independently reviewed source scope and scientific claim limits"
 });
 expect(decided.decision).toBe("APPROVED");
 await change(page,"admin");
 const done=await ok(page,"architecture/runs/"+result.runId+"/tick",{});
 expect(done.status).toBe("COMPLETED");
 const wf=await ok(page,"workflows/"+result.runId);
 expect(wf.output.externalEffectsAuthorized).toBe(false);
});
test("T19-002 source revoked after completed agent checkpoint blocks later review",async({page})=>{
 await login(page,"admin");const r=release();await activate(page,r);
 const doc=await source(page,"MKT-CMO-001");await approveSource(page,doc.id);
 const v=await waiting(page,r.id);
 expect(v.agent.output.evidenceRefs.some((x:{documentId:string})=>x.documentId===doc.id))
  .toBe(true);
 await ok(page,"learning/knowledge/"+doc.id+"/revoke",{
  reason:"Withdraw synthetic scientific source before independent review"
 });
 await change(page,"reviewer");
 const denied=await req(page,"approvals/decide",{
  organizationId:"r3y-tenant-a",approverUserId:"t1e-stage-reviewer",
  commandId:randomUUID(),correlationId:randomUUID(),
  approvalId:v.approvalId,decision:"APPROVED",
  rationale:"Must not authorize withdrawn evidence from prior agent checkpoint"
 });
 expect(denied.status).toBe(409);
 expect((await ok(page,"workflows/"+v.runId)).status).toBe("WAITING_APPROVAL");
 const rejected=await ok(page,"approvals/decide",{
  organizationId:"r3y-tenant-a",approverUserId:"t1e-stage-reviewer",
  commandId:randomUUID(),correlationId:randomUUID(),
  approvalId:v.approvalId,decision:"REJECTED",
  rationale:"Scientific citation revoked; workflow cannot be approved"
 });
 expect(rejected.decision).toBe("REJECTED");
 expect((await ok(page,"workflows/"+v.runId)).status).toBe("BLOCKED");
});
test("T19-003 source revoked after human approval blocks final signed DAG tick",async({page})=>{
 await login(page,"admin");const r=release();await activate(page,r);
 const doc=await source(page,"MKT-CMO-001");await approveSource(page,doc.id);
 const v=await waiting(page,r.id);
 await change(page,"reviewer");
 await ok(page,"approvals/decide",{
  organizationId:"r3y-tenant-a",approverUserId:"t1e-stage-reviewer",
  commandId:randomUUID(),correlationId:randomUUID(),
  approvalId:v.approvalId,decision:"APPROVED",
  rationale:"Evidence reviewed as valid at approval time"
 });
 await change(page,"admin");
 await ok(page,"learning/knowledge/"+doc.id+"/revoke",{
  reason:"Synthetic source withdrawn after independent approval before continuation"
 });
 const blocked=await ok(page,"architecture/runs/"+v.runId+"/tick",{});
 expect(blocked.status).toBe("BLOCKED");
 const wf=await ok(page,"workflows/"+v.runId);
 expect(wf.currentStep).toBe("CITED_KNOWLEDGE_INVALIDATED");
 expect(wf.status).toBe("BLOCKED");
 expect(wf.output?.externalEffectsAuthorized).not.toBe(true);
});
