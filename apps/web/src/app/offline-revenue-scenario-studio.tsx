"use client";
import {useState} from "react";
import {modelOfflineRevenueScenarios,type RevenueScenarioInput} from "../lib/offline-revenue-scenarios";
import {revenueScenarioCsv,saveOfflineCsv} from "../lib/offline-evidence-csv";

/**
 * Hypothesis workspace over the EXISTING reviewed performance read model.
 * No CRM deal creation, attribution, model call, provider write, or finance
 * posting. Financial assumptions never overwrite authoritative source totals.
 */
export default function OfflineRevenueScenarioStudio({summary}:{
 summary:{campaign:{id:string;name:string};status:string;totals:Record<string,string>};
}){
 const [currency,setCurrency]=useState("");
 const [dealValue,setDealValue]=useState("");
 const [closePercent,setClosePercent]=useState("10");
 const [marginPercent,setMarginPercent]=useState("35");
 const [result,setResult]=useState<ReturnType<typeof modelOfflineRevenueScenarios>|null>(null);
 const [exportInput,setExportInput]=useState<RevenueScenarioInput|null>(null);
 const [error,setError]=useState("");
 const qualified=summary.totals.qualified_leads;
 const ready=summary.status==="REVIEWED_SOURCE_EVIDENCE"&&
  typeof qualified==="string";
 const field={width:"100%",padding:8,boxSizing:"border-box" as const,
  background:"#fff",border:"1px solid #cbd5e1",borderRadius:7,marginTop:5};
 const change=(setter:(s:string)=>void)=>(s:string)=>{
  setter(s);setResult(null);setExportInput(null);setError("");
 };
 const formatMoney=(v:string)=>BigInt(v).toLocaleString("en-US");
 const formatDeals=(v:string)=>{
  const n=BigInt(v);return (n/100n).toLocaleString("en-US")+"."+
   (n%100n).toString().padStart(2,"0");
 };
 function run(){
  try{
   if(!ready)throw Error("Independently reviewed qualified-lead observations are required");
   if(!/^\d{1,3}$/.test(closePercent)||!/^\d{1,3}$/.test(marginPercent))
    throw Error("Use whole-number percentage assumptions between 0 and 100");
   const close=Number(closePercent),margin=Number(marginPercent);
   const assumptions:RevenueScenarioInput={
    reviewedQualifiedLeads:qualified!,
    sourceStatus:"REVIEWED_SOURCE_EVIDENCE",
    currency:currency.trim().toUpperCase(),
    assumedDealValueMajor:dealValue.trim(),
    closeRateBasisPoints:close*100,marginBasisPoints:margin*100
   };
   const output=modelOfflineRevenueScenarios(assumptions);
   setResult(output);setExportInput(assumptions);setError("");
  }catch(e){setResult(null);setExportInput(null);
   setError(e instanceof Error?e.message:"Scenario invalid");}
 }
 return <section aria-label="Offline revenue scenario workbench" style={{
  marginTop:18,border:"1px solid #cbd5e1",padding:14,borderRadius:10,
  background:"#fff"}}>
  <h4 style={{margin:"0 0 8px"}}>Conversion & Revenue · Offline scenario workbench</h4>
  <p style={{fontSize:12,color:"#475569"}}>
   Input baseline: <strong>{ready?qualified:"No reviewed qualified leads"}</strong> source-reviewed
   qualified leads for {summary.campaign.name}.
   Model hypothetical close rates, contract values and margin without contacting
   a model, CRM, finance system or publishing provider.
  </p>
  <p style={{fontSize:12,color:"#92400e"}}>
   Neither campaign revenue, deal closure, currency consistency, ROI nor causal
   attribution has been independently verified. No spend-based ROI is calculated.
  </p>
  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",
   gap:10,marginTop:12}}>
   <label style={{fontSize:12}}>Assumed currency (3 letters)
    <input aria-label="Scenario currency" style={field} value={currency} maxLength={3}
     onChange={e=>change(setCurrency)(e.target.value)} placeholder="EGP, USD, ..."/></label>
   <label style={{fontSize:12}}>Assumed average deal value (integer)
    <input aria-label="Scenario average deal value" style={field} value={dealValue}
     inputMode="numeric" onChange={e=>change(setDealValue)(e.target.value)}/></label>
   <label style={{fontSize:12}}>Base close rate (%)
    <input aria-label="Scenario close rate" style={field} value={closePercent}
     inputMode="numeric" onChange={e=>change(setClosePercent)(e.target.value)}/></label>
   <label style={{fontSize:12}}>Gross margin assumption (%)
    <input aria-label="Scenario margin" style={field} value={marginPercent}
     inputMode="numeric" onChange={e=>change(setMarginPercent)(e.target.value)}/></label>
  </div>
  <button style={{background:"#124d83",color:"#fff",border:0,borderRadius:7,
   padding:"9px 13px",marginTop:12,cursor:"pointer"}} disabled={!ready}
   onClick={run}>Calculate illustrative scenarios (no writes)</button>
  {error&&<p role="alert" style={{color:"#b91c1c"}}>{error}</p>}
  {result&&<div style={{overflowX:"auto",marginTop:12}}>
   <table aria-label="Hypothetical conversion scenarios" style={{
    borderCollapse:"collapse",width:"100%",fontSize:12}}>
    <thead><tr><th align="left">Case</th><th>Assumed close rate</th>
     <th>Modeled wins</th><th>Illustrative gross revenue ({result.currency})</th>
     <th>Illustrative gross contribution ({result.currency})</th></tr></thead>
    <tbody>{result.scenarios.map(x=><tr key={x.name}>
     <td style={{borderTop:"1px solid #e2e8f0",padding:7}}>{x.name}</td>
     <td style={{borderTop:"1px solid #e2e8f0",padding:7,textAlign:"right"}}>
      {(x.closeRateBasisPoints/100).toFixed(2)}%</td>
     <td style={{borderTop:"1px solid #e2e8f0",padding:7,textAlign:"right"}}>
      {formatDeals(x.expectedWinsHundredths)}</td>
     <td style={{borderTop:"1px solid #e2e8f0",padding:7,textAlign:"right"}}>
      {formatMoney(x.illustrativeGrossRevenueMajor)}</td>
     <td style={{borderTop:"1px solid #e2e8f0",padding:7,textAlign:"right"}}>
      {formatMoney(x.illustrativeGrossContributionMajor)}</td>
    </tr>)}</tbody>
   </table>
   <button type="button" disabled={!exportInput}
    style={{marginTop:12,padding:"9px 13px",borderRadius:7,border:0,
     background:"#475569",color:"white",cursor:"pointer"}}
    onClick={()=>{
     if(!exportInput||!result)return;
     try{saveOfflineCsv(revenueScenarioCsv(exportInput,result,summary.campaign.id),
      "medsol-hypothetical-revenue-scenarios.csv");setError("");}
     catch(e){setError(e instanceof Error?e.message:"Scenario export blocked");}
    }}>Export hypothetical scenarios (unsigned CSV)</button>
   <p style={{fontSize:12,color:"#475569"}}>
    Downside = half the assumed base close rate; upside = 1.5× (capped at 100%).
    Figures are transparent deterministic arithmetic, not audited predictions.
   </p>
  </div>}
 </section>;
}
