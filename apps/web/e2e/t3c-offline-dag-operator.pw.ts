import {test,expect,type Page} from "@playwright/test";
import {createHash,randomUUID,sign} from "node:crypto";
import {readFileSync} from "node:fs";
/** Real Next + compiled Nest + non-bypass FORCE-RLS PostgreSQL + local signed
 * OIDC. Ephemeral detached Ed25519 release signature. No provider traffic.
 */
const ctl="http://127.0.0.1:3216";
type Persona="admin"|"reviewer"|"viewer"|"foreign";
const person=(who:Persona)=>"t1e-stage-"+who+"@example.invalid";
async function login(page:Page,who:Persona){
 const s=await page.request.post(ctl+"/__select-persona?persona="+who);
 expect(s.status()).toBe(200);
 await page.goto("/api/auth/login");
 await page.getByRole("button",{name:"Load authenticated workspace"}).click();
 await expect(page.getByText("Signed in as "+person(who))).toBeVisible();
}
async function change(page:Page,who:Persona){
 await page.getByRole("button",{name:"Sign out"}).click();
 await expect(page.getByText("Signed in as")).toHaveCount(0);
 await login(page,who);
}
async function api(page:Page,path:string,body?:unknown){
 return page.evaluate(async({path,body,post})=>{
  const res=await fetch("/api/marketing/"+path,{method:post?"POST":"GET",
   credentials:"same-origin",cache:"no-store",
   ...(post?{headers:{"content-type":"application/json"},body:JSON.stringify(body)}:{})});
  let data:unknown;
  try{data=await res.json()}catch{data=null}
  return{status:res.status,data};
 },{path,body,post:body!==undefined});
}
async function ok(page:Page,path:string,body?:unknown):Promise<any>{
 const r=await api(page,path,body);
 expect(r.status,JSON.stringify(r.data)).toBeGreaterThanOrEqual(200);
 expect(r.status,JSON.stringify(r.data)).toBeLessThan(300);
 return r.data;
}
function signedManifest(id="t3c-"+randomUUID().slice(0,12),version=1,canaryPercent=100){
 // Canonical stable field order and exact node/edge sort match R3-G digest.
 const draft={id,version,nodes:[
  {id:"agent",type:"AGENT_TASK",agentId:"MKT-CMO-001",maxSeconds:45},
  {id:"end",type:"END"},{id:"review",type:"APPROVAL"},
  {id:"start",type:"TRIGGER"}
 ],edges:[{from:"agent",to:"review"},{from:"review",to:"end"},
  {from:"start",to:"agent"}]};
 const manifest={draft,canaryPercent,maxSteps:8,
  executionMode:"DETERMINISTIC_NO_MODEL"};
 const digest="sha256:"+createHash("sha256").update(JSON.stringify([
  "medsol-r3g-offline-dag-v1",draft,canaryPercent,8,"DETERMINISTIC_NO_MODEL"
 ])).digest("hex");
 const key=readFileSync("/tmp/medsol-r3y-jwks/t3c-dag-private.pem","utf8");
 const signature=sign(null,Buffer.from("medsol-r3g-dag-signature-v1\n"+digest),key)
  .toString("base64url");
 return{id,manifest,signature,signerKeyId:"t3c-ci-ephemeral"};
}
async function activate(page:Page,release:ReturnType<typeof signedManifest>){
 await ok(page,"architecture/deployments",{
  manifest:release.manifest,signature:release.signature,signerKeyId:release.signerKeyId});
 await change(page,"reviewer");
 const all=await ok(page,"architecture/deployments") as Array<{id:string;blueprintId:string;status:string;revision:number}>;
 const row=all.find(x=>x.blueprintId===release.id&&x.status==="PROPOSED");
 expect(row).toBeTruthy();
 await ok(page,"architecture/deployments/"+row!.id+"/approve",{expectedRevision:1});
 await ok(page,"architecture/deployments/"+row!.id+"/activate",{expectedActiveRevision:0});
 await change(page,"admin");
}
async function launch(page:Page,id:string){
 await page.getByRole("textbox",{name:"Blueprint ID"}).fill(id);
 await page.getByRole("button",{name:"Refresh release history"}).click();
 await page.getByRole("button",{name:"Launch canary-assigned run"}).click();
 const text=page.getByText("Run ID:",{exact:false}).first();
 await expect(text).toBeVisible();
 const ids=await page.locator("section[aria-label='R3-G governed offline DAG console']")
  .locator("p").allTextContents();
 const m=ids.join(" ").match(/Run ID:\s*([0-9a-f-]{36})/i);
 expect(m).toBeTruthy();
 const runId=m![1]!;
 await page.getByRole("button",{name:"Advance bounded steps"}).click();
 await expect(page.getByRole("table",{name:"Durable offline workflow steps"}))
  .toContainText("WAITING_APPROVAL");
 return runId;
}
async function inspect(page:Page,runId:string){
 await page.getByRole("textbox",{name:"Inspect existing offline workflow ID"}).fill(runId);
 await page.getByRole("button",{name:"Open offline workflow timeline"}).click();
 await expect(page.getByRole("table",{name:"Durable offline workflow steps"}))
  .toContainText("review");
}
test("T18-001 separately signed maker/checker completes version-pinned offline DAG UI timeline",async({page})=>{
 await login(page,"admin");
 const release=signedManifest();await activate(page,release);
 const runId=await launch(page,release.id);
 await expect(page.getByText("The requesting operator cannot approve their own workflow.")).toBeVisible();
 await expect(page.getByRole("button",{name:"Approve offline DAG step"})).toBeDisabled();
 await change(page,"reviewer");await inspect(page,runId);
 await page.getByRole("textbox",{name:"Offline workflow decision rationale"})
  .fill("Reviewed bounded synthetic market assessment with source controls");
 await page.getByRole("button",{name:"Approve offline DAG step"}).click();
 await expect(page.getByText("Independent canonical approval recorded.")).toBeVisible();
 await change(page,"admin");await inspect(page,runId);
 await page.getByRole("button",{name:"Advance bounded steps"}).click();
 await expect(page.getByRole("table",{name:"Durable offline workflow steps"}))
  .toContainText("COMPLETED");
 await expect(page.getByRole("status").filter({hasText:"Completed: 4/4"})).toBeVisible();
 const w=await ok(page,"workflows/"+runId);
 expect(w.status).toBe("COMPLETED");
 expect(w.steps).toHaveLength(4);
 expect(w.input.externalEffectsAuthorized).toBe(false);
 expect(w.steps.filter((s:{status:string})=>s.status==="COMPLETED")).toHaveLength(4);
});
test("T18-002 signed reviewer rejection blocks workflow; no automatic execution replay",async({page})=>{
 await login(page,"admin");const release=signedManifest();
 await activate(page,release);
 const runId=await launch(page,release.id);
 await change(page,"reviewer");await inspect(page,runId);
 await page.getByRole("textbox",{name:"Offline workflow decision rationale"})
  .fill("Rejected internal review due to missing verifiable supporting evidence");
 await page.getByRole("button",{name:"Reject offline DAG step"}).click();
 await expect(page.getByText("Canonical rejection recorded;")).toBeVisible();
 await expect(page.getByRole("status").filter({hasText:"Status: BLOCKED"})).toBeVisible();
 const w=await ok(page,"workflows/"+runId);
 expect(w.status).toBe("BLOCKED");
 const attempt=await api(page,"architecture/runs/"+runId+"/tick",{});
 expect(attempt.status).toBeGreaterThanOrEqual(400);
});
test("T18-003 foreign signed identity denied; same-tenant viewer can only read, never tick or decide",async({page})=>{
 await login(page,"admin");const release=signedManifest();
 await activate(page,release);
 const runId=await launch(page,release.id);
 const pending=(await ok(page,"workflows/"+runId)).steps.find((s:{status:string})=>s.status==="WAITING_APPROVAL").output.approvalId as string;
 await change(page,"foreign");
 const foreign=await api(page,"workflows/"+runId);
 expect(foreign.status).toBeGreaterThanOrEqual(400);
 const forged=await api(page,"approvals/decide",{
  organizationId:"r3y-tenant-a",approvalId:randomUUID(),
  approverUserId:"t1e-stage-admin",decision:"APPROVED",rationale:"Forged",
  commandId:randomUUID(),correlationId:randomUUID()});
 expect(forged.status).toBe(403);
 await change(page,"viewer");
 const ledger=await api(page,"workflows/"+runId);
 expect(ledger.status).toBe(200); // Same-tenant read-only workflow visibility is intentional.
 expect((ledger.data as any).organizationId).toBe("r3y-tenant-a");
 expect((ledger.data as any).input.externalEffectsAuthorized).toBe(false);
 const denied=await api(page,"architecture/runs/"+runId+"/tick",{});
 expect(denied.status).toBe(403);
 const viewerDecision=await api(page,"approvals/decide",{
  organizationId:"r3y-tenant-a",approvalId:pending,
  approverUserId:"t1e-stage-viewer",decision:"APPROVED",
  rationale:"Attempted privilege escalation using read-only identity",
  commandId:randomUUID(),correlationId:randomUUID()});
 expect(viewerDecision.status).toBe(403);
 expect((await ok(page,"workflows/"+runId)).status).toBe("WAITING_APPROVAL");
});

test("T18-004 operator run key invalidates when workflow input scope changes",async({page})=>{
 await login(page,"admin");
 const studio=page.locator("section[aria-label='R3-G governed offline DAG console']");
 const key=studio.getByRole("textbox",{name:"Stable request key"});
 const objective=studio.getByRole("textbox",{name:"Objective",exact:true});
 const market=studio.getByRole("textbox",{name:"Market (optional)"});
 const blueprint=studio.getByRole("textbox",{name:"Blueprint ID"});
 await key.fill("manual-key-bound-to-old-scope");
 await objective.fill("Changed business objective");
 await expect(key).toHaveValue("");
 await key.fill("manual-key-bound-to-old-market");
 await market.fill("AE");
 await expect(key).toHaveValue("");
 await key.fill("manual-key-bound-to-old-blueprint");
 await blueprint.fill("different-signed-blueprint");
 await expect(key).toHaveValue("");
 // Batch 3D: exercise the same draft through virtual and signed runtimes.
 const first=signedManifest();
 const virtualInput={draft:first.manifest.draft,requestKey:randomUUID()};
 const virtual=await ok(page,"architecture/blueprint/simulate",virtualInput);
 expect(virtual).toMatchObject({status:"SIMULATED",saved:true,replayed:false,externalEffectsAuthorized:false});
 expect(await ok(page,"architecture/blueprint/simulate",virtualInput)).toMatchObject({workflowExecutionId:virtual.workflowExecutionId,replayed:true});
 expect((await api(page,"architecture/blueprint/simulate",{...virtualInput,draft:{...first.manifest.draft,version:2}})).status).toBe(409);
 const virtualLedger=await ok(page,"workflows/"+virtual.workflowExecutionId);
 expect(virtualLedger).toMatchObject({status:"COMPLETED",workflowType:"BLUEPRINT_VIRTUAL_SIMULATION"});
 expect(virtualLedger.steps).toHaveLength(4);
 for(const step of virtualLedger.steps)expect(step.output).toMatchObject({isActualAgentExecution:false,externalEffectsAuthorized:false});
 const cyclic=await ok(page,"architecture/blueprint/simulate",{requestKey:randomUUID(),draft:{...first.manifest.draft,edges:[...first.manifest.draft.edges,{from:"end",to:"start"}]}});
 expect(cyclic).toMatchObject({status:"BLOCKED",saved:false,workflowExecutionId:null,externalEffectsAuthorized:false});
 const propose=(r:ReturnType<typeof signedManifest>)=>({manifest:r.manifest,signature:r.signature,signerKeyId:r.signerKeyId});
 expect((await api(page,"architecture/deployments",{...propose(first),signature:"A".repeat(86)})).status).toBe(403);
 const v1=await ok(page,"architecture/deployments",propose(first));
 expect(v1).toMatchObject({revision:1,status:"PROPOSED",signatureTrusted:true,externalEffectsAuthorized:false});
 expect(await ok(page,"architecture/deployments",propose(first))).toMatchObject({id:v1.id,replayed:true});
 expect((await api(page,"architecture/deployments/"+v1.id+"/approve",{expectedRevision:1})).status).toBe(403);
 const runInput={blueprintId:first.id,requestKey:randomUUID(),objective:"Synthetic workflow revision evidence",market:"Egypt"};
 expect((await api(page,"architecture/runs",runInput)).status).toBe(409);
 await change(page,"reviewer");
 expect((await api(page,"architecture/deployments/"+v1.id+"/approve",{expectedRevision:2})).status).toBe(409);
 await ok(page,"architecture/deployments/"+v1.id+"/approve",{expectedRevision:1});
 await ok(page,"architecture/deployments/"+v1.id+"/activate",{expectedActiveRevision:0});
 await change(page,"admin");
 const pinned=await ok(page,"architecture/runs",runInput);
 expect(pinned).toMatchObject({status:"RUNNING",replayed:false,externalEffectsAuthorized:false});
 expect(await ok(page,"architecture/runs",runInput)).toMatchObject({workflowExecutionId:pinned.workflowExecutionId,replayed:true});
 expect((await api(page,"architecture/runs",{...runInput,objective:"Altered objective"})).status).toBe(409);
 const v2=await ok(page,"architecture/deployments",propose(signedManifest(first.id,2,1)));
 expect(v2).toMatchObject({revision:2,status:"PROPOSED",canaryPercent:1});
 await change(page,"reviewer");
 await ok(page,"architecture/deployments/"+v2.id+"/approve",{expectedRevision:2});
 expect((await api(page,"architecture/deployments/"+v2.id+"/activate",{expectedActiveRevision:0})).status).toBe(409);
 await ok(page,"architecture/deployments/"+v2.id+"/activate",{expectedActiveRevision:1});
 await change(page,"admin");
 const history=await ok(page,"architecture/deployments?blueprintId="+first.id);
 expect(history.find((x:{id:string})=>x.id===v1.id).status).toBe("SUPERSEDED");
 expect(history.find((x:{id:string})=>x.id===v2.id).status).toBe("ACTIVE");
 // Deterministically select an excluded canary request, not a probabilistic test.
 let excluded="";for(let n=0;n<1000;n++){
  const k="phase3-canary-"+n;
  const h=createHash("sha256").update(JSON.stringify(["medsol-r3g-canary-v1","r3y-tenant-a",first.id,k])).digest();
  if(h.readUInt32BE(0)%100>=1){excluded=k;break}
 }
 expect(excluded).not.toBe("");
 expect(await ok(page,"architecture/runs",{...runInput,requestKey:excluded})).toMatchObject({status:"CANARY_NOT_SELECTED",workflowExecutionId:null,externalEffectsAuthorized:false});
 const pinnedProof=await ok(page,"architecture/runs/"+pinned.workflowExecutionId+"/recovery");
 expect(pinnedProof).toMatchObject({revision:1,release:{deploymentId:v1.id,status:"SUPERSEDED",signatureTrusted:true},automaticReplayAllowed:false,directStepResumeAllowed:false,externalEffectsAuthorized:false});
 await change(page,"reviewer");
 await ok(page,"architecture/deployments/"+v1.id+"/activate",{expectedActiveRevision:2});
 const rollback=await ok(page,"architecture/deployments?blueprintId="+first.id);
 expect(rollback.find((x:{id:string})=>x.id===v1.id).status).toBe("ACTIVE");
 expect(rollback.find((x:{id:string})=>x.id===v2.id).status).toBe("SUPERSEDED");
 await ok(page,"architecture/deployments/"+v1.id+"/revoke",{reason:"Withdraw synthetic signed release before execution"});
 await change(page,"admin");
 expect(await ok(page,"architecture/runs/"+pinned.workflowExecutionId+"/tick",{})).toMatchObject({status:"BLOCKED"});
 const proof=await ok(page,"architecture/runs/"+pinned.workflowExecutionId+"/recovery");
 expect(proof).toMatchObject({status:"BLOCKED",evidenceStatus:"RELEASE_REVOKED_OR_UNTRUSTED",release:{signatureTrusted:false},automaticReplayAllowed:false,directStepResumeAllowed:false,externalEffectsAuthorized:false});
 expect(proof.agentProofs).toHaveLength(0);
 expect((await api(page,"architecture/runs",{...runInput,requestKey:randomUUID()})).status).toBe(409);
 await change(page,"foreign");
 expect((await api(page,"architecture/runs/"+pinned.workflowExecutionId+"/recovery")).status).toBe(404);
});
