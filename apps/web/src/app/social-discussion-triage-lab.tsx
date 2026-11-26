"use client";
import {useState} from "react";
import {discussionTriageCsv,saveOfflineCsv,type DiscussionTriageExport}
 from "../lib/offline-evidence-csv";

type Identity={organizationId:string;userId:string;role:string}|null;
type CommunityCase={caseId:string;brandId:string;discussionId:string;disposition:string;
 escalations:string[];priority:string;status:string;version:number;createdBy:string;
 assignedTo:string|null;closedBy:string|null;specialistApprovalVerified:false;
 reviewRound:number|null;slaDueAt:string|null;slaEscalatedAt:string|null;slaOverdue:boolean;slaWorkerConfigured:boolean;internalSpecialistReviewComplete:boolean;specialistReviews:{escalation:string;approvalId:string|null;decision:string}[];
 externalEffectsAuthorized:false;externalResolutionVerified:false;syntheticOnly:true};
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
 const [brandId,setBrandId]=useState("");
 const [queue,setQueue]=useState<{scope:string;cases:CommunityCase[];windowCapped:boolean}|null>(null);
 const [caseNotice,setCaseNotice]=useState("");
 const scope=identity?JSON.stringify([identity.organizationId,identity.userId,brandId]):"";
 const currentQueue=queue?.scope===scope?queue:null;
 const manager=!!identity&&["SUPER_ADMIN","ADMIN","CMO","MARKETING_DIRECTOR"].includes(identity.role.toUpperCase());
 async function caseRequest(path:string,body?:unknown){
  const response=await fetch("/api/marketing/social/cases"+path,{
   method:body===undefined?"GET":"POST",credentials:"same-origin",cache:"no-store",
   ...(body===undefined?{}:{headers:{"content-type":"application/json"},body:JSON.stringify(body)})
  });
  const value=await response.json();
  if(!response.ok)throw Error(typeof value.message==="string"?value.message:"Community case request rejected");
  return value;
 }
 async function refreshQueue(){
  const r=await caseRequest("?brandId="+encodeURIComponent(brandId)) as {cases:CommunityCase[];windowCapped:boolean;externalEffectsAuthorized:false};
  if(r.externalEffectsAuthorized!==false||!Array.isArray(r.cases)||r.cases.some(x=>x.brandId!==brandId||
    x.syntheticOnly!==true||x.externalEffectsAuthorized!==false||x.externalResolutionVerified!==false||
    x.specialistApprovalVerified!==false||!Array.isArray(x.specialistReviews)||typeof x.internalSpecialistReviewComplete!=="boolean"))throw Error("Invalid synthetic case scope");
  setQueue({scope,cases:r.cases,windowCapped:r.windowCapped});
 }
 async function runCase(task:()=>Promise<void>){
  setBusy(true);setError("");setCaseNotice("");
  try{await task();}catch(e){setError(e instanceof Error?e.message:"Community action rejected");}
  finally{setBusy(false);}
 }
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
   real customer message, automated reply or public post is created. The durable case queue below stores only synthetic triage metadata.
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
   <section aria-label="Durable synthetic community cases" style={{border:"1px solid #cbd5e1",padding:12,borderRadius:8,marginTop:16}}>
    <h4 style={{marginTop:0}}>Community case queue · Internal review only</h4>
    <p style={{fontSize:12}}>Use a fixture-prefixed synthetic discussion ID (for example fixture-community-001), an active tenant brand ID and mock text above. Raw discussion text is not persisted in the case or audit. Internal closure never certifies a scientific review or a real reply.</p>
    <label style={{fontSize:12,display:"block"}}>Community case brand ID
     <input style={field} value={brandId} onChange={e=>{setBrandId(e.target.value);setQueue(null);setCaseNotice("");setError("");}}/>
    </label>
    <div style={{display:"flex",gap:8,marginTop:8,flexWrap:"wrap"}}>
     <button type="button" style={btn} disabled={busy||!brandId.trim()||!/^fixture-[A-Za-z0-9_-]{8,100}$/.test(discussionId)||!text.trim()}
      onClick={()=>void runCase(async()=>{
       const r=await caseRequest("",{brandId,discussionId,text,moderation});
       if(r.syntheticOnly!==true||r.externalEffectsAuthorized!==false)throw Error("Unexpected case provenance");
       setText("");setResult(null);setCaseNotice(r.replayed?"Existing case replayed":"Synthetic case created");
       await refreshQueue();
      })}>Create durable synthetic case</button>
     <button type="button" style={{...btn,background:"#475569"}} disabled={busy||!brandId.trim()}
      onClick={()=>void runCase(refreshQueue)}>Refresh community case queue</button>
    </div>
    {caseNotice&&<p role="status">{caseNotice}</p>}
    {currentQueue&&<>
     <p style={{fontSize:12}}>{currentQueue.cases.length} cases · {currentQueue.windowCapped?"First 100 shown":"Current bounded queue"}</p>
     {currentQueue.cases.map(row=><article key={row.caseId} style={{borderTop:"1px solid #e2e8f0",padding:"10px 0",fontSize:12}}>
      <strong>{row.discussionId} · {row.priority} · {row.status}</strong>
      <p>Version {row.version} · {row.assignedTo===identity.userId?"Assigned to you":row.assignedTo?"Assigned":"Unassigned"} · {row.escalations.join(", ")||"No rule-based escalation"}</p>
      <p>Internal SLA: {row.slaDueAt?new Date(row.slaDueAt).toISOString():"Legacy case · reopen to start deadline"}
       {" · "}{row.slaEscalatedAt?"Escalated to internal queue":row.slaOverdue?"Overdue":row.status==="RESOLVED_INTERNAL"?"Closed":"Within review window"}
       {" · "}{row.slaWorkerConfigured?"Worker configured":"Automatic escalation not configured"}</p>
      {row.specialistReviews.length>0&&<div style={{margin:"8px 0"}}>
       <strong>Independent internal review round {row.reviewRound}</strong>
       {row.specialistReviews.map(review=><div key={review.escalation} style={{padding:"5px 0"}}>
        {review.escalation} · {review.decision}
        {manager&&row.status==="PENDING_REVIEW"&&row.createdBy!==identity.userId&&row.assignedTo!==identity.userId&&review.approvalId&&review.decision==="PENDING"&&
         <button type="button" style={{...btn,marginLeft:8}} disabled={busy} onClick={()=>void runCase(async()=>{
          const response=await fetch("/api/marketing/approvals/decide",{method:"POST",credentials:"same-origin",cache:"no-store",
           headers:{"content-type":"application/json"},body:JSON.stringify({organizationId:identity.organizationId,
            commandId:crypto.randomUUID(),correlationId:crypto.randomUUID(),approvalId:review.approvalId,
            approverUserId:identity.userId,decision:"APPROVED",rationale:"Independent internal synthetic community risk review; no professional credential assertion"})});
          const data=await response.json();if(!response.ok)throw Error(typeof data.message==="string"?data.message:"Review rejected");
          await refreshQueue();setCaseNotice("Independent internal review recorded: "+review.escalation);
         })}>Approve {review.escalation} (internal only)</button>}
       </div>)}
       <small>Internal risk review only. No specialist professional credentials or external resolution verified.</small>
      </div>}
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
       {([
        ["CLAIM","Claim case",row.status==="OPEN"&&!row.assignedTo],
        ["SUBMIT_REVIEW","Submit internal review",row.status==="OPEN"&&row.assignedTo===identity.userId],
        ["CLOSE_INTERNAL","Close internally",manager&&row.status==="PENDING_REVIEW"&&row.createdBy!==identity.userId&&row.assignedTo!==identity.userId&&(row.escalations.length===0||row.internalSpecialistReviewComplete)],
        ["REOPEN","Reopen case",manager&&["PENDING_REVIEW","RESOLVED_INTERNAL"].includes(row.status)]
       ] as const).filter(x=>x[2]).map(([action,label])=><button key={action} type="button" style={btn} disabled={busy}
        onClick={()=>void runCase(async()=>{
         await caseRequest("/"+encodeURIComponent(row.caseId)+"/transition",{action,expectedVersion:row.version});
         setCaseNotice("Internal case updated: "+action);await refreshQueue();
        })}>{label}</button>)}
      </div>
     </article>)}
    </>}
   </section>
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
