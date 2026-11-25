"use client";
import {useState} from "react";
import {emailSimulationCsv,saveOfflineCsv,type EmailTrialExport}
 from "../lib/offline-evidence-csv";

type Identity={organizationId:string;userId:string;role:string};
type Contact={contactId:string;syntheticRecipientRef:string;
 latestSimulatedConsent:string;effectiveSyntheticEligibility?:string;syntheticOnly:true};
type EmailResult=EmailTrialExport&{simulationId:string;audienceDigest:string};
const btn={background:"#124d83",color:"white",border:0,borderRadius:8,
 padding:"10px 14px",fontWeight:650,cursor:"pointer"} as const;
const field={padding:"8px",border:"1px solid #cbd5e1",borderRadius:7,
 width:"100%",boxSizing:"border-box" as const,marginTop:5};
const safeRole=(identity:Identity|null)=>!!identity&&
 ["ADMIN","SUPER_ADMIN"].includes(identity.role.toUpperCase());
export default function SyntheticEmailStudio({identity}:{identity:Identity|null}){
 const [brandId,setBrandId]=useState("");
 const [campaignId,setCampaignId]=useState("");
 const [contacts,setContacts]=useState<Contact[]>([]);
 const [selected,setSelected]=useState<string[]>([]);
 const [selectedContact,setSelectedContact]=useState("");
 const [action,setAction]=useState("SIMULATED_OPT_IN");
 const [consentKey,setConsentKey]=useState("");
 const [mailKey,setMailKey]=useState("");
 const [content,setContent]=useState("Controlled mock email campaign. No real recipients.");
 const [scenario,setScenario]=useState("ACCEPTED");
 const [journeyEnabled,setJourneyEnabled]=useState(false);
 const [journeyJson,setJourneyJson]=useState(JSON.stringify({
  timeZone:"Africa/Cairo",startAt:"2026-11-21T08:00:00Z",
  quietHours:{start:"21:00",end:"08:00"},
  dailyCap:1,rolling7DayCap:3,
  steps:[{key:"welcome",delayMinutes:0,scenario:"ACCEPTED"},
   {key:"follow_up",delayMinutes:1440,scenario:"DELAYED_WEBHOOK"}]
 },null,2));
 const [result,setResult]=useState<EmailResult|null>(null);
 const [error,setError]=useState("");
 const [busy,setBusy]=useState(false);
 async function call(path:string,body?:unknown){
  const response=await fetch("/api/marketing/"+path,{
   method:body===undefined?"GET":"POST",
   credentials:"same-origin",cache:"no-store",
   ...(body===undefined?{}:{headers:{"content-type":"application/json"},
    body:JSON.stringify(body)})
  });
  const output:unknown=await response.json();
  if(!response.ok){
   const message=output&&typeof output==="object"&&"message" in output?
    String((output as {message:unknown}).message):"Request was rejected";
   throw new Error(message);
  }
  return output;
 }
 async function run(fn:()=>Promise<void>){
  setBusy(true);setError("");
  try{await fn();}catch(e){setError(e instanceof Error?e.message:"Request failed");}
  finally{setBusy(false);}
 }
 async function refresh(){
  const value=await call("audience/synthetic-contacts?brandId="+encodeURIComponent(brandId));
  setContacts(value as Contact[]);
 }
 const enabled=safeRole(identity);
 return <details aria-label="R2 synthetic audience consent and email simulation"
  style={{marginTop:20,padding:22,border:"1px solid #dbe4ed",
   borderRadius:14,background:"white"}}>
  <summary style={{cursor:"pointer",fontWeight:750,color:"#124d83",fontSize:21}}>
   R2 · Audience, Consent & Email Simulation
  </summary>
  <p style={{fontSize:13,color:"#475569"}}>
   Test permissioned audience snapshots, withdrawals, complaints and email
   eligibility without live contacts, mailboxes or ESP credentials.
   All recipients are synthetic references; <strong>zero messages are sent.</strong>
   These simulated opt-ins are not legal proof of consent.
  </p>
  {!enabled?<p>Verified tenant ADMIN access is required for the synthetic lab.</p>:<>
  {error&&<p role="alert" style={{fontSize:13,color:"#b91c1c"}}>{error}</p>}
  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",
   gap:12}}>
   <label style={{fontSize:13}}>Tenant Brand ID
    <input value={brandId} onChange={e=>{
     setBrandId(e.target.value);setContacts([]);setSelected([]);
     setResult(null);setMailKey("");
    }} style={field} placeholder="Existing active brand ID"/></label>
   <label style={{fontSize:13}}>Human-approved Campaign ID
    <input value={campaignId} onChange={e=>{
     setCampaignId(e.target.value);setResult(null);setMailKey("");
    }} style={field} placeholder="Existing approved campaign ID"/></label>
  </div>
  <div style={{display:"flex",gap:10,marginTop:12,flexWrap:"wrap"}}>
   <button style={btn} disabled={busy||!brandId.trim()} onClick={()=>void run(async()=>{
    await call("audience/synthetic-contacts",{brandId});
    await refresh();
   })}>Create synthetic recipient</button>
   <button style={{...btn,background:"#475569"}} disabled={busy||!brandId.trim()}
    onClick={()=>void run(refresh)}>Refresh synthetic audience</button>
  </div>
  <p style={{fontSize:12,color:"#64748b"}}>
   Synthetic contacts available: {contacts.length}. No recipient email addresses are stored.
  </p>
  {contacts.length>0&&<>
   <label style={{fontSize:13}}>Recipient for mock consent
    <select style={field} value={selectedContact} onChange={e=>{
     setSelectedContact(e.target.value);setConsentKey("");
    }}>
     <option value="">Select synthetic contact</option>
     {contacts.map(c=><option key={c.contactId} value={c.contactId}>
      {c.contactId.slice(0,12)} — {c.effectiveSyntheticEligibility??c.latestSimulatedConsent}</option>)}
    </select>
   </label>
   <label style={{fontSize:13}}>Mock consent event
    <select style={field} value={action} onChange={e=>{
     setAction(e.target.value);setConsentKey("");
    }}>
     <option value="SIMULATED_OPT_IN">Simulated opt-in</option>
     <option value="SIMULATED_WITHDRAWAL">Simulated withdrawal</option>
     <option value="SIMULATED_COMPLAINT">Simulated complaint (irreversible)</option>
     <option value="SIMULATED_HARD_BOUNCE">Simulated hard bounce (irreversible)</option>
    </select>
   </label>
   <button style={{...btn,marginTop:10}}
    disabled={busy||!selectedContact}
    onClick={()=>void run(async()=>{
     const requestKey=consentKey||crypto.randomUUID();
     if(!consentKey)setConsentKey(requestKey);
     await call("audience/synthetic-contacts/"+
      encodeURIComponent(selectedContact)+"/consent",{action,requestKey});
     await refresh();
    })}>Record mock consent event · No real opt-in</button>
   <fieldset style={{marginTop:14,border:"1px solid #e2e8f0",borderRadius:8}}>
    <legend style={{fontSize:13,fontWeight:650}}>Synthetic campaign audience</legend>
    {contacts.map(c=><label key={c.contactId} style={{display:"block",
     fontSize:12,margin:"6px 0"}}>
     <input type="checkbox" checked={selected.includes(c.contactId)}
      onChange={e=>{
       const next=e.target.checked?[...selected,c.contactId]:
        selected.filter(id=>id!==c.contactId);
       setSelected(next);setMailKey("");setResult(null);
      }}/>
     {" "}{c.contactId.slice(0,14)} · {c.effectiveSyntheticEligibility??c.latestSimulatedConsent}
    </label>)}
   </fieldset>
  </>}
  <label style={{display:"block",marginTop:12,fontSize:13}}>
   Draft email text (simulation only)
   <textarea value={content} onChange={e=>{
    setContent(e.target.value);setMailKey("");setResult(null);
   }} style={{...field,minHeight:86}}/>
  </label>
  <div style={{marginTop:12,display:"grid",gap:10}}>
   <label style={{fontSize:13}}>Synthetic ESP outcome
    <select style={field} value={scenario} onChange={e=>{
     setScenario(e.target.value);setMailKey("");setResult(null);
    }}>
     {["ACCEPTED","BOUNCED","COMPLAINT","RATE_LIMITED","ESP_5XX",
       "TIMEOUT_AFTER_ACCEPT","DUPLICATE_CALLBACK","UNSUBSCRIBE_BEFORE_SEND",
       "DELAYED_WEBHOOK","TEMPLATE_REJECTED","TOKEN_EXPIRED",
       "READBACK_MISMATCH"].map(x=><option key={x} value={x}>{x}</option>)}
    </select>
   </label>
   <label style={{fontSize:13}}>
    <input type="checkbox" checked={journeyEnabled} onChange={e=>{
     setJourneyEnabled(e.target.checked);setMailKey("");setResult(null);
    }}/> Simulate multi-step quiet hours, DST and frequency caps
   </label>
   {journeyEnabled&&<label style={{fontSize:13}}>Virtual journey definition (JSON)
    <textarea style={{...field,minHeight:190,fontFamily:"monospace"}}
     value={journeyJson} onChange={e=>{
      setJourneyJson(e.target.value);setMailKey("");setResult(null);
     }}/>
   </label>}
  </div>
  <button style={{...btn,marginTop:12}}
   disabled={busy||!campaignId.trim()||!brandId.trim()||
    selected.length===0||!content.trim()}
   onClick={()=>void run(async()=>{
    const message=await crypto.subtle.digest("SHA-256",
     new TextEncoder().encode(content));
    const hex=Array.from(new Uint8Array(message))
     .map(v=>v.toString(16).padStart(2,"0")).join("");
    const requestKey=mailKey||crypto.randomUUID();
    if(!mailKey)setMailKey(requestKey);
    const r=await call("email/simulations",{
     brandId,campaignId,contactIds:selected,
     contentDigest:"sha256:"+hex,requestKey,scenario,
     ...(journeyEnabled?{journey:JSON.parse(journeyJson)}:{})
    });
    setResult(r as EmailResult);
   })}>Simulate consent-gated email journey · No send</button>
  {result&&<section style={{marginTop:14,padding:12,background:"#f8fafc",
   borderRadius:9,fontSize:13}}>
   <p><strong>{result.status}</strong> · Audience: {result.results.syntheticRecipients} ·
    Synthetic eligible: {result.results.syntheticEligible}</p>
   <p>Withdrawn: {result.results.withdrawn} ·
    Complaint-suppressed: {result.results.complaintSuppressed} ·
    Hard-bounce suppressed: {result.results.hardBounceSuppressed??0} ·
    Missing opt-in: {result.results.missingConsent}</p>
   <p>Actual emails sent: <strong>0</strong> · Verified external receipts: <strong>0</strong></p>
   <button type="button" style={{...btn,background:"#475569",marginTop:8}}
    disabled={busy||!enabled}
    onClick={()=>{
     try{saveOfflineCsv(emailSimulationCsv(result),
      "medsol-email-simulation-evidence.csv");setError("");}
     catch(e){setError(e instanceof Error?e.message:"Synthetic email export denied");}
    }}>Export synthetic email evidence (unsigned CSV)</button>
   {result.results.syntheticJourneyPlan&&<details open>
    <summary>Virtual journey schedule · Fresh consent required at execution</summary>
    <table style={{width:"100%",fontSize:12,marginTop:8}}>
     <thead><tr><th align="left">Step</th><th align="left">Scheduled UTC</th>
      <th align="left">Virtual scenario</th><th align="left">Unknown outcomes</th></tr></thead>
     <tbody>{result.results.syntheticJourneyPlan.steps.map(step=>
      <tr key={step.key}><td>{step.key}</td><td>{step.scheduledAt}</td>
       <td>{step.scenario}</td><td>{step.virtualOutcomeUnknown}</td></tr>)}</tbody>
    </table>
   </details>}
   <p style={{fontSize:11,color:"#475569"}}>Immutable synthetic snapshot:
    {" "}{result.audienceDigest}</p>
  </section>}
  </>}
 </details>;
}
