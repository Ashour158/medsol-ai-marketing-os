"use client";
import {useState} from "react";
import {discussionTriageCsv,saveOfflineCsv,type DiscussionTriageExport}
 from "../lib/offline-evidence-csv";

type Identity={organizationId:string;userId:string;role:string}|null;
const field={padding:"9px 11px",borderRadius:8,border:"1px solid #cbd5e1",
 background:"#fff",width:"100%",boxSizing:"border-box" as const};
const btn={padding:"9px 13px",border:0,borderRadius:8,
 background:"#124d83",color:"white",cursor:"pointer"};
const operator=(identity:Identity)=>!!identity&&
 ["SUPER_ADMIN","ADMIN","CMO","MARKETING_DIRECTOR","MARKETING_MANAGER",
  "MARKETING_SPECIALIST"].includes(identity.role.toUpperCase());
export default function SocialDiscussionTriageLab({identity}:{identity:Identity}){
 const [discussionId,setDiscussionId]=useState("");
 const [text,setText]=useState("");
 const [status,setStatus]=useState<"OPEN"|"ANSWERED"|"CLOSED">("OPEN");
 const [moderation,setModeration]=useState<"NORMAL"|"SPAM">("NORMAL");
 const [result,setResult]=useState<DiscussionTriageExport|null>(null);
 const [error,setError]=useState("");
 const [busy,setBusy]=useState(false);
 const allowed=operator(identity);
 const clear=()=>{setResult(null);setError("");};
 async function preview(){
  if(!identity||!allowed)return;
  setBusy(true);clear();
  try{
   const response=await fetch("/api/marketing/social/discussions/triage-preview",{
    method:"POST",credentials:"same-origin",cache:"no-store",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({discussionId,text,status,moderation})
   });
   const raw:unknown=await response.json();
   if(!response.ok){
    const info=raw&&typeof raw==="object"&&"message" in raw?
     (raw as {message:unknown}).message:"Discussion preview rejected";
    throw Error(typeof info==="string"?info:"Discussion preview rejected");
   }
   const value=raw as DiscussionTriageExport;
   // The exported metadata validation is the same safeguard as the visible report.
   discussionTriageCsv(value);
   if(value.discussionId!==discussionId)throw Error("Discussion identity changed");
   setResult(value);setText("");
  }catch(e){setError(e instanceof Error?e.message:"Discussion preview denied");}
  finally{setBusy(false);}
 }
 if(!identity)return null;
 return <section aria-label="Human-governed social discussion and crisis triage"
  style={{border:"1px solid #cbd5e1",borderRadius:10,marginTop:20,padding:16}}>
  <h3 style={{margin:"0 0 5px"}}>Social Community & Crisis · Offline Human Triage</h3>
  <p style={{fontSize:12,color:"#475569"}}>
   The original social agent classifies a manually entered synthetic discussion
   and flags scientific, privacy or regulatory risks. No social retrieval,
   real customer message, automated reply, public post or inbox record is created.
   Do not enter personal or sensitive customer information.
  </p>
  {!allowed?<p>Authorized marketing operator role required.</p>:<>
   <label style={{display:"block",fontSize:12}}>Synthetic discussion ID
    <input style={field} value={discussionId} maxLength={128}
     placeholder="mock-conversation-001"
     onChange={e=>{setDiscussionId(e.target.value);clear();}}/>
   </label>
   <label style={{display:"block",fontSize:12,marginTop:10}}>Sanitized mock discussion text
    <textarea style={{...field,minHeight:85}} value={text} maxLength={4000}
     placeholder="Example: Could you explain the product documentation?"
     onChange={e=>{setText(e.target.value);clear();}}/>
   </label>
   <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:10}}>
    <label style={{fontSize:12}}>Mock status
     <select style={field} value={status} onChange={e=>{
      setStatus(e.target.value as typeof status);clear();}}>
      <option>OPEN</option><option>ANSWERED</option><option>CLOSED</option>
     </select></label>
    <label style={{fontSize:12}}>Mock moderation
     <select style={field} value={moderation} onChange={e=>{
      setModeration(e.target.value as typeof moderation);clear();}}>
      <option>NORMAL</option><option>SPAM</option>
     </select></label>
   </div>
   <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:12}}>
    <button type="button" style={btn} disabled={busy||!discussionId||!text.trim()}
     onClick={()=>void preview()}>Review synthetic discussion · No reply</button>
    <button type="button" style={{...btn,background:"#475569"}}
     disabled={busy||!result} onClick={()=>{
      if(!result)return;
      try{saveOfflineCsv(discussionTriageCsv(result),
       "medsol-social-human-triage.csv");setError("");}
      catch(e){setError(e instanceof Error?e.message:"Triage export rejected");}
     }}>Export anonymized triage CSV</button>
   </div>
   {error&&<p role="alert" style={{color:"#991b1b"}}>{error}</p>}
   {result&&<div role="status" style={{marginTop:12,fontSize:12}}>
    <strong>{result.disposition.replaceAll("_"," ")}</strong>
    <p>Human escalation: {result.escalations.length?
     result.escalations.join(", ").replaceAll("_"," "):"None required by this rule set"}</p>
    <p>Rationale: {result.reasons.join("; ").replaceAll("_"," ")}</p>
    <p style={{color:"#92400e"}}>Human approval always required. No automatic reply,
     provider request, actual engagement or crisis action occurred. NOT CERTIFIED.</p>
   </div>}
  </>}
 </section>;
}
