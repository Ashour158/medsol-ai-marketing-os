/** Read-only presentation projection of the canonical WorkflowExecution ledger.
 * This module never determines authorization, advances state, or writes a step.
 * Rejects malformed/non-offline/cross-tenant results rather than painting them
 * as successful. The Nest WorkflowExecution + Approval remain authoritative.
 */
const rec=(x:unknown):Record<string,unknown>=>{
 if(!x||typeof x!=="object"||Array.isArray(x))throw Error("Canonical workflow record required");
 return x as Record<string,unknown>;
};
const id=(x:unknown)=>typeof x==="string"&&/^[a-zA-Z0-9_-]{1,160}$/.test(x);
export type OfflineRunStep={
 id:string;key:string;kind:string;status:string;order:number;
 predecessors:string[];approvalId:string|null;agentId:string|null;
};
export type OfflineRunView={
 id:string;status:string;currentStep:string;requestedBy:string;
 releaseDigest:string;revision:number;steps:OfflineRunStep[];
 awaitingApprovalId:string|null;completed:number;total:number;
 externalEffectsAuthorized:false;
};
const workflowStatuses=new Set(["RUNNING","WAITING_APPROVAL","COMPLETED","BLOCKED","FAILED","CANCELLED"]);
const stepStatuses=new Set(["PENDING","RUNNING","WAITING_APPROVAL","COMPLETED","FAILED","BLOCKED"]);
const kinds=new Set(["TRIGGER","PARALLEL","JOIN","AGENT_TASK","HUMAN_TASK","APPROVAL","END"]);
export function readOfflineDagRun(raw:unknown,expectedId:string,expectedTenant:string):OfflineRunView{
 const w=rec(raw),input=rec(w.input);
 if(!id(expectedId)||w.id!==expectedId||w.organizationId!==expectedTenant||
    w.workflowType!=="BLUEPRINT_OFFLINE_DAG"||
    input.offlineOnly!==true||input.externalEffectsAuthorized!==false||
    typeof input.releaseDigest!=="string"||!/^sha256:[a-f0-9]{64}$/.test(input.releaseDigest)||
    !Number.isSafeInteger(input.revision)||(input.revision as number)<1||
    typeof input.requestedBy!=="string"||!id(input.requestedBy)||
    !workflowStatuses.has(String(w.status))||!Array.isArray(w.steps)||
    w.steps.length<2||w.steps.length>32)
  throw Error("Not a trusted tenant-scoped offline DAG workflow ledger");
 const steps:OfflineRunStep[]=w.steps.map((untrusted:unknown)=>{
  const s=rec(untrusted),data=rec(s.input);
  if(!id(s.id)||!id(s.stepKey)||!kinds.has(String(data.type))||
     !stepStatuses.has(String(s.status))||
     !Number.isSafeInteger(data.order)||(data.order as number)<0||
     !Array.isArray(data.predecessorKeys)||
     !data.predecessorKeys.every(id)||
     data.externalEffectsAuthorized!==false||
     (data.agentId!==null&&data.agentId!==undefined&&!id(data.agentId)))
   throw Error("Untrusted or inconsistent canonical DAG step");
  const out=s.output===null||s.output===undefined?{}:rec(s.output);
  const approvalId=s.status==="WAITING_APPROVAL"?out.approvalId:null;
  if(s.status==="WAITING_APPROVAL"&&
    (!["APPROVAL","HUMAN_TASK"].includes(String(data.type))||!id(approvalId)))
   throw Error("Human wait does not reference canonical Approval");
  return{id:s.id as string,key:s.stepKey as string,
   kind:data.type as string,status:s.status as string,order:data.order as number,
   predecessors:data.predecessorKeys as string[],
   agentId:typeof data.agentId==="string"?data.agentId:null,
   approvalId:typeof approvalId==="string"?approvalId:null};
 });
 if(new Set(steps.map(s=>s.key)).size!==steps.length||
    new Set(steps.map(s=>s.order)).size!==steps.length||
    steps.some(s=>s.predecessors.some(p=>!steps.some(x=>x.key===p))))
  throw Error("Canonical DAG contains duplicate or missing step references");
 steps.sort((a,b)=>a.order-b.order);
 const waiting=steps.filter(s=>s.status==="WAITING_APPROVAL");
 if(waiting.length>1||
   (w.status==="WAITING_APPROVAL"?
    waiting.length!==1||w.currentStep!==waiting[0]!.key:waiting.length!==0)||
   (w.status==="COMPLETED"&&steps.some(s=>s.status!=="COMPLETED")))
  throw Error("Canonical workflow and approval status do not reconcile");
 return{id:w.id as string,status:w.status as string,
  currentStep:typeof w.currentStep==="string"?w.currentStep:"",
  requestedBy:input.requestedBy as string,
  releaseDigest:input.releaseDigest as string,revision:input.revision as number,
  steps,awaitingApprovalId:waiting[0]?.approvalId??null,
  completed:steps.filter(s=>s.status==="COMPLETED").length,total:steps.length,
  externalEffectsAuthorized:false};
}
