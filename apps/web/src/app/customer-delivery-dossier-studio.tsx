"use client";
import {useEffect,useRef,useState} from "react";
import {dossierCsv,dossierPillarCsv,DOSSIER_PILLARS,validateDossierForExport,
 type DeliveryDossier,type DossierPillar} from "../lib/customer-delivery-dossier-export";
import {OFFLINE_CAMPAIGN_STAGE_ORDER} from "@medsol/contracts";
import CustomerActivationReviewStudio from "./customer-activation-review-studio";

type Identity={organizationId:string;userId:string;role:string};
type Campaign={id:string;code:string;name:string;brandId:string|null};
const btn={padding:"9px 13px",borderRadius:8,background:"#124d83",
 color:"#fff",border:0,fontWeight:650 as const,cursor:"pointer"};
const canAudit=(identity:Identity|null)=>!!identity&&
 ["SUPER_ADMIN","ADMIN","MARKETING_DIRECTOR","CMO"].includes(identity.role.toUpperCase());
async function get(path:string,signal?:AbortSignal){
 const response=await fetch("/api/marketing/"+path,{
  method:"GET",credentials:"same-origin",cache:"no-store",
  ...(signal?{signal}:{})});
 let value:unknown;
 try{value=await response.json();}catch{throw Error("Invalid API response; retry the inspection");}
 if(!response.ok){
  const m=value&&typeof value==="object"&&"message" in value?
   (value as {message:unknown}).message:null;
  throw Error(typeof m==="string"?m:"Dossier unavailable ("+response.status+")");
 }
 return value;
}
function save(content:string,filename:string,type:string){
 const url=URL.createObjectURL(new Blob([content],{type}));
 const link=document.createElement("a");
 link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}
/** One read-only customer delivery inspection, never a second workflow owner. */
export default function CustomerDeliveryDossierStudio({identity}:{identity:Identity|null}){
 const [campaigns,setCampaigns]=useState<Campaign[]>([]);
 const [campaignId,setCampaignId]=useState("");
 const [dossier,setDossier]=useState<DeliveryDossier|null>(null);
 const [error,setError]=useState(""),[busy,setBusy]=useState(false);
 const serial=useRef(0);
 const key=identity?identity.organizationId+":"+identity.userId:"signed-out";
 useEffect(()=>{
  const controller=new AbortController();
  serial.current++;setCampaigns([]);setCampaignId("");setDossier(null);
  setError("");setBusy(false);
  if(!canAudit(identity))return()=>controller.abort();
  void get("campaigns",controller.signal).then(result=>{
   if(controller.signal.aborted)return;
   if(!Array.isArray(result)||result.length>100)throw Error("Campaign listing invalid");
   setCampaigns((result as Campaign[]).filter(x=>!!x.brandId));
  }).catch(e=>{
   if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Campaigns unavailable");
  });
  return()=>{controller.abort();serial.current++;};
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[key]);
 async function refreshCampaigns(){
  if(!canAudit(identity)||busy)return;
  const current=++serial.current;setBusy(true);setError("");
  try{
   const result=await get("campaigns");
   if(!Array.isArray(result)||result.length>100)throw Error("Campaign listing invalid");
   if(current===serial.current)setCampaigns((result as Campaign[]).filter(x=>!!x.brandId));
  }catch(e){
   if(current===serial.current)setError(e instanceof Error?e.message:"Campaigns unavailable");
  }finally{if(current===serial.current)setBusy(false);}
 }
 async function inspect(){
  if(!identity||!canAudit(identity)||!campaignId||busy)return;
  const current=++serial.current;
  setBusy(true);setError("");setDossier(null);
  try{
   const result=await get("journeys/"+encodeURIComponent(campaignId)+"/dossier");
   const verified=validateDossierForExport(result as DeliveryDossier);
   if(verified.campaign.id!==campaignId||
      verified.organizationId!==identity.organizationId)
    throw Error("Campaign or tenant changed during inspection");
   if(current===serial.current)setDossier(verified);
  }catch(e){
   if(current===serial.current)setError(e instanceof Error?e.message:"Dossier unavailable");
  }finally{if(current===serial.current)setBusy(false);}
 }
 function exportFile(format:"json"|"csv",pillar?:DossierPillar){
  if(!dossier)return;
  try{
   const d=validateDossierForExport(dossier);
   const name="medsol-offline-campaign-dossier-"+d.campaign.id;
   if(format==="json")save(JSON.stringify(d,null,2)+"\n",name+".json","application/json");
   else save(pillar?dossierPillarCsv(d,pillar):dossierCsv(d),
    name+(pillar?"-"+pillar:"")+".csv","text/csv;charset=utf-8");
  }catch(e){setError(e instanceof Error?e.message:"Export blocked");}
 }
 const p=dossier?.pillars;
 const sections=p?[
  {name:"Creative",state:p.creative.status,details:
   p.creative.currentLinkedRightsAndApprovalReviewed+" reviewed linked revision(s); "+
   p.creative.brandScopedDraftRevisions+" brand-scoped draft(s)"},
  {name:"Social",state:p.social.status,details:
   p.social.sandboxSimulated+" sandbox execution(s); 0 real posts"},
  {name:"Email",state:p.email.status,details:
   p.email.syntheticSimulations+" synthetic journey(s); 0 real emails"},
  {name:"Market intelligence",state:"REVIEWED_TENANT_SIGNALS_ONLY",details:
   p.intelligence.tenantWideReviewedSignals+" reviewed tenant signals, not campaign attribution"},
  {name:"Conversion",state:"SOURCE_REVIEWED_NOT_CRM_VERIFIED",details:
   (p.conversion.reviewedLeadCount??"unknown")+" leads / "+
   (p.conversion.reviewedQualifiedLeadCount??"unknown")+" qualified, not CRM-verified"},
  {name:"Commercial analytics",state:p.commercial.sourceStatus,details:
   p.commercial.pendingReviewCount+" quarantined observations; ROI not verified"}
 ]:[];
 return <section id="delivery-dossier" aria-label="Customer delivery evidence dossier"
  style={{marginTop:20,background:"#fff",border:"1px solid #dbe4ed",
   borderRadius:14,padding:22,scrollMarginTop:120}}>
  <h2 style={{margin:"0 0 10px",color:"#124d83",fontSize:21}}>
   Customer delivery dossier · Six-engine inspection
  </h2>
  <p style={{fontSize:13,color:"#475569"}}>
   One tenant-scoped, read-only report across existing creative, social, email,
   market intelligence, conversion and commercial owners. This is an
   <strong> unsigned offline operator inspection</strong>, not proof of real
   publishing, verified revenue or production certification.
  </p>
  {!canAudit(identity)?<p>Verified campaign-audit role required to inspect this report.</p>:<>
   {error&&<p role="alert" style={{color:"#b91c1c"}}>{error}</p>}
   <div style={{display:"flex",flexWrap:"wrap",alignItems:"end",gap:12}}>
    <label style={{fontSize:13,flex:"1 1 260px"}}>Brand-bound campaign
     <select aria-label="Dossier campaign" value={campaignId}
      onChange={e=>{serial.current++;setCampaignId(e.target.value);
       setDossier(null);setError("");setBusy(false);}}
      style={{display:"block",width:"100%",padding:9,marginTop:5,borderRadius:7,
       border:"1px solid #cbd5e1"}}>
      <option value="">Select campaign</option>
      {campaigns.map(c=><option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
     </select>
    </label>
    <button type="button" style={{...btn,background:"#475569"}} disabled={busy}
     onClick={()=>void refreshCampaigns()}>Refresh campaign list</button>
    <button type="button" style={btn} disabled={!campaignId||busy}
     onClick={()=>void inspect()}>{busy?"Inspecting…":"Inspect all six engines"}</button>
    <button type="button" style={{...btn,background:"#475569"}} disabled={!dossier}
     onClick={()=>exportFile("json")}>Export unsigned JSON</button>
    <button type="button" style={{...btn,background:"#475569"}} disabled={!dossier}
     onClick={()=>exportFile("csv")}>Export unsigned CSV</button>
   </div>
   {campaignId&&identity&&campaigns.find(c=>c.id===campaignId)?.brandId&&["ADMIN","SUPER_ADMIN"].includes(identity.role.toUpperCase())&&<CustomerActivationReviewStudio key={key+":"+campaignId} campaignId={campaignId} brandId={campaigns.find(c=>c.id===campaignId)!.brandId!}/>}
   {dossier&&<div role="group" aria-label="Export each customer engine evidence" style={{
    display:"flex",gap:8,flexWrap:"wrap",marginTop:12}}>
    {DOSSIER_PILLARS.map(pillar=><button key={pillar} type="button" style={{
      ...btn,background:"#475569",fontSize:12}} onClick={()=>exportFile("csv",pillar)}>
      Export {pillar} evidence CSV
    </button>)}
   </div>}
   {dossier&&p&&<div style={{marginTop:16}}>
    <p role="status" style={{fontWeight:650}}>
     {dossier.campaign.name} · {dossier.offlineGatesMet}/{dossier.offlineGatesTotal}
     {" "}offline gates met · {dossier.productionStatus}
    </p>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:10}}>
     {sections.map(s=><div key={s.name} style={{padding:12,border:"1px solid #e2e8f0",
      borderRadius:9,background:"#f8fafc"}}>
      <strong>{s.name}</strong>
      <div style={{fontSize:12,marginTop:5}}>{s.details}</div>
      <div style={{fontSize:11,color:"#64748b",marginTop:5}}>{s.state.replaceAll("_"," ")}</div>
     </div>)}
    </div>
    {p.conversion.syntheticLedger&&<section aria-label="Historical synthetic conversion ledger evidence" style={{border:"1px solid #cbd5e1",borderRadius:8,padding:12,marginTop:12,fontSize:12}}>
     <strong>Persistent internal conversion and qualification evidence</strong>
     {p.conversion.syntheticLedger.counts?<><p>{p.conversion.syntheticLedger.counts.forms} form revisions · {p.conversion.syntheticLedger.counts.approvedFormDecisions} historical approved decisions</p>
      <p>{p.conversion.syntheticLedger.counts.submissions} synthetic submissions: {p.conversion.syntheticLedger.counts.mockAccepted} mock accepted, {p.conversion.syntheticLedger.counts.mockRejected} mock rejected, {p.conversion.syntheticLedger.counts.outcomeUnknown} unknown.</p>
      <p>{p.conversion.syntheticLedger.counts.protocolRecorded} stored mock protocol records · {p.conversion.syntheticLedger.counts.qualificationReviews} qualification reviews · {p.conversion.syntheticLedger.counts.independentInternalQualificationApprovals} independent internal approvals.</p></>:
      <p>Window capped; counts unavailable to prevent incomplete evidence being presented as totals.</p>}
     <p>Zero real leads and CRM writes. Historical records do not establish current consent. Separate owner snapshots are not atomic.</p>
    </section>}
    {p.commercial.combinedCommercial&&<section aria-label="Reported same-record commercial cohorts" style={{border:"1px solid #cbd5e1",borderRadius:8,padding:12,marginTop:12,fontSize:12}}>
     <strong>Combined commercial evidence · reported values only</strong>
     <p>{p.commercial.combinedCommercial.status.replaceAll("_"," ")} · {p.commercial.combinedCommercial.matchedGroups} matched / {p.commercial.combinedCommercial.excludedGroups} excluded groups</p>
     {p.commercial.combinedCommercial.currencies.map(c=><div key={c.currency} style={{borderTop:"1px solid #e2e8f0",paddingTop:8}}>
      <strong>{c.currency}</strong> · {c.qualifiedLeads} reported qualified leads · spend {c.reportedSpendMicros} micro-units · revenue {c.reportedRevenueMicros} micro-units · reported revenue/spend {c.reportedRevenueToSpendRatio??"unavailable"} · cost/qualified lead {c.spendMicrosPerQualifiedLead??"unavailable"} micro-units
     </div>)}
     <p>No verified revenue, ROI, causal attribution, or currency conversion. Amounts are expressed in millionths of the named currency.</p>
    </section>}
    <h3 style={{fontSize:16,marginTop:18}}>Offline gates requiring work</h3>
    {dossier.missingOfflineGates.length?
     <ol>{dossier.missingOfflineGates.map(x=>{
      const stage=OFFLINE_CAMPAIGN_STAGE_ORDER.find(([key])=>key===x);
      return <li key={x} style={{padding:"5px 0"}}>
       <strong>{stage?.[1]??x}</strong>{" · "}
       {stage?<a href={"#"+stage[2]}>Open {stage[2]} workspace</a>:null}
      </li>;
     })}</ol>:
     <p>All offline simulation gates met; independent release gates still remain.</p>}
    <details style={{marginTop:12}}><summary>Evidence warnings and market context</summary>
     <p style={{fontSize:12}}>Market signals are tenant-wide, not linked to this campaign.</p>
     <ul>{p.intelligence.tenantWideReviewedTopics.map((x,i)=><li key={i}>
      {x.sector}: {x.topic} ({x.evidenceCount} reviewed signals, {x.distinctSourceHosts} hosts)
     </li>)}</ul>
     <ul>{p.commercial.evidenceWarnings.map(x=><li key={x}>{x.replaceAll("_"," ")}</li>)}</ul>
     <ul>{dossier.limitations.map(x=><li key={x}>{x}</li>)}</ul>
    </details>
   </div>}
  </>}
 </section>;
}
