"use client";
import {useState} from "react";
import type {combinedReviewedCommercial} from "@medsol/contracts";
import {reviewedCommercialEvidenceCsv,saveOfflineCsv,type CommercialEvidenceManifest} from "../lib/offline-evidence-csv";
import OfflineRevenueScenarioStudio from "./offline-revenue-scenario-studio";
import SyntheticConversionLab from "./synthetic-conversion-lab";
import SyntheticExperimentStudio from "./synthetic-experiment-studio";
import SyntheticPricingStudio from "./synthetic-pricing-studio";
type Campaign={id:string;name:string;code:string};
type Observation={id:string;campaignId:string;metricKey:string;value:string;status:string;sourceReference:string;submittedBy:string};
type MonetarySummary={status:string;matchedGroups:number;incompleteGroups:number;currencyConflictGroups:number;unknownCurrencyRows:number;currencies:{currency:string;matchedGroups:number;reportedSpendMicros:string;reportedRevenueMicros:string;grossProfitMatchedGroups:number;reportedGrossProfitMicros:string|null}[]};
type PerformanceSummary={combinedCommercialReconciliation?:ReturnType<typeof combinedReviewedCommercial>;organizationId:string;evidenceManifest?:CommercialEvidenceManifest;monetaryReconciliation?:MonetarySummary;status:string;campaign:{id:string;name:string};totals:Record<string,string>;
 derived:{ctrPercent:number|null;clickToLeadPercent:number|null;spendMicrosPerLead:string|null;
 leadQualificationPercent:number|null;spendMicrosPerQualifiedLead:string|null};
 warnings:string[];cohortAligned:false;roiValidated:false;revenueVerified:false;
 spendCurrencyVerified:false;pendingReviewCount:number;independentlyVerified:boolean;
 attributionValidated:boolean;
 sourceRecordReconciliation?:{status:string;matchedGroups:number;incompleteGroups:number;
 inconsistentGroups:number;excludedNonFunnelRows:number;
 matchedTotals:{impressions:string;clicks:string;leads:string;qualifiedLeads:string}|null;
 rates:{ctrPercent:number|null;clickToLeadPercent:number|null;leadQualificationPercent:number|null};
 attributionValidated:false;roiValidated:false;revenueVerified:false;spendCurrencyVerified:false;
 independentVerification:false}};
export default function PerformanceConsole({enabled}:{enabled:boolean}){
 const [campaigns,setCampaigns]=useState<Campaign[]>([]);
 const [campaignId,setCampaignId]=useState("");
 const [summary,setSummary]=useState<PerformanceSummary|null>(null);
 const [observations,setObservations]=useState<Observation[]>([]);
 const [metricKey,setMetricKey]=useState("impressions");
 const [value,setValue]=useState("");
 const [currency,setCurrency]=useState("");
 const [sourceRecordId,setSourceRecordId]=useState("");
 const [sourceReference,setSourceReference]=useState("");
 const [observedAt,setObservedAt]=useState("");
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
 return <div id="performance" style={{border:"1px solid #dbe4ed",borderRadius:12,padding:18,marginTop:16,background:"#f8fafc",scrollMarginTop:110}}>
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
     <p>Lead qualification: {summary.derived.leadQualificationPercent===null?
       "Insufficient or inconsistent reviewed funnel":summary.derived.leadQualificationPercent+"%"}</p>
     <p>Cost/qualified lead: {summary.derived.spendMicrosPerQualifiedLead??"Unknown"} micro currency units</p>
     <p>Pending reviews: {summary.pendingReviewCount}</p>
     {summary.warnings.length>0&&<div role="note" style={{
      background:"#f8fafc",border:"1px solid #e2e8f0",
      borderRadius:7,padding:9,fontSize:12}}>
      <strong>Evidence quality restrictions</strong>
      <ul>{summary.warnings.map(w=><li key={w}>{w.replaceAll("_"," ")}</li>)}</ul>
     </div>}
     {summary.sourceRecordReconciliation&&<section aria-label="Matched source record reconciliation"
      style={{margin:"12px 0",padding:10,border:"1px solid #cbd5e1",borderRadius:7,background:"#fff"}}>
      <strong>Exact source-record reconciliation</strong>
      <p>{summary.sourceRecordReconciliation.status.replaceAll("_"," ")}</p>
      <p>Matched groups: {summary.sourceRecordReconciliation.matchedGroups} ·
       Incomplete: {summary.sourceRecordReconciliation.incompleteGroups} ·
       Contradictory: {summary.sourceRecordReconciliation.inconsistentGroups}</p>
      {summary.sourceRecordReconciliation.matchedTotals&&<>
       <p>Matched impressions: {summary.sourceRecordReconciliation.matchedTotals.impressions} ·
        clicks: {summary.sourceRecordReconciliation.matchedTotals.clicks} ·
        leads: {summary.sourceRecordReconciliation.matchedTotals.leads} ·
        qualified: {summary.sourceRecordReconciliation.matchedTotals.qualifiedLeads}</p>
       <p>Matched CTR: {summary.sourceRecordReconciliation.rates.ctrPercent??"N/A"} ·
        click-to-lead: {summary.sourceRecordReconciliation.rates.clickToLeadPercent??"N/A"} ·
        qualification: {summary.sourceRecordReconciliation.rates.leadQualificationPercent??"N/A"} (%)</p>
      </>}
      <small>Exact record matching is not independent cohort verification. No currency,
       causal attribution, revenue or ROI is certified.</small>
     </section>}
     {summary.monetaryReconciliation&&<section aria-label="Reviewed monetary source reconciliation" style={{margin:"12px 0",padding:10,border:"1px solid #cbd5e1",borderRadius:7,background:"#fff"}}>
      <strong>Currency-separated reported monetary evidence</strong>
      <p>{summary.monetaryReconciliation.status.replaceAll("_"," ")} · matched {summary.monetaryReconciliation.matchedGroups} · incomplete {summary.monetaryReconciliation.incompleteGroups} · currency conflicts {summary.monetaryReconciliation.currencyConflictGroups}</p>
      <p>Unknown-currency rows: {summary.monetaryReconciliation.unknownCurrencyRows}</p>
      {summary.monetaryReconciliation.currencies.map(row=><div key={row.currency} style={{borderTop:"1px solid #e2e8f0",padding:"8px 0"}}>
       <strong>{row.currency} · {row.matchedGroups} matched source groups</strong>
       <p>Reported spend: {row.reportedSpendMicros} · reported revenue: {row.reportedRevenueMicros} micro units</p>
       <p>Reported gross profit: {row.reportedGrossProfitMicros??"Not supplied"} micro units ({row.grossProfitMatchedGroups} groups)</p>
      </div>)}
      <small>Human-reviewed source reports only. No cross-currency total, FX, finance verification, attributed revenue or verified ROI.</small>
     </section>}
     {summary.combinedCommercialReconciliation&&<section aria-label="Combined commercial source-record reconciliation" style={{margin:"12px 0",padding:10,border:"1px solid #cbd5e1",borderRadius:7,background:"#fff"}}>
      <strong>Source-matched funnel and reported returns</strong>
      <p>{summary.combinedCommercialReconciliation.status.replaceAll("_"," ")} · {summary.combinedCommercialReconciliation.matchedGroups} complete groups · {summary.combinedCommercialReconciliation.excludedGroups} excluded · {summary.combinedCommercialReconciliation.invalidGrossProfitGroups} invalid gross profit</p>
      {summary.combinedCommercialReconciliation.currencies.map(row=><div key={row.currency} style={{borderTop:"1px solid #e2e8f0",padding:"8px 0"}}>
       <strong>{row.currency} · {row.matchedGroups} complete source records</strong>
       <p>Impressions {row.impressions} · clicks {row.clicks} · leads {row.leads} · qualified {row.qualifiedLeads}</p>
       <p>Reported spend {row.reportedSpendMicros} · revenue {row.reportedRevenueMicros} · gross profit {row.reportedGrossProfitMicros??"Incomplete evidence"} (micro units)</p>
       <p>Spend per lead {row.spendMicrosPerLead??"Undefined"} · per qualified lead {row.spendMicrosPerQualifiedLead??"Undefined"} (micro units)</p>
       <p>Reported revenue / spend {row.reportedRevenueToSpendRatio??"Undefined"} ×</p>
      </div>)}
      <small>Same-record, same-currency evidence only. Ratios are truncated to four decimals; unit costs to whole micro units. No causal attribution, actual ROI, FX or finance certification.</small>
     </section>}
     {summary.evidenceManifest&&<div style={{marginTop:12}}>
      <p>Reviewed evidence rows: {summary.evidenceManifest.rowCount??"Bound exceeded"} · unsigned source fingerprint only</p>
      <button type="button" style={button} disabled={busy||!enabled||summary.evidenceManifest.status!=="BOUNDED_REVIEWED_SOURCE_MANIFEST"} onClick={()=>void act(async()=>{
       const fresh=await call("performance/campaigns/"+encodeURIComponent(campaignId)) as PerformanceSummary;
       if(fresh.organizationId!==summary.organizationId||fresh.campaign.id!==campaignId||!fresh.evidenceManifest)
        throw Error("Commercial source scope changed");
       if(fresh.evidenceManifest.sourceDigest!==summary.evidenceManifest?.sourceDigest){
        setSummary(fresh);throw Error("Reviewed evidence changed; review refreshed data before exporting");
       }
       saveOfflineCsv(reviewedCommercialEvidenceCsv({...fresh,evidenceManifest:fresh.evidenceManifest},summary.organizationId,campaignId),
        "medsol-reviewed-commercial-evidence.csv");
       setNotice("Exported current bounded reviewed source evidence; not a verified finance report.");
      })}>Export reviewed commercial evidence (unsigned CSV)</button>
     </div>}
     <small>Rates describe separately reviewed observations; a matched cohort,
      reliable currency, revenue/ROI and multi-touch attribution have not been verified.
      Never treat a modeled return as measured commercial revenue.</small>
    </div>}
    {summary&&<OfflineRevenueScenarioStudio key={summary.campaign.id} summary={summary}/>}
   </div>
   <div>
    <h4 style={{margin:"0 0 10px"}}>Import source observation</h4>
    <label>Metric<select style={field} value={metricKey} onChange={e=>setMetricKey(e.target.value)}>
     {["impressions","clicks","engagements","leads","qualified_leads","spend_micros","reported_revenue_micros","reported_gross_profit_micros"].map(k=><option key={k}>{k}</option>)}
    </select></label>
    {(metricKey==="spend_micros"||metricKey.startsWith("reported_"))&&<label style={{display:"block",marginTop:8}}>Source currency code
     <input style={field} value={currency} maxLength={3} placeholder="USD, EGP, EUR" onChange={e=>setCurrency(e.target.value.toUpperCase())}/>
     <small>Amounts in millionths of the stated currency. Unknown legacy spend is excluded from currency matching.</small>
    </label>}
    <label style={{display:"block",marginTop:8}}>Value (nonnegative integer)<input style={field} inputMode="numeric" value={value} onChange={e=>setValue(e.target.value)}/></label>
    <label style={{display:"block",marginTop:8}}>Source record ID<input style={field} value={sourceRecordId} onChange={e=>setSourceRecordId(e.target.value)} placeholder="export-20261118-row-5"/></label>
    <label style={{display:"block",marginTop:8}}>Evidence reference<input style={field} value={sourceReference} onChange={e=>setSourceReference(e.target.value)} placeholder="internal:approved-analytics-export"/></label>
    <label style={{display:"block",marginTop:8}}>Source observation timestamp (UTC ISO)
     <input style={field} value={observedAt} onChange={e=>setObservedAt(e.target.value)}
      placeholder="2026-11-24T10:00:00.000Z" maxLength={40}/>
    </label>
    <small>Use the original identical source timestamp for each metric of the same record.
     Leave blank for a separate current-time observation.</small>
    <button style={{...button,marginTop:10}} disabled={busy||!campaignId||!/^\d+$/.test(value)||!sourceRecordId.trim()||!sourceReference.trim()}
     onClick={()=>act(async()=>{
      await call("performance/ingest",{campaignId,metricKey,value:Number(value),sourceSystem:"MANUAL_EXPORT",sourceRecordId:sourceRecordId.trim(),
       sourceReference:sourceReference.trim(),observedAt:observedAt.trim()||new Date().toISOString(),
       ...((metricKey==="spend_micros"||metricKey.startsWith("reported_"))&&currency?{currency}: {})});
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
  <SyntheticPricingStudio enabled={enabled}/>
  <SyntheticConversionLab enabled={enabled}/>
  {campaignId&&<SyntheticExperimentStudio key={campaignId} enabled={enabled} campaignId={campaignId}/>}
  {error&&<p role="alert" style={{color:"#991b1b",marginTop:10}}>{error}</p>}
  {notice&&<p role="status" style={{color:"#166534",marginTop:10}}>{notice}</p>}
 </div>;
}
