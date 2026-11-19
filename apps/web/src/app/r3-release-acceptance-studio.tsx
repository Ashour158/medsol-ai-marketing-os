"use client";
import {useState} from "react";

type Identity={organizationId:string;userId:string;role:string};
type Gate={id:string;owner:string;status:string;evidence:string};
type Readiness={
 asOf:string;verdict:"NOT_CERTIFIED";productionExternalEffectsAuthorized:false;
 counts:Record<string,number>;gates:Gate[];incidentCount:number;
 requiredAction:string;certificationCanBeOverriddenByThisReport:false
};
type Recovery={
 workflowExecutionId:string;status:string;evidenceStatus:string;
 automaticReplayAllowed:false;directStepResumeAllowed:false;
 release:{status:string;signatureTrusted:boolean;digest:string|null};
 lease:{generation:number;expired:boolean;leaseHeld:boolean};
 steps:{stepKey:string;status:string}[];agentProofs:{id:string;status:string;agentId:string}[];
 requiredOperatorAction:string
};
export default function R3AcceptanceStudio({identity}:{identity:Identity|null}){
 const [report,setReport]=useState<Readiness|null>(null);
 const [recovery,setRecovery]=useState<Recovery|null>(null);
 const [runId,setRunId]=useState("");
 const [error,setError]=useState("");
 const [loading,setLoading]=useState(false);
 const visible=!!identity&&["ADMIN","SUPER_ADMIN","CMO","MARKETING_DIRECTOR"]
  .includes(identity.role.toUpperCase());
 async function get(path:string){
  const res=await fetch("/api/marketing/architecture/"+path,{
   method:"GET",credentials:"same-origin",cache:"no-store"});
  const data:unknown=await res.json();
  if(!res.ok)throw new Error(data&&typeof data==="object"&&"message" in data?
   String((data as {message:unknown}).message):"Read-only audit denied");
  return data;
 }
 async function act(fn:()=>Promise<void>){
  setLoading(true);setError("");
  try{await fn();}catch(e){
   setError(e instanceof Error?e.message:"Audit unavailable");
  }finally{setLoading(false);}
 }
 if(!visible)return null;
 return <section aria-label="R3 release safety and recovery acceptance"
  style={{background:"#fff",padding:20,border:"1px solid #cbd5e1",
   borderRadius:12,marginTop:20}}>
   <h3 style={{marginTop:0}}>R3-J · System-wide Acceptance & Recovery</h3>
   <p style={{color:"#475569",fontSize:13}}>
    Live, read-only evidence from the tenant’s existing engines. Green CI and
    offline simulation do <strong>not</strong> certify production readiness;
    no provider account or external operation is used by this panel.
   </p>
   <button disabled={loading}
    style={{padding:"9px 14px",background:"#164b80",color:"white",
     border:0,borderRadius:8,cursor:"pointer",fontWeight:650}}
    onClick={()=>void act(async()=>setReport(await get("readiness") as Readiness))}>
    Inspect release gates
   </button>
   {report&&<div style={{marginTop:14}}>
    <p style={{fontWeight:700}}>Release verdict: {report.verdict.replaceAll("_"," ")}
     {" · "}{report.incidentCount} observed incident(s) in core ledgers</p>
    <p style={{fontSize:12,color:"#475569"}}>{report.requiredAction}</p>
    <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
     <thead><tr><th align="left">Gate / owner</th><th align="left">State</th>
      <th align="left">Evidence limitation</th></tr></thead>
     <tbody>{report.gates.map(g=><tr key={g.id}>
      <td style={{padding:8,borderTop:"1px solid #e2e8f0"}}>
       <strong>{g.id}</strong><div>{g.owner}</div></td>
      <td style={{padding:8,borderTop:"1px solid #e2e8f0"}}>{g.status}</td>
      <td style={{padding:8,borderTop:"1px solid #e2e8f0"}}>{g.evidence}</td>
     </tr>)}</tbody>
    </table>
    <details><summary>Bounded canonical ledger counts</summary>
     <pre style={{fontSize:12,whiteSpace:"pre-wrap"}}>
      {JSON.stringify(report.counts,null,2)}</pre>
    </details>
   </div>}
   <h4 style={{marginBottom:7}}>Offline DAG recovery evidence</h4>
   <p style={{fontSize:12,color:"#475569"}}>
    Inspect an existing workflow run ID before considering operator recovery.
    This operation cannot retry, approve, publish or change any run state.
   </p>
   <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
    <input aria-label="Offline workflow execution ID" value={runId}
     onChange={e=>setRunId(e.target.value)}
     style={{minWidth:240,flex:"1 1 250px",padding:"9px 12px",
      borderRadius:8,border:"1px solid #cbd5e1"}}/>
    <button disabled={loading||!runId.trim()}
     style={{padding:"9px 14px",background:"#475569",color:"white",
      border:0,borderRadius:8,cursor:"pointer",fontWeight:650}}
     onClick={()=>void act(async()=>setRecovery(await get(
      "runs/"+encodeURIComponent(runId.trim())+"/recovery") as Recovery))}>
      Inspect recovery ledger
    </button>
   </div>
   {recovery&&<div style={{marginTop:12,fontSize:12}}>
    <p><strong>Run:</strong> {recovery.workflowExecutionId}
     {" · "}{recovery.status}{" · "}{recovery.evidenceStatus}</p>
    <p><strong>Release:</strong> {recovery.release.status}
     {" · Signature trusted: "}{String(recovery.release.signatureTrusted)}</p>
    <p><strong>Lease generation:</strong> {recovery.lease.generation}
     {" · Expired: "}{String(recovery.lease.expired)}</p>
    <p><strong>Next action:</strong> {recovery.requiredOperatorAction}</p>
    <p><strong>Automatic replay:</strong> prohibited</p>
    <details><summary>Step and agent evidence</summary>
     <pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>
      {JSON.stringify({steps:recovery.steps,agents:recovery.agentProofs},null,2)}
     </pre>
    </details>
   </div>}
   {error&&<p role="alert" style={{color:"#b91c1c"}}>{error}</p>}
  </section>;
}
