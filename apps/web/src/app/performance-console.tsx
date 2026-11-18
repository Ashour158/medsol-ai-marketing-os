"use client";
import {useState} from "react";
type Campaign={id:string;name:string;code:string};
type Observation={id:string;campaignId:string;metricKey:string;value:string;status:string;sourceReference:string;submittedBy:string};
type PerformanceSummary={status:string;campaign:{id:string;name:string};totals:Record<string,string>;
 derived:{ctrPercent:number|null;clickToLeadPercent:number|null;spendMicrosPerLead:string|null};
 pendingReviewCount:number;independentlyVerified:boolean;attributionValidated:boolean};
export default function PerformanceConsole({enabled}:{enabled:boolean}){
 const [campaigns,setCampaigns]=useState<Campaign[]>([]);
 const [campaignId,setCampaignId]=useState("");
 const [summary,setSummary]=useState<PerformanceSummary|null>(null);
 const [observations,setObservations]=useState<Observation[]>([]);
 const [metricKey,setMetricKey]=useState("impressions");
 const [value,setValue]=useState("");
 const [sourceRecordId,setSourceRecordId]=useState("");
 const [sourceReference,setSourceReference]=useState("");
 const [reviewId,setReviewId]=useState("");
 const [rationale,setRationale]=useState("");
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const button={background:"#124d83",color:"white",padding:"9px 13px",border:0,borderRadius:7,cursor:"pointer"};
 const field={padding:10,width:"100%",boxSizing:"border-box" as const,background:"#fff",
  border:"1px solid #cbd5e1",borderRadius:7,marginTop:5};
 const call=async(path:string,body?:unknown)=>{
  const response=await fetch("/api/marketing/"+path,{method:body===undefined?"GET":"POST",
   headers:body===undefined?{}:{"content-type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)}),cache:"no-store"});
  const result=await response.json();if(!response.ok)throw new Error(result.message??"Request failed");
  return result;
 };
 async function refresh(){
  const [all,list]=await Promise.all([call("campaigns"),call("performance/observations")]);
  setCampaigns(all as Campaign[]);setObservations(list as Observation[]);
  if(campaignId)setSummary(await call("performance/campaigns/"+encodeURIComponent(campaignId)) as PerformanceSummary);
 }
 async function act(callback:()=>Promise<void>){
  setBusy(true);setError("");setNotice("");
  try{await callback();}catch(e){setError(e instanceof Error?e.message:"Unexpected error");}finally{setBusy(false);}
 }
 return <div style={{border:"1px solid #dbe4ed",borderRadius:12,padding:18,marginTop:16,background:"#f8fafc"}}>
  <div style={{display:"flex",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
   <div><h3 style={{margin:0}}>Measured campaign performance</h3>
    <p style={{fontSize:12,color:"#64748b",marginTop:5}}>Source-backed observations; imports are quarantined until an independent human reviews them.</p></div>
   <button style={button} disabled={busy||!enabled} onClick={()=>act(refresh)}>Refresh evidence</button>
  </div>
  {enabled&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(270px,1fr))",gap:14,marginTop:15}}>
   <div>
    <label>Campaign<select style={field} value={campaignId} onChange={e=>{setCampaignId(e.target.value);setSummary(null);}}>
     <option value="">Choose campaign</option>{campaigns.map(c=><option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
    </select></label>
    <button style={{...button,marginTop:10}} disabled={busy||!campaignId} onClick={()=>act(async()=>{
     setSummary(await call("performance/campaigns/"+encodeURIComponent(campaignId)) as PerformanceSummary);
    })}>Calculate approved-source KPIs</button>
    {summary&&<div style={{marginTop:12,fontSize:13}}>
     <strong>{summary.campaign.name} — {summary.status}</strong>
     <table style={{width:"100%",marginTop:9,borderCollapse:"collapse"}}>
      <tbody>{Object.entries(summary.totals).map(([k,v])=><tr key={k}><td style={{padding:"5px 0"}}>{k}</td><td style={{textAlign:"right"}}>{v}</td></tr>)}</tbody>
     </table>
     <p>CTR: {summary.derived.ctrPercent===null?"Insufficient denominator":summary.derived.ctrPercent+"%"}</p>
     <p>Click-to-lead: {summary.derived.clickToLeadPercent===null?"Insufficient denominator":summary.derived.clickToLeadPercent+"%"}</p>
     <p>Cost/lead: {summary.derived.spendMicrosPerLead??"Unknown"} micro currency units</p>
     <p>Pending reviews: {summary.pendingReviewCount}</p>
     <small>Scientific verification and multi-touch attribution are not established.</small>
    </div>}
   </div>
   <div>
    <h4 style={{margin:"0 0 10px"}}>Import source observation</h4>
    <label>Metric<select style={field} value={metricKey} onChange={e=>setMetricKey(e.target.value)}>
     {["impressions","clicks","engagements","leads","qualified_leads","spend_micros"].map(k=><option key={k}>{k}</option>)}
    </select></label>
    <label style={{display:"block",marginTop:8}}>Value (nonnegative integer)<input style={field} inputMode="numeric" value={value} onChange={e=>setValue(e.target.value)}/></label>
    <label style={{display:"block",marginTop:8}}>Source record ID<input style={field} value={sourceRecordId} onChange={e=>setSourceRecordId(e.target.value)} placeholder="export-20261118-row-5"/></label>
    <label style={{display:"block",marginTop:8}}>Evidence reference<input style={field} value={sourceReference} onChange={e=>setSourceReference(e.target.value)} placeholder="internal:approved-analytics-export"/></label>
    <button style={{...button,marginTop:10}} disabled={busy||!campaignId||!/^\d+$/.test(value)||!sourceRecordId.trim()||!sourceReference.trim()}
     onClick={()=>act(async()=>{
      await call("performance/ingest",{campaignId,metricKey,value:Number(value),sourceSystem:"MANUAL_EXPORT",sourceRecordId:sourceRecordId.trim(),
       sourceReference:sourceReference.trim(),observedAt:new Date().toISOString()});
      setNotice("Observation quarantined for independent review.");await refresh();
     })}>Submit evidence for review</button>
   </div>
   <div>
    <h4 style={{margin:"0 0 10px"}}>Independent performance review</h4>
    <label>Pending observation<select style={field} value={reviewId} onChange={e=>setReviewId(e.target.value)}>
     <option value="">Choose quarantined source</option>{observations.filter(x=>x.status==="QUARANTINED").map(x=>
      <option key={x.id} value={x.id}>{x.metricKey}={x.value} · {x.campaignId.slice(0,9)} · {x.submittedBy.slice(0,9)}</option>)}
    </select></label>
    <label style={{display:"block",marginTop:8}}>Evidence review rationale<textarea style={field} value={rationale} onChange={e=>setRationale(e.target.value)} rows={3}/></label>
    <button style={{...button,marginTop:10}} disabled={busy||!reviewId||rationale.trim().length<12}
     onClick={()=>act(async()=>{
      await call("performance/review",{observationId:reviewId,rationale:rationale.trim()});
      setNotice("Independent human review recorded. No external analytics claims verified.");setReviewId("");setRationale("");await refresh();
     })}>Review performance evidence</button>
   </div>
  </div>}
  {error&&<p role="alert" style={{color:"#991b1b",marginTop:10}}>{error}</p>}
  {notice&&<p role="status" style={{color:"#166534",marginTop:10}}>{notice}</p>}
 </div>;
}
