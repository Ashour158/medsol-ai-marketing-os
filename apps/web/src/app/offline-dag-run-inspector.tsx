"use client";
import {useCallback,useEffect,useState} from "react";
import {readOfflineDagRun,type OfflineRunView} from "../lib/offline-dag-run";
type Identity={userId:string;organizationId:string;email:string;role:string};
type Approval={id:string;objectType:string;objectId:string;workflowExecutionId:string|null};
const button={padding:"8px 12px",background:"#124d83",border:0,borderRadius:8,
 color:"#fff",cursor:"pointer",fontWeight:650} as const;
export default function OfflineDagRunInspector({runId,identity,refreshKey}:{
 runId:string;identity:Identity;refreshKey:number
}){
 const [run,setRun]=useState<OfflineRunView|null>(null);
 const [pending,setPending]=useState<Approval[]>([]);
 const [reason,setReason]=useState("");
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [busy,setBusy]=useState(false);
 const load=useCallback(async()=>{
  if(!/^[a-zA-Z0-9_-]{1,160}$/.test(runId))throw Error("Valid offline workflow ID required");
  const [res,inbox]=await Promise.all([
   fetch("/api/marketing/workflows/"+encodeURIComponent(runId),{
    cache:"no-store",credentials:"same-origin"}),
   fetch("/api/marketing/approvals/pending",{
    cache:"no-store",credentials:"same-origin"})
  ]);
  if(!res.ok||!inbox.ok)throw Error("Canonical workflow and approval inbox access required");
  const ledger:unknown=await res.json(),approvals:unknown=await inbox.json();
  if(!Array.isArray(approvals))throw Error("Invalid canonical approval inbox");
  const projection=readOfflineDagRun(ledger,runId,identity.organizationId);
  const filtered=approvals.filter((a):a is Approval=>{
   if(!a||typeof a!=="object")return false;
   const x=a as Record<string,unknown>;
   return typeof x.id==="string"&&x.workflowExecutionId===runId&&
    x.objectType==="BlueprintWorkflowStep"&&typeof x.objectId==="string";
  });
  if(projection.awaitingApprovalId&&!filtered.some(a=>
    a.id===projection.awaitingApprovalId&&a.objectId===projection.currentStep))
   throw Error("Pending Approval does not match canonical waiting DAG node");
  setPending(filtered);setRun(projection);setError("");
 },[runId,identity.organizationId]);
 useEffect(()=>{let active=true;void load().catch(e=>{
  if(active){setRun(null);setError(e instanceof Error?e.message:"Unable to inspect run");}
 });return()=>{active=false;};},[load,refreshKey]);
 async function decide(decision:"APPROVED"|"REJECTED"){
  if(!run||!run.awaitingApprovalId||run.requestedBy===identity.userId||
    !pending.some(a=>a.id===run.awaitingApprovalId&&a.objectId===run.currentStep)||
    reason.trim().length<12)return;
  setBusy(true);setError("");setNotice("");
  try{
   const response=await fetch("/api/marketing/approvals/decide",{
    method:"POST",credentials:"same-origin",cache:"no-store",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({organizationId:identity.organizationId,
     approvalId:run.awaitingApprovalId,approverUserId:identity.userId,
     commandId:crypto.randomUUID(),correlationId:crypto.randomUUID(),
     decision,rationale:reason.trim()})
   });
   if(!response.ok){
    const data:unknown=await response.json();
    const message=data&&typeof data==="object"&&"message" in data?
     String((data as {message:unknown}).message):"Canonical review was denied";
    throw Error(message);
   }
   await load();setReason("");
   setNotice(decision==="APPROVED"?
    "Independent canonical approval recorded. Operator may now advance the workflow.":
    "Canonical rejection recorded; the workflow must remain blocked.");
  }catch(e){setError(e instanceof Error?e.message:"Decision denied");}
  finally{setBusy(false);}
 }
 const canDecide=Boolean(run?.awaitingApprovalId&&run?.requestedBy!==identity.userId&&
  pending.some(a=>a.id===run?.awaitingApprovalId&&a.objectId===run?.currentStep));
 return <section aria-label="Canonical offline workflow run inspector" style={{
  background:"#f8fafc",border:"1px solid #cbd5e1",padding:14,
  borderRadius:10,marginTop:16}}>
  <h4 style={{marginTop:0}}>Canonical workflow timeline and human review</h4>
  <p style={{fontSize:12,color:"#475569"}}>Read-only step evidence from the tenant-scoped
   WorkflowExecution ledger. Approval is submitted only to the existing independent
   ApprovalService. No step is completed directly by this console.</p>
  <button style={{...button,background:"#64748b"}} disabled={busy}
   onClick={()=>void load().catch(e=>setError(e instanceof Error?e.message:"Refresh failed"))}>
   Refresh canonical run and inbox</button>
  {run&&<>
   <p role="status" style={{fontSize:13}}>
    Status: <strong>{run.status}</strong> · Completed: <strong>{run.completed}/{run.total}</strong> ·
    Pinned revision: <strong>{run.revision}</strong> · External effects:
    <strong> DENIED</strong>
   </p>
   <p style={{fontSize:12,overflowWrap:"anywhere"}}>
    Workflow: {run.id} · Active node: {run.currentStep||"Queued"}
   </p>
   <div style={{overflowX:"auto"}}>
    <table aria-label="Durable offline workflow steps" style={{
     borderCollapse:"collapse",fontSize:12,width:"100%"}}>
     <thead><tr><th align="left">Step</th><th align="left">Type</th>
      <th align="left">Status</th><th align="left">Prerequisites</th></tr></thead>
     <tbody>{run.steps.map(s=><tr key={s.key}>
      <td style={{padding:7,borderTop:"1px solid #cbd5e1"}}>{s.key}</td>
      <td style={{padding:7,borderTop:"1px solid #cbd5e1"}}>{s.kind}
       {s.agentId?" · "+s.agentId:""}</td>
      <td style={{padding:7,borderTop:"1px solid #cbd5e1"}}>
       <strong>{s.status}</strong></td>
      <td style={{padding:7,borderTop:"1px solid #cbd5e1"}}>
       {s.predecessors.join(", ")||"—"}</td>
     </tr>)}</tbody>
    </table>
   </div>
   {run.awaitingApprovalId&&<div style={{marginTop:12}}>
    <p style={{fontSize:13}}>Human decision needed for <strong>{run.currentStep}</strong>.
     {run.requestedBy===identity.userId?
      " The requesting operator cannot approve their own workflow.":
      " Only an independent authorized reviewer may decide."}</p>
    <label style={{fontSize:12,display:"block"}}>
     Independent reviewer rationale (minimum 12 characters)
     <textarea aria-label="Offline workflow decision rationale"
      value={reason} onChange={e=>setReason(e.target.value)}
      style={{display:"block",width:"100%",boxSizing:"border-box",
       minHeight:70,padding:9,border:"1px solid #cbd5e1",borderRadius:8}}/>
    </label>
    <div style={{display:"flex",gap:8,marginTop:9}}>
     <button disabled={busy||!canDecide||reason.trim().length<12}
      style={button} onClick={()=>void decide("APPROVED")}>Approve offline DAG step</button>
     <button disabled={busy||!canDecide||reason.trim().length<12}
      style={{...button,background:"#b91c1c"}}
      onClick={()=>void decide("REJECTED")}>Reject offline DAG step</button>
    </div>
   </div>}
  </>}
  {notice&&<p role="status">{notice}</p>}
  {error&&<p role="alert" style={{fontSize:12,color:"#b91c1c"}}>{error}</p>}
 </section>;
}
