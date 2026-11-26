"use client";
import {useState} from "react";
type Entry={approvalId:string;assetId:string;revisionId:string;channel:string;destinationRef:string;
 scheduledAt:string;expiresAt:string;approvalDecision:string;publicationStatus:string|null;current:boolean};
type Report={organizationId:string;brandId:string;start:string;end:string;asOf:string;spacingMinutes:number;
 entries:Entry[];conflicts:{approvalId:string;conflictingApprovalId:string;distanceMinutes:number}[];
 suggestions:{approvalId:string;proposedScheduledAt:string|null;requiresNewExactApproval:true}[];
 externalEffectsAuthorized:false;scheduleChanged:false;engagementOptimizationVerified:false;providerOptimizationVerified:false};
const field={padding:8,border:"1px solid #cbd5e1",borderRadius:6,width:"100%",boxSizing:"border-box" as const};
const button={background:"#124d83",color:"white",border:0,borderRadius:7,padding:"9px 12px",cursor:"pointer"};
export default function EditorialCalendarStudio({organizationId,enabled}:{organizationId:string;enabled:boolean}){
 const [brand,setBrand]=useState(""),[days,setDays]=useState(7),[gap,setGap]=useState(60),[zone,setZone]=useState("Africa/Cairo");
 const [report,setReport]=useState<Report|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const fmt=(s:string)=>new Intl.DateTimeFormat("en-GB",{timeZone:zone,dateStyle:"medium",timeStyle:"short"}).format(new Date(s));
 async function load(){
  setBusy(true);setError("");setReport(null);
  try{
   const start=new Date(),end=new Date(start.getTime()+days*86400000);
   const params=new URLSearchParams({brandId:brand,start:start.toISOString(),end:end.toISOString(),spacingMinutes:String(gap)});
   const r=await fetch("/api/marketing/publications/editorial-calendar?"+params,{cache:"no-store",credentials:"same-origin"});
   const v=await r.json() as Report&{message?:string};
   if(!r.ok)throw Error(v.message??"Calendar request denied");
   if(v.organizationId!==organizationId||v.brandId!==brand||v.scheduleChanged!==false||v.externalEffectsAuthorized!==false||
    v.engagementOptimizationVerified!==false||v.providerOptimizationVerified!==false||!Array.isArray(v.entries)||
    !Array.isArray(v.conflicts)||!Array.isArray(v.suggestions)||v.suggestions.some(s=>s.requiresNewExactApproval!==true))
    throw Error("Unexpected editorial calendar scope");
   setReport(v);
  }catch(e){setError(e instanceof Error?e.message:"Calendar unavailable");}finally{setBusy(false);}
 }
 if(!enabled)return null;
 return <section aria-label="Approved-scope editorial calendar" style={{padding:12,border:"1px solid #cbd5e1",borderRadius:8,marginTop:16}}>
  <h4 style={{marginTop:0}}>Editorial calendar · existing immutable scopes</h4>
  <p style={{fontSize:12}}>Shows the current approval schedule and same-destination timing conflicts. Suggestions are separate proposals, not changes or engagement forecasts. Any new slot requires a new exact human approval.</p>
  <label>Calendar brand ID<input style={field} value={brand} disabled={busy} onChange={e=>{setBrand(e.target.value);setReport(null);}}/></label>
  <label>Calendar horizon<select style={field} value={days} disabled={busy} onChange={e=>{setDays(Number(e.target.value));setReport(null);}}><option value={7}>7 days</option><option value={14}>14 days</option><option value={30}>30 days</option></select></label>
  <label>Minimum same-destination spacing<select style={field} value={gap} disabled={busy} onChange={e=>{setGap(Number(e.target.value));setReport(null);}}>{[15,30,60,120,240,720,1440].map(n=><option key={n} value={n}>{n} minutes</option>)}</select></label>
  <label>Calendar display time zone<select style={field} value={zone} onChange={e=>setZone(e.target.value)}>{["Africa/Cairo","UTC","Asia/Dubai","Europe/Berlin","America/New_York"].map(z=><option key={z}>{z}</option>)}</select></label>
  <button type="button" style={{...button,marginTop:8}} disabled={busy||!brand.trim()} onClick={()=>void load()}>Load editorial calendar and conflicts</button>
  {error&&<p role="alert">{error}</p>}
  {report&&<div style={{fontSize:12,marginTop:10}}>
   <p>{report.entries.length} schedule entries · {report.conflicts.length} conflicts · {zone} display · as of {fmt(report.asOf)}</p>
   {report.entries.map(e=><article key={e.approvalId} style={{borderTop:"1px solid #e2e8f0",padding:"8px 0"}}>
    <strong>{fmt(e.scheduledAt)} · {e.channel} · {e.approvalDecision}</strong>
    <p>Asset {e.assetId} · {e.publicationStatus??"No publication intent"} · {e.current?"Current scope":"Stale scope"}</p>
    <p>Destination {e.destinationRef}</p>
    {report.suggestions.filter(s=>s.approvalId===e.approvalId).map(s=><p key={s.approvalId}>Suggested later slot: {s.proposedScheduledAt?fmt(s.proposedScheduledAt):"No free slot in window"} · new exact approval required</p>)}
   </article>)}
   {report.conflicts.map(c=><p key={c.approvalId+":"+c.conflictingApprovalId}>Conflict · {c.approvalId} / {c.conflictingApprovalId} · {c.distanceMinutes} minutes apart</p>)}
   <small>No schedule change, provider delivery or audience optimization verified.</small>
  </div>}
 </section>;
}
