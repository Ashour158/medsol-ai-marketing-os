"use client";
import {useState} from "react";
import {modelOfflineConversionFunnel,modelOfflineCrmHandoff,type OfflineHandoffInput,type OfflineConversionFailure,
 type OfflineConversionInput} from "../lib/offline-revenue-scenarios";
import {conversionFunnelCsv,crmHandoffRehearsalCsv,saveOfflineCsv} from "../lib/offline-evidence-csv";

type FormRevision={formId:string;campaignId:string;brandId:string;headline:string;cta:string;
 approvalId:string;approvalDecision:string;contentDigest:string;publicFormHosted:false;syntheticOnly:true};
type Submission={submissionId:string;formId:string;contactId:string;outcome:string;
 externalEffectsAuthorized:false;crmHandoffsExecuted:0};
const field={padding:"9px 11px",border:"1px solid #cbd5e1",borderRadius:8,
 background:"#fff",width:"100%",boxSizing:"border-box" as const};
const btn={padding:"9px 13px",background:"#124d83",color:"white",
 border:0,borderRadius:8,cursor:"pointer",fontWeight:650 as const};
const failureCases:OfflineConversionFailure[]=[
 "NONE","MOCK_CONSENT_DENIED","DUPLICATE_ATTEMPT","BOT_REJECTED","RATE_LIMITED"
];
/**
 * Not a lead form endpoint. This is intentionally an in-memory operator
 * rehearsal: no real browser visits, CRM contacts, opt-in or external events.
 */
export default function SyntheticConversionLab({enabled}:{enabled:boolean}){
 const [headline,setHeadline]=useState("Evidence-led research consultation");
 const [cta,setCta]=useState("Request scientific information");
 const [visits,setVisits]=useState("100");
 const [clicks,setClicks]=useState("20");
 const [forms,setForms]=useState("8");
 const [qualified,setQualified]=useState("3");
 const [failure,setFailure]=useState<OfflineConversionFailure>("NONE");
 const [snapshot,setSnapshot]=useState<{
  input:OfflineConversionInput;
  result:ReturnType<typeof modelOfflineConversionFunnel>;
 }|null>(null);
 const [mockConsent,setMockConsent]=useState<OfflineHandoffInput["mockConsent"]>("DENIED");
 const [mockDedupe,setMockDedupe]=useState<OfflineHandoffInput["mockDedupe"]>("UNIQUE");
 const [mockTransport,setMockTransport]=useState<OfflineHandoffInput["mockTransport"]>("ACCEPTED");
 const [mockKey,setMockKey]=useState("synthetic-request-001");
 const [handoff,setHandoff]=useState<{input:OfflineHandoffInput;
  result:ReturnType<typeof modelOfflineCrmHandoff>}|null>(null);
 const [error,setError]=useState("");
 const [durableCampaign,setDurableCampaign]=useState("");
 const [durableBrand,setDurableBrand]=useState("");
 const [formKey,setFormKey]=useState("");
 const [formRows,setFormRows]=useState<FormRevision[]>([]);
 const [submissionRows,setSubmissionRows]=useState<Submission[]>([]);
 const [formSelected,setFormSelected]=useState("");
 const [contactId,setContactId]=useState("");
 const [purpose,setPurpose]=useState(false);
 const [transport,setTransport]=useState("ACCEPTED");
 const [submissionKey,setSubmissionKey]=useState("");
 const [durableBusy,setDurableBusy]=useState(false);
 const [durableError,setDurableError]=useState("");
 const [durableNotice,setDurableNotice]=useState("");
 const currentForm=formRows.find(x=>x.formId===formSelected);
 async function durableCall(path:string,body?:unknown){
  const response=await fetch("/api/marketing/performance/forms"+path,{
   method:body===undefined?"GET":"POST",credentials:"same-origin",cache:"no-store",
   ...(body===undefined?{}:{headers:{"content-type":"application/json"},body:JSON.stringify(body)})});
  const result=await response.json();
  if(!response.ok)throw Error(typeof result.message==="string"?result.message:"Internal form request denied");
  return result;
 }
 async function refreshForms(){
  const result=await durableCall("?campaignId="+encodeURIComponent(durableCampaign));
  if(result.externalEffectsAuthorized!==false||!Array.isArray(result.forms)||!Array.isArray(result.submissions)||
    result.forms.some((x:FormRevision)=>x.campaignId!==durableCampaign||x.publicFormHosted!==false)||
    result.submissions.some((x:Submission)=>x.externalEffectsAuthorized!==false||x.crmHandoffsExecuted!==0))
   throw Error("Unexpected conversion evidence provenance");
  setFormRows(result.forms);setSubmissionRows(result.submissions);
 }
 async function durableAction(fn:()=>Promise<void>){
  setDurableBusy(true);setDurableError("");setDurableNotice("");
  try{await fn();}catch(e){setDurableError(e instanceof Error?e.message:"Internal form action rejected");}
  finally{setDurableBusy(false);}
 }
 const invalidated=()=>{setSnapshot(null);setHandoff(null);setError("");};
 const inputs=[["Virtual landing views",visits,setVisits],
  ["Virtual CTA clicks",clicks,setClicks],
  ["Virtual mock form submissions",forms,setForms],
  ["Virtual mock qualified leads",qualified,setQualified]] as const;
 return <section id="conversion-lab" aria-label="Anonymous offline conversion funnel"
  style={{padding:18,background:"#fff",border:"1px solid #cbd5e1",
   borderRadius:12,marginTop:20}}>
  <h3 style={{margin:"0 0 8px"}}>Conversion & Form Preview · Anonymous Offline Lab</h3>
  <p style={{fontSize:12,color:"#475569"}}>
   Preview a local landing-page CTA and rehearse a bounded, anonymous form
   funnel. No landing page is hosted, no personal data is collected,
   no actual leads are created, and no CRM handoff occurs.
  </p>
  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:12}}>
   <label>Mock landing-page headline
    <input style={field} value={headline} disabled={!enabled} maxLength={120}
     onChange={e=>{setHeadline(e.target.value);setFormKey("");invalidated();}}/>
   </label>
   <label>Mock call to action
    <input style={field} value={cta} disabled={!enabled} maxLength={80}
     onChange={e=>{setCta(e.target.value);setFormKey("");invalidated();}}/>
   </label>
  </div>
  <div role="note" style={{margin:"12px 0",padding:12,background:"#f8fafc",
    border:"1px solid #e2e8f0",borderRadius:8}}>
   <strong>{headline||"Example landing-page heading"}</strong>
   <p style={{margin:"6px 0",fontSize:12}}>Internal wireframe only · NOT a public form</p>
   <span style={{...btn,display:"inline-block",background:"#64748b"}}>
    {cta||"Example CTA"}</span>
  </div>
  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:10}}>
   {inputs.map(([label,value,setValue])=><label key={label} style={{fontSize:12}}>
    {label}
    <input inputMode="numeric" style={field} value={value} disabled={!enabled}
     onChange={e=>{setValue(e.target.value);invalidated();}}/>
   </label>)}
  </div>
  <label style={{display:"block",marginTop:12,fontSize:12}}>
   Virtual failure scenario
   <select style={field} value={failure} disabled={!enabled}
    onChange={e=>{setFailure(e.target.value as OfflineConversionFailure);invalidated();}}>
    {failureCases.map(x=><option key={x} value={x}>{x.replaceAll("_"," ")}</option>)}
   </select>
  </label>
  <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:12}}>
   <button type="button" style={btn} disabled={!enabled} onClick={()=>{
    try{
     const input:OfflineConversionInput={virtualVisits:visits,virtualCtaClicks:clicks,
      virtualFormSubmissions:forms,virtualQualifiedLeads:qualified,failureCase:failure};
     const result=modelOfflineConversionFunnel(input);
     setSnapshot({input,result});setError("");
    }catch(e){setSnapshot(null);setError(e instanceof Error?e.message:"Invalid mock funnel");}
   }}>Rehearse synthetic conversion</button>
   <button type="button" style={{...btn,background:"#475569"}}
    disabled={!enabled||!snapshot} onClick={()=>{
     if(!snapshot)return;
     try{saveOfflineCsv(conversionFunnelCsv(snapshot.input,snapshot.result),
      "medsol-synthetic-conversion-funnel.csv");setError("");}
     catch(e){setError(e instanceof Error?e.message:"Conversion export blocked");}
    }}>Export unsigned conversion CSV</button>
  </div>
  <fieldset style={{border:"1px solid #cbd5e1",borderRadius:10,
   marginTop:16,padding:12}} disabled={!enabled||!snapshot}>
   <legend style={{fontWeight:700}}>Anonymous mock CRM handoff · no real contacts</legend>
   <p style={{fontSize:12,color:"#475569"}}>Rehearse consent gates, duplicate attempts and
    uncertain transport before any future CRM integration. Mock consent is never legal proof.</p>
   <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:10}}>
    <label>Virtual consent
     <select style={field} value={mockConsent} onChange={e=>{
      setMockConsent(e.target.value as OfflineHandoffInput["mockConsent"]);setHandoff(null);}}>
      {["DENIED","GRANTED","WITHDRAWN"].map(x=><option key={x}>{x}</option>)}
     </select>
    </label>
    <label>Mock idempotency
     <select style={field} value={mockDedupe} onChange={e=>{
      setMockDedupe(e.target.value as OfflineHandoffInput["mockDedupe"]);setHandoff(null);}}>
      {["UNIQUE","DUPLICATE"].map(x=><option key={x}>{x}</option>)}
     </select>
    </label>
    <label>Virtual transport
     <select style={field} value={mockTransport} onChange={e=>{
      setMockTransport(e.target.value as OfflineHandoffInput["mockTransport"]);setHandoff(null);}}>
      {["ACCEPTED","REJECTED","OUTCOME_UNKNOWN"].map(x=><option key={x}>{x}</option>)}
     </select>
    </label>
    <label>Offline idempotency key
     <input style={field} value={mockKey} maxLength={80} onChange={e=>{
      setMockKey(e.target.value);setHandoff(null);}}/>
    </label>
   </div>
   <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:12}}>
    <button type="button" style={btn} onClick={()=>{
     if(!snapshot)return;
     try{
      const input:OfflineHandoffInput={funnel:snapshot.input,mockConsent,
       mockDedupe,mockTransport,requestKey:mockKey};
      const result=modelOfflineCrmHandoff(input);
      setHandoff({input,result});setError("");
     }catch(e){setHandoff(null);setError(e instanceof Error?e.message:"Mock handoff blocked");}
    }}>Rehearse mock CRM handoff</button>
    <button type="button" style={{...btn,background:"#475569"}}
     disabled={!handoff} onClick={()=>{
      if(!handoff)return;
      try{saveOfflineCsv(crmHandoffRehearsalCsv(handoff.input,handoff.result),
       "medsol-anonymous-crm-handoff.csv");setError("");}
      catch(e){setError(e instanceof Error?e.message:"Mock handoff export blocked");}
     }}>Export mock handoff CSV</button>
   </div>
   {handoff&&<p role="status" style={{fontSize:12}}>
    Handoff rehearsal: <strong>{handoff.result.status}</strong>.
    {handoff.result.blockers.length>0&&" Blockers: "+handoff.result.blockers.join(", ")+ "."}
    {" "}Mock qualified candidates: {handoff.result.mockQualifiedCandidates}.
    Actual CRM records: 0 · Real consent: unverified · External retries: disabled.
   </p>}
  </fieldset>
  <section aria-label="Durable internal conversion forms" style={{border:"1px solid #cbd5e1",borderRadius:8,padding:12,marginTop:16}}>
   <h4>Internal form revision and synthetic submission</h4>
   <p style={{fontSize:12}}>Create a form revision from the headline and CTA above, then have a separate manager decide its pending approval in the existing Approvals console. Submit only an existing same-brand synthetic contact with current mock opt-in. No public form, real contact, external CRM or legal consent is created.</p>
   <label>Approved campaign ID<input style={field} value={durableCampaign} disabled={!enabled||durableBusy}
    onChange={e=>{setDurableCampaign(e.target.value);setFormRows([]);setSubmissionRows([]);setFormSelected("");setFormKey("");setSubmissionKey("");}}/></label>
   <label>Form brand ID<input style={field} value={durableBrand} disabled={!enabled||durableBusy}
    onChange={e=>{setDurableBrand(e.target.value);setFormKey("");}}/></label>
   <div style={{display:"flex",gap:8,margin:"8px 0",flexWrap:"wrap"}}>
    <button type="button" style={btn} disabled={!enabled||durableBusy||!durableCampaign||!durableBrand||!headline.trim()||!cta.trim()} onClick={()=>void durableAction(async()=>{
     const key=formKey||"fixture-"+crypto.randomUUID();if(!formKey)setFormKey(key);
     const form=await durableCall("",{campaignId:durableCampaign,brandId:durableBrand,formKey:key,headline,cta});
     setDurableNotice("Form pending exact review: "+form.approvalId);setFormSelected(form.formId);await refreshForms();
    })}>Propose immutable internal form</button>
    <button type="button" style={{...btn,background:"#475569"}} disabled={!enabled||durableBusy||!durableCampaign} onClick={()=>void durableAction(refreshForms)}>Refresh durable forms and submissions</button>
   </div>
   <label>Existing form revision<select style={field} value={formSelected} disabled={!enabled||durableBusy}
    onChange={e=>{setFormSelected(e.target.value);setSubmissionKey("");}}>
    <option value="">Choose an internal revision</option>{formRows.map(x=><option value={x.formId} key={x.formId}>{x.headline} · {x.approvalDecision}</option>)}
   </select></label>
   {currentForm&&<><p style={{fontSize:12}}>Approval {currentForm.approvalId} · {currentForm.approvalDecision} · {currentForm.contentDigest}</p>
    <label>Synthetic contact ID<input style={field} value={contactId} disabled={!enabled||durableBusy}
     onChange={e=>{setContactId(e.target.value);setSubmissionKey("");}}/></label>
    <label style={{display:"block",fontSize:12,marginTop:8}}><input type="checkbox" checked={purpose} disabled={!enabled||durableBusy}
     onChange={e=>{setPurpose(e.target.checked);setSubmissionKey("");}}/> Explicit simulated CRM purpose only (not legal consent)</label>
    <label>Mock CRM outcome<select style={field} value={transport} disabled={!enabled||durableBusy}
     onChange={e=>{setTransport(e.target.value);setSubmissionKey("");}}>
     {["ACCEPTED","REJECTED","OUTCOME_UNKNOWN"].map(x=><option key={x}>{x}</option>)}
    </select></label>
    <button type="button" style={{...btn,marginTop:8}} disabled={!enabled||durableBusy||!purpose||!contactId||currentForm.approvalDecision!=="APPROVED"}
     onClick={()=>void durableAction(async()=>{
      const key=submissionKey||"fixture-"+crypto.randomUUID();if(!submissionKey)setSubmissionKey(key);
      const result=await durableCall("/"+encodeURIComponent(currentForm.formId)+"/submit",{contactId,requestKey:key,
       formDigest:currentForm.contentDigest,mockCrmPurposeGranted:true,mockTransport:transport});
      if(result.crmHandoffsExecuted!==0||result.externalEffectsAuthorized!==false)throw Error("Unexpected external action");
      setDurableNotice(result.outcome+(result.replayed?" · existing fixture replayed":" · durable synthetic record"));await refreshForms();
     })}>Record synthetic form submission</button>
   </>}
   {durableError&&<p role="alert" style={{color:"#991b1b"}}>{durableError}</p>}
   {durableNotice&&<p style={{fontSize:12}}>{durableNotice}</p>}
   {submissionRows.length>0&&<div><strong>Recorded mock outcomes</strong>{submissionRows.map(x=><p key={x.submissionId} style={{fontSize:12}}>{x.formId.slice(0,12)} · {x.contactId.slice(0,12)} · {x.outcome} · zero actual CRM writes</p>)}</div>}
  </section>
  {error&&<p role="alert" style={{color:"#991b1b"}}>{error}</p>}
  {snapshot&&<div role="status" style={{marginTop:12,fontSize:13}}>
   <strong>{snapshot.result.status.replaceAll("_"," ")}</strong>
   <p>Virtual click rate: {snapshot.result.rates.clickThroughPercent??"N/A"}% ·
    Virtual form completion: {snapshot.result.rates.formCompletionPercent??"N/A"}% ·
    Virtual qualified share: {snapshot.result.rates.qualifiedPercent??"N/A"}% ·
    Virtual visit-to-qualified: {snapshot.result.rates.visitToQualifiedPercent??"N/A"}%</p>
   <p style={{color:"#92400e"}}>Actual visitors: 0 · Actual leads: 0 ·
    CRM handoffs: 0 · Verified legal consent: no · Production: NOT CERTIFIED.</p>
  </div>}
 </section>;
}
