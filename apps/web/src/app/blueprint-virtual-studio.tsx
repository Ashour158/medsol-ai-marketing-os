"use client";
import {useState} from "react";
import {prepareOfflineWorkflowDraft} from "../lib/blueprint-offline-handoff";

const EXAMPLE=JSON.stringify({
 id:"campaign-creative-review",version:1,nodes:[
  {id:"start",type:"TRIGGER"},
  {id:"cmo",type:"AGENT_TASK",agentId:"MKT-CMO-001",maxSeconds:90},
  {id:"parallel",type:"PARALLEL"},
  {id:"copy",type:"AGENT_TASK",agentId:"MKT-CONT-001",maxSeconds:120},
  {id:"creative",type:"AGENT_TASK",agentId:"MKT-CREATIVE-001",maxSeconds:120},
  {id:"join",type:"JOIN"},
  {id:"human",type:"APPROVAL"},
  {id:"schedule",type:"SCHEDULE"},
  {id:"end",type:"END"}
 ],edges:[
  {from:"start",to:"cmo"},{from:"cmo",to:"parallel"},
  {from:"parallel",to:"copy"},{from:"parallel",to:"creative"},
  {from:"copy",to:"join"},{from:"creative",to:"join"},
  {from:"join",to:"human"},{from:"human",to:"schedule"},
  {from:"schedule",to:"end"}
 ]
},null,2);
type Issue={code:string;detail:string;nodeId?:string};
type VirtualStep={order:number;nodeId:string;nodeType:string;kind:string;
 agentId:string|null;predecessors:string[];downstream:string[];
 requiresHumanDecision:boolean};
type Result={status:"SIMULATED"|"BLOCKED";saved:boolean;replayed:boolean;
 workflowExecutionId:string|null;preview:{
 validDraft:boolean;stepCount:number;steps:VirtualStep[];issues:Issue[];
 virtualAgentTasks:number;humanDecisionNodes:number;virtualWaitNodes:number;
 realAgentExecutions:0;actualModelCalls:0;actualMcpCalls:0;
 actualA2aCalls:0;actualDomainWrites:0;providerRequestsMade:0;
 executable:false;deployAuthorized:false;externalEffectsAuthorized:false;
 }};
const button={background:"#124d83",color:"white",border:0,borderRadius:8,
 padding:"10px 16px",cursor:"pointer",fontWeight:650} as const;
export function BlueprintVirtualStudio({onPrepareOfflineWorkflow}:{
 onPrepareOfflineWorkflow?:(json:string)=>void
}){
 const [draft,setDraft]=useState(EXAMPLE);
 const [requestKey,setRequestKey]=useState("");
 const [result,setResult]=useState<Result|null>(null);
 const [error,setError]=useState("");
 const [busy,setBusy]=useState(false);
 const [handoffNotice,setHandoffNotice]=useState("");
 const handleChange=(s:string)=>{setDraft(s);setRequestKey("");setResult(null);setError("");setHandoffNotice("");};
 async function run(){
  setBusy(true);setError("");
  try{
   let data:unknown;
   try{data=JSON.parse(draft);}catch{throw new Error("Please provide valid workflow JSON");}
   const key=requestKey||crypto.randomUUID();
   if(!requestKey)setRequestKey(key);
   const response=await fetch("/api/marketing/architecture/blueprint/simulate",{
    method:"POST",credentials:"same-origin",cache:"no-store",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({draft:data,requestKey:key})
   });
   const parsed:unknown=await response.json();
   if(!response.ok){
    const msg=parsed&&typeof parsed==="object"&&"message" in parsed?
     String((parsed as {message:unknown}).message):
     "Virtual workflow simulation was not authorized";
    throw new Error(msg);
   }
   setResult(parsed as Result);
  }catch(e){setError(e instanceof Error?e.message:"Unable to simulate workflow");}
  finally{setBusy(false);}
 }
 return <section aria-label="R3 Blueprint and Workflow virtual studio"
  style={{marginTop:18,padding:16,border:"1px solid #cbd5e1",
   borderRadius:12,background:"#f8fafc"}}>
  <h4 style={{marginTop:0}}>R3 · Blueprint & Workflow Simulation Studio</h4>
  <p style={{fontSize:13,color:"#475569"}}>
   Author a versioned DAG using canonical agents. Preview execution order,
   parallel handoffs, human approval and schedule boundaries. The plan is
   persisted to the existing workflow ledger, but <strong>nothing is deployed,
   no AI model is called, and no provider is contacted.</strong>
  </p>
  <label style={{display:"block",fontSize:13,fontWeight:600}}>
   Versioned workflow definition (JSON)
   <textarea aria-label="Versioned workflow JSON"
    value={draft} onChange={e=>handleChange(e.target.value)}
    disabled={busy} spellCheck={false}
    style={{display:"block",width:"100%",minHeight:270,fontFamily:"monospace",
     fontSize:12,padding:12,border:"1px solid #cbd5e1",borderRadius:8,
     boxSizing:"border-box",marginTop:8}}/>
  </label>
  <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:10}}>
   <button style={button} disabled={busy} onClick={()=>void run()}>
    {busy?"Validating…":"Simulate blueprint · No execution"}
   </button>
   <button style={{...button,background:"#475569"}} disabled={busy}
    onClick={()=>handleChange(EXAMPLE)}>Load safe example</button>
  </div>
  {error&&<p role="alert" style={{color:"#b91c1c",fontSize:13}}>{error}</p>}
  {handoffNotice&&<p role="status" style={{fontSize:13,color:"#124d83"}}>{handoffNotice}</p>}
  {onPrepareOfflineWorkflow&&result?.status==="SIMULATED"&&
   result.preview.validDraft&&<button type="button" style={{...button,marginTop:10}}
    disabled={busy}
    onClick={()=>{
     try{
      const manifest=prepareOfflineWorkflowDraft(JSON.parse(draft) as unknown);
      onPrepareOfflineWorkflow(JSON.stringify(manifest,null,2));
      setError("");
      setHandoffNotice("Prepared a bounded offline workflow draft in Workflow Studio. It is NOT signed, approved, activated or executable until the canonical server release process authorizes it.");
     }catch(e){setHandoffNotice("");
      setError(e instanceof Error?e.message:"Offline handoff not permitted");}
    }}>
    Prepare for signed offline Workflow Studio
   </button>}
  {result&&<div style={{marginTop:14}}>
   <p role="status" style={{fontSize:13}}>
    Result: <strong>{result.status}</strong> ·
    Durable workflow ID: <strong>{result.workflowExecutionId??"Not saved"}</strong> ·
    Replay: <strong>{result.replayed?"yes":"no"}</strong>
   </p>
   <p style={{color:"#475569",fontSize:12}}>
    Virtual agent tasks: {result.preview.virtualAgentTasks} ·
    Human gates: {result.preview.humanDecisionNodes} ·
    Scheduled/event waits: {result.preview.virtualWaitNodes} ·
    Real model, MCP, A2A and provider calls: <strong>0</strong>.
    External effect permission: <strong>DENIED</strong>.
   </p>
   {result.preview.issues.length>0&&<ul style={{color:"#b91c1c",fontSize:12}}>
    {result.preview.issues.map((issue,i)=><li key={i}>
     {issue.code}: {issue.detail}{issue.nodeId?" ("+issue.nodeId+")":""}
    </li>)}
   </ul>}
   {result.preview.steps.length>0&&<div style={{overflowX:"auto"}}>
    <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
     <thead><tr><th align="left">Order</th><th align="left">Node</th>
      <th align="left">Virtual action</th><th align="left">Prerequisites</th></tr></thead>
     <tbody>{result.preview.steps.map(step=><tr key={step.nodeId}>
      <td style={{padding:"6px 8px",borderTop:"1px solid #cbd5e1"}}>{step.order}</td>
      <td style={{padding:"6px 8px",borderTop:"1px solid #cbd5e1"}}>
       {step.nodeId} · {step.nodeType}</td>
      <td style={{padding:"6px 8px",borderTop:"1px solid #cbd5e1"}}>
       {step.kind.replaceAll("_"," ")}
       {step.agentId?" · "+step.agentId:""}</td>
      <td style={{padding:"6px 8px",borderTop:"1px solid #cbd5e1"}}>
       {step.predecessors.join(", ")||"—"}</td>
     </tr>)}</tbody>
    </table>
   </div>}
  </div>}
 </section>;
}
