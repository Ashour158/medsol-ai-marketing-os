"use client";
import {useState} from "react";
type Report={experimentKey:string;approvalId:string;scopeDigest:string;decision:string;campaignId:string;
 formAId:string;formBId:string;endsAt:string;approvedAt:string|null;windowEnded:boolean;
 assignments:{contactId:string;arm:"A"|"B"}[];results:null|{status:string;arms:{arm:string;assigned:number;recordedAssignedFormSubmissions:number;recordedSubmissionRatePercent:number}[];
 crossoverContacts:number;changedConsentContacts:number;actualExposureVerified:false;causalLiftValidated:false;externalEffectsAuthorized:false};
 syntheticOnly:true;actualExposureVerified:false;causalLiftValidated:false;realLeadsVerified:false;externalEffectsAuthorized:false};
const field={display:"block",boxSizing:"border-box" as const,width:"100%",padding:8,border:"1px solid #cbd5e1",borderRadius:6};
const btn={padding:"9px 12px",background:"#124d83",color:"white",border:0,borderRadius:7,cursor:"pointer"};
export default function SyntheticExperimentStudio({enabled,campaignId}:{enabled:boolean;campaignId:string}){
 const [key,setKey]=useState(""),[formAId,setFormA]=useState(""),[formBId,setFormB]=useState(""),[contacts,setContacts]=useState("");
 const [endsAt,setEndsAt]=useState(""),[report,setReport]=useState<Report|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const current=report?.campaignId===campaignId&&report.experimentKey===key?report:null;
 async function call(path:string,body?:unknown){
  const r=await fetch("/api/marketing/performance/experiments"+path,{method:body===undefined?"GET":"POST",
   cache:"no-store",credentials:"same-origin",...(body===undefined?{}:{headers:{"content-type":"application/json"},body:JSON.stringify(body)})});
  const value=await r.json();if(!r.ok)throw Error(typeof value.message==="string"?value.message:"Experiment request rejected");return value;
 }
 async function load(experimentKey:string){
  const r=await call("/"+encodeURIComponent(experimentKey)) as Report;
  if(r.experimentKey!==experimentKey||r.campaignId!==campaignId||r.syntheticOnly!==true||r.actualExposureVerified!==false||
   r.causalLiftValidated!==false||r.realLeadsVerified!==false||r.externalEffectsAuthorized!==false||!Array.isArray(r.assignments)||
   r.assignments.length<4||r.assignments.length>100||r.assignments.some(a=>a.arm!=="A"&&a.arm!=="B")||
   (r.results&&(r.results.actualExposureVerified!==false||r.results.causalLiftValidated!==false||r.results.externalEffectsAuthorized!==false)))
   throw Error("Unexpected experiment scope or effects");
  setReport(r);
 }
 async function run(fn:()=>Promise<void>){
  setBusy(true);setError("");try{await fn();}catch(e){setError(e instanceof Error?e.message:"Experiment operation failed");}
  finally{setBusy(false);}
 }
 return <section aria-label="Durable synthetic experiment studio" style={{padding:14,marginTop:16,border:"1px solid #cbd5e1",borderRadius:8}}>
  <h4 style={{marginTop:0}}>Synthetic experiment · fixed assignment and reviewed evidence</h4>
  <p style={{fontSize:12}}>Create two different independently approved internal conversion form revisions for this campaign. Choose 4–100 existing eligible synthetic contact IDs. Assignment is deterministic and balanced; a separate manager must approve the exact plan. No live A/B traffic, delivery or causal lift is measured. Only persisted mock submissions after approval and before the end are counted. Never enter real customer information.</p>
  <label>Experiment fixture key<input style={field} value={key} disabled={!enabled||busy}
   onChange={e=>{setKey(e.target.value);setReport(null);}} placeholder="fixture-experiment-001"/></label>
  <button type="button" style={{...btn,marginTop:6}} disabled={!enabled||busy} onClick={()=>{setKey("fixture-"+crypto.randomUUID());setReport(null);}}>Generate fixture key</button>
  <label>Approved form A ID<input style={field} value={formAId} disabled={!enabled||busy} onChange={e=>setFormA(e.target.value)}/></label>
  <label>Approved form B ID<input style={field} value={formBId} disabled={!enabled||busy} onChange={e=>setFormB(e.target.value)}/></label>
  <label>Synthetic contact IDs (comma separated)<textarea style={field} rows={4} value={contacts} disabled={!enabled||busy} onChange={e=>setContacts(e.target.value)}/></label>
  <label>Experiment end (UTC ISO timestamp)<input style={field} value={endsAt} disabled={!enabled||busy} placeholder="2026-12-01T12:00:00.000Z" onChange={e=>setEndsAt(e.target.value)}/></label>
  <div style={{display:"flex",gap:8,marginTop:10,flexWrap:"wrap"}}>
   <button type="button" style={btn} disabled={!enabled||busy||!campaignId||!key||!formAId||!formBId||!endsAt||!contacts.trim()}
    onClick={()=>void run(async()=>{
     const result=await call("",{experimentKey:key,campaignId,formAId,formBId,contactIds:contacts.split(",").map(x=>x.trim()).filter(Boolean),endsAt});
     if(result.syntheticOnly!==true||result.externalEffectsAuthorized!==false)throw Error("Unexpected experiment proposal effects");
     await load(key);
    })}>Propose fixed synthetic assignment</button>
   <button type="button" style={btn} disabled={!enabled||busy||!key||!campaignId} onClick={()=>void run(()=>load(key))}>Refresh experiment evidence</button>
  </div>
  {current&&<div style={{fontSize:12,marginTop:10}}>
   <p>Approval {current.approvalId} · {current.decision} · {current.windowEnded?"Window ended":"Window open"}</p>
   <p>Plan fingerprint: {current.scopeDigest}</p>
   <details><summary>Fixed synthetic cohort assignments ({current.assignments.length})</summary>
    {current.assignments.map(m=><div key={m.contactId}>Arm {m.arm} · {m.contactId}</div>)}</details>
   {current.results?<><strong>{current.results.status.replaceAll("_"," ")}</strong>
    {current.results.arms.map(a=><p key={a.arm}>Arm {a.arm}: {a.recordedAssignedFormSubmissions} / {a.assigned} assigned mock submissions ({a.recordedSubmissionRatePercent}%)</p>)}
    <p>Crossovers excluded: {current.results.crossoverContacts} · changed-consent contacts excluded: {current.results.changedConsentContacts}</p>
   </>:<p>Independent approval required before recording evidence counts.</p>}
   <p>Historical synthetic evidence only · no actual exposure, verified leads, causal lift, external action or production certification.</p>
  </div>}
  {error&&<p role="alert">{error}</p>}
 </section>;
}
