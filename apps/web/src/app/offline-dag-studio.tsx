"use client";
import {useEffect,useState} from "react";
import OfflineDagGraphEditor from "./offline-dag-graph-editor";
import OfflineDagRunInspector from "./offline-dag-run-inspector";
import {offlineDagRunScope,mayReuseOfflineDagRequestKey} from "../lib/offline-dag-run-scope";
type Identity={userId:string;organizationId:string;email:string;role:string};
type Release={id:string;blueprintId:string;revision:number;digest:string;
 status:string;canaryPercent:number;stepCount:number;signatureTrusted:boolean;
 externalEffectsAuthorized:false};
const EXAMPLE=JSON.stringify({draft:{id:"offline-science-review",version:1,nodes:[
 {id:"start",type:"TRIGGER"},
 {id:"science",type:"AGENT_TASK",agentId:"MKT-SCI-001",maxSeconds:45},
 {id:"review",type:"APPROVAL"},{id:"end",type:"END"}
 ],edges:[{from:"start",to:"science"},{from:"science",to:"review"},
 {from:"review",to:"end"}]},canaryPercent:100,maxSteps:8,
 executionMode:"DETERMINISTIC_NO_MODEL"},null,2);
const button={padding:"9px 13px",borderRadius:8,border:0,color:"#fff",
 background:"#124d83",cursor:"pointer",fontWeight:650} as const;
const field={padding:9,border:"1px solid #cbd5e1",borderRadius:8,
 width:"100%",boxSizing:"border-box" as const};
export default function OfflineDagStudio({identity}:{identity:Identity|null}){
 const [releases,setReleases]=useState<Release[]>([]);
 const [manifest,setManifest]=useState(EXAMPLE);
 const [signature,setSignature]=useState("");
 const [signerKeyId,setSignerKeyId]=useState("");
 const [blueprintId,setBlueprintId]=useState("offline-science-review");
 const [objective,setObjective]=useState("Evidence-based scientific education");
 const [market,setMarket]=useState("");
 const [runKey,setRunKey]=useState("");
 const [runKeyScope,setRunKeyScope]=useState("");
 const [runId,setRunId]=useState("");
 const [lookupRunId,setLookupRunId]=useState("");
 const [runRefreshKey,setRunRefreshKey]=useState(0);
 const [runState,setRunState]=useState<unknown>(null);
 const [error,setError]=useState("");
 const [busy,setBusy]=useState(false);
 const [reason,setReason]=useState("");
 async function call(path:string,body?:unknown):Promise<unknown>{
  const response=await fetch("/api/marketing/architecture/"+path,{
   method:body===undefined?"GET":"POST",credentials:"same-origin",
   cache:"no-store",
   ...(body===undefined?{}:{headers:{"content-type":"application/json"},
    body:JSON.stringify(body)})
  });
  const result:unknown=await response.json();
  if(!response.ok){
   const message=result&&typeof result==="object"&&"message" in result?
    String((result as {message:unknown}).message):
    "Not authorized or offline workflow runtime unavailable";
   throw new Error(message);
  }
  return result;
 }
 async function refresh(){
  const all=await call("deployments");
  setReleases(Array.isArray(all)?all as Release[]:[]);
 }
 useEffect(()=>{if(identity&&["ADMIN","SUPER_ADMIN"].includes(identity.role.toUpperCase())){
  void refresh().catch(e=>setError(e instanceof Error?e.message:"Unable to load"));
 }},[identity?.userId,identity?.organizationId,identity?.role]);
 async function task(action:()=>Promise<void>){
  setBusy(true);setError("");
  try{await action();}catch(e){setError(e instanceof Error?e.message:"Operation failed");}
  finally{setBusy(false);}
 }
 if(!identity||!["ADMIN","SUPER_ADMIN"].includes(identity.role.toUpperCase()))return null;
 const active=releases.find(r=>r.blueprintId===blueprintId&&r.status==="ACTIVE");
 const selected=releases.filter(r=>r.blueprintId===blueprintId);
 const currentRunScope=offlineDagRunScope({organizationId:identity.organizationId,blueprintId,activeReleaseId:active?.id??"",objective,market});
 return <section aria-label="R3-G governed offline DAG console" style={{
  border:"1px solid #cbd5e1",background:"#fff",padding:18,borderRadius:12,
  marginTop:20}}>
  <h3 style={{marginTop:0}}>R3-G · Signed Offline DAG Deployment</h3>
  <p style={{fontSize:13,color:"#475569"}}>
   Manage independently reviewed, cryptographically signed versions of canonical
   workflows. <strong>Internal deterministic execution only:</strong> no provider calls,
   no AI inference, no external publishing or tool invocation. Runtime is disabled
   unless explicitly enabled by the server operator.
  </p>
  <p style={{fontSize:12,color:"#854d0e"}}>
   Sign release manifests with your separately governed Ed25519 signing process.
   Never paste private keys into this console. A draft alone cannot be activated.
  </p>
  <label style={{display:"block",marginTop:12,fontSize:13}}>Signed deployment manifest
   <textarea value={manifest} onChange={e=>{setManifest(e.target.value);setSignature("");}}
    spellCheck={false} style={{...field,height:240,
     fontFamily:"monospace",fontSize:12,display:"block",marginTop:6}}/>
  </label>
  <OfflineDagGraphEditor json={manifest} onChange={next=>{
   setManifest(next);setSignature("");setRunKey("");
  }}/>
  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",
   gap:12,marginTop:10}}>
   <label style={{fontSize:13}}>Trusted signer key ID
    <input value={signerKeyId} onChange={e=>setSignerKeyId(e.target.value)}
     placeholder="Configured public signer ID" style={field}/></label>
   <label style={{fontSize:13}}>Ed25519 signature (base64url)
    <input value={signature} onChange={e=>setSignature(e.target.value)}
     placeholder="Signed digest, never a private key" style={field}/></label>
  </div>
  <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:12}}>
   <button disabled={busy} style={button} onClick={()=>void task(async()=>{
    const parsed=JSON.parse(manifest) as unknown;
    await call("deployments",{manifest:parsed,signature,signerKeyId});
    await refresh();
   })}>Propose signed version</button>
   <button disabled={busy} style={{...button,background:"#64748b"}}
    onClick={()=>void task(refresh)}>Refresh release history</button>
  </div>
  <label style={{fontSize:13,display:"block",marginTop:16}}>Blueprint ID
   <input value={blueprintId} onChange={e=>{setBlueprintId(e.target.value);setRunKey("");setRunKeyScope("");setRunId("");setRunState(null);}}
    style={field}/></label>
  <div style={{overflowX:"auto",marginTop:12}}>
   <table style={{borderCollapse:"collapse",width:"100%",fontSize:12}}>
    <thead><tr><th align="left">Revision</th><th align="left">Status</th>
     <th align="left">Trust</th><th align="left">Canary</th>
     <th align="left">Actions</th></tr></thead>
    <tbody>{selected.map(release=><tr key={release.id}>
     <td style={{padding:8,borderTop:"1px solid #e2e8f0"}}>{release.revision}</td>
     <td style={{padding:8,borderTop:"1px solid #e2e8f0"}}>{release.status}</td>
     <td style={{padding:8,borderTop:"1px solid #e2e8f0"}}>
      {release.signatureTrusted?"Trusted":"Not trusted"}</td>
     <td style={{padding:8,borderTop:"1px solid #e2e8f0"}}>{release.canaryPercent}%</td>
     <td style={{padding:8,borderTop:"1px solid #e2e8f0"}}>
      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
       {release.status==="PROPOSED"&&<button disabled={busy} style={button}
        onClick={()=>void task(async()=>{await call("deployments/"+
         encodeURIComponent(release.id)+"/approve",{
          expectedRevision:release.revision});await refresh();
        })}>Approve (different admin)</button>}
       {["APPROVED","SUPERSEDED"].includes(release.status)&&
        <button disabled={busy} style={button}
         onClick={()=>void task(async()=>{await call("deployments/"+
          encodeURIComponent(release.id)+"/activate",{
           expectedActiveRevision:active?.revision??0});await refresh();
         })}>{release.status==="SUPERSEDED"?"Rollback to version":"Activate"}</button>}
       {release.status!=="REVOKED"&&<button disabled={busy||reason.trim().length<12}
        style={{...button,background:"#b91c1c"}}
        onClick={()=>void task(async()=>{await call("deployments/"+
         encodeURIComponent(release.id)+"/revoke",{reason});await refresh();
        })}>Revoke</button>}
      </div>
     </td>
    </tr>)}</tbody>
   </table>
  </div>
  <label style={{fontSize:13,display:"block",marginTop:12}}>Revocation reason (12+ characters)
   <input value={reason} onChange={e=>setReason(e.target.value)} style={field}/></label>
  <h4>Offline workflow run</h4>
  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:10}}>
   <label style={{fontSize:13}}>Objective
    <input value={objective} onChange={e=>{setObjective(e.target.value);setRunKey("");setRunKeyScope("");}} style={field}/></label>
   <label style={{fontSize:13}}>Market (optional)
    <input value={market} onChange={e=>{setMarket(e.target.value);setRunKey("");setRunKeyScope("");}} style={field}/></label>
   <label style={{fontSize:13}}>Stable request key
    <input value={runKey} onChange={e=>{setRunKey(e.target.value);setRunKeyScope(currentRunScope);}}
     placeholder="Auto-created once" style={field}/></label>
  </div>
  {runKey&&!mayReuseOfflineDagRequestKey(runKey,runKeyScope,currentRunScope)&&
   <p role="status" style={{fontSize:12,color:"#92400e"}}>
    Signed release or run inputs changed. A fresh idempotency key will be generated on launch.
   </p>}
  <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:12}}>
   <button disabled={busy||!active} style={button}
    onClick={()=>void task(async()=>{
     const key=mayReuseOfflineDagRequestKey(runKey,runKeyScope,currentRunScope)
      ?runKey:crypto.randomUUID();
     if(key!==runKey)setRunKey(key);
     setRunKeyScope(currentRunScope);
     const result=await call("runs",{blueprintId,requestKey:key,objective,market}) as
      {workflowExecutionId:string|null;status:string};
     if(result.workflowExecutionId){setRunId(result.workflowExecutionId);setRunRefreshKey(k=>k+1);}
     setRunState(result);
    })}>Launch canary-assigned run</button>
   <button disabled={busy||!runId} style={button}
    onClick={()=>void task(async()=>{
      setRunState(await call("runs/"+encodeURIComponent(runId)+"/tick",{}));
      setRunRefreshKey(k=>k+1);
     })}>Advance bounded steps</button>
   <button disabled={busy||!runId} style={{...button,background:"#64748b"}}
    onClick={()=>void task(async()=>{
     const response=await fetch("/api/marketing/workflows/"+encodeURIComponent(runId),
      {cache:"no-store",credentials:"same-origin"});
     if(!response.ok)throw new Error("Unable to retrieve canonical workflow ledger");
     setRunState(await response.json() as unknown);
     setRunRefreshKey(k=>k+1);
    })}>Inspect full ledger</button>
  </div>
  <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"end",marginTop:14}}>
   <label style={{fontSize:12,flex:"1 1 240px"}}>Inspect existing canonical offline run ID
    <input aria-label="Inspect existing offline workflow ID" style={field}
     value={lookupRunId} onChange={e=>setLookupRunId(e.target.value.trim())}
     placeholder="Paste a tenant-owned workflow ID"/></label>
   <button style={{...button,background:"#475569"}}
    disabled={busy||!/^[a-zA-Z0-9_-]{1,160}$/.test(lookupRunId)}
    onClick={()=>{setRunId(lookupRunId);setRunRefreshKey(k=>k+1);}}>
    Open offline workflow timeline</button>
  </div>
  {runId&&<OfflineDagRunInspector runId={runId} identity={identity}
   refreshKey={runRefreshKey}/>}
  {runId&&<p style={{fontSize:12,overflowWrap:"anywhere"}}>
   Run ID: <strong>{runId}</strong>. When waiting, use the existing
   approval inbox with a different authorized reviewer; then advance again.
  </p>}
  {error&&<p role="alert" style={{color:"#b91c1c",fontSize:13}}>{error}</p>}
  {runState!==null&&<pre aria-label="Offline DAG run result"
    style={{fontSize:12,whiteSpace:"pre-wrap",overflowWrap:"anywhere",
     background:"#f8fafc",padding:12,borderRadius:8}}>
   {JSON.stringify(runState,null,2)}</pre>}
 </section>;
}
