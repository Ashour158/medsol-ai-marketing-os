"use client";
import {useRef,useState} from "react";
type Identity={organizationId:string;userId:string;role:string};
type Agent={id:string;name:string};
type Row={agentId:string;approvalId:string;decision?:string;status?:string;input:{name:string;slug:string;mission:string;templateAgentId:string};proposedCapability:string;templateRisk:string;executionAuthorized:false;reviewExpiresAt:string};
type Registry={organizationId:string;records:Row[];reviews:Row[];historyCapped:boolean;fixtureOnly:true;executionAuthorized:false;externalEffectsAuthorized:false};
export default function OfflineSpecialistStudio({identity}:{identity:Identity}){
 const [roster,setRoster]=useState<Agent[]>([]),[registry,setRegistry]=useState<Registry|null>(null);
 const [name,setName]=useState(""),[slug,setSlug]=useState(""),[mission,setMission]=useState(""),[template,setTemplate]=useState("");
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [rehearsalAgent,setRehearsalAgent]=useState(""),[objective,setObjective]=useState(""),[market,setMarket]=useState("");
 const [contextQuery,setContextQuery]=useState(""),[missionPlanEnabled,setMissionPlanEnabled]=useState(false);
 const [rehearsalRef,setRehearsalRef]=useState(""),[rehearsalResult,setRehearsalResult]=useState<{executionId:string;status:string;replayed:boolean;missionPlan?:{alignmentSignal:string;evidenceStatus:string;sharedTerms:string[];tasks:{kind:string;description:string}[]}}|null>(null);
 const lock=useRef(false),key=useRef(""),rehearsalKey=useRef("");
 async function api(path:string,body?:unknown){
  const r=await fetch("/api/marketing/agents"+path,{method:body===undefined?"GET":"POST",cache:"no-store",credentials:"same-origin",...(body===undefined?{}:{headers:{"content-type":"application/json"},body:JSON.stringify(body)})});
  const data=await r.json();if(!r.ok)throw Error(typeof data.message==="string"?data.message:"Specialist operation denied");return data;
 }
 async function refresh(){
  const v=await api("/specialists") as Registry;
  if(v.organizationId!==identity.organizationId||v.fixtureOnly!==true||v.executionAuthorized!==false||v.externalEffectsAuthorized!==false||!Array.isArray(v.records)||!Array.isArray(v.reviews))throw Error("Invalid offline registry");
  setRegistry(v);
 }
 async function run(fn:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);setError("");setNotice("");try{await fn();}catch(e){setError(e instanceof Error?e.message:"Specialist operation failed");}finally{lock.current=false;setBusy(false);}}
 if(!["ADMIN","SUPER_ADMIN"].includes(identity.role.toUpperCase()))return null;
 return <section className="alpha-card" aria-label="Specialist identity registry" style={{marginTop:16}}>
  <h3>Specialist identity registry</h3><p>Define a specialist mission based on a canonical engine. A different tenant administrator must approve registration. Registered identities remain paused with no executable capabilities, models, tools or memory writes.</p>
  <button type="button" disabled={busy} onClick={()=>void run(async()=>{setRoster(await api(""));await refresh();})}>Load specialist registry</button>
  {registry&&<><div className="alpha-grid">
   <label>Specialist name<input disabled={busy} maxLength={80} value={name} onChange={e=>{setName(e.target.value);key.current="";}}/></label>
   <label>Specialist slug<input disabled={busy} maxLength={64} value={slug} onChange={e=>{setSlug(e.target.value);key.current="";}} placeholder="scientific-reviewer"/></label>
   <label>Specialist template<select disabled={busy} value={template} onChange={e=>{setTemplate(e.target.value);key.current="";}}><option value="">Choose canonical template</option>{roster.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
   <label>Specialist mission<textarea disabled={busy} maxLength={500} value={mission} onChange={e=>{setMission(e.target.value);key.current="";}}/></label>
   <button type="button" disabled={busy||!template||name.trim().length<3||! /^[a-z][a-z0-9-]{2,63}$/.test(slug)||mission.trim().length<12} onClick={()=>void run(async()=>{
    const requestKey=key.current||"fixture-"+crypto.randomUUID();key.current=requestKey;
    const v=await api("/specialists",{requestKey,name,slug,mission,templateAgentId:template,fixtureOnly:true});
    if(v.executionAuthorized!==false||v.externalEffectsAuthorized!==false||v.memoryWritesAuthorized!==false)throw Error("Unexpected specialist authority");
    await refresh();setNotice("Registration review "+v.approvalId+" · "+v.decision+". Use the existing Approval inbox with a different administrator.");
   })}>Request independent specialist registration</button>
  </div><h4>Registered paused identities ({registry.records.length})</h4>
  {registry.records.map(row=><article key={row.agentId}><strong>{row.input.name}</strong> · {row.status}<p>{row.agentId} · template {row.input.templateAgentId} · risk {row.templateRisk}</p><p>{row.input.mission}</p></article>)}
  <h4>Independently reviewed specialist rehearsal</h4>
  <p>One approved fixture assessment through the canonical template. This does not activate the specialist, change permissions or approve its output. Do not enter confidential or real customer data.</p>
  <div className="alpha-grid">
   <label>Rehearsal specialist<select value={rehearsalAgent} disabled={busy} onChange={e=>{setRehearsalAgent(e.target.value);rehearsalKey.current="";setRehearsalResult(null);}}><option value="">Choose paused specialist</option>{registry.records.map(row=><option key={row.agentId} value={row.agentId}>{row.input.name}</option>)}</select></label>
   <label>Fixture assessment objective<textarea maxLength={500} value={objective} disabled={busy} onChange={e=>{setObjective(e.target.value);rehearsalKey.current="";setRehearsalResult(null);}}/></label>
   <label>Fixture assessment market<input maxLength={100} value={market} disabled={busy} onChange={e=>{setMarket(e.target.value);rehearsalKey.current="";setRehearsalResult(null);}}/></label>
   <label>Optional reviewed specialist context query<input maxLength={200} value={contextQuery} disabled={busy} onChange={e=>{setContextQuery(e.target.value);rehearsalKey.current="";setRehearsalResult(null);}}/></label>
   <label><input type="checkbox" checked={missionPlanEnabled} disabled={busy} onChange={e=>{setMissionPlanEnabled(e.target.checked);rehearsalKey.current="";setRehearsalResult(null);}}/> Include mission-specific offline planning (review required)</label>
   <p className="alpha-subtle">If supplied, the exact source and memory citations must remain eligible at approval and execution. The engine receives references only, not raw knowledge text.</p>
   <button type="button" disabled={busy||!rehearsalAgent||objective.trim().length<12||market.trim().length<2||(!!contextQuery&&contextQuery.trim().length<3)} onClick={()=>void run(async()=>{
    const requestKey=rehearsalKey.current||"fixture-"+crypto.randomUUID();rehearsalKey.current=requestKey;
    const v=await api("/specialists/rehearse",{agentId:rehearsalAgent,requestKey,objective,market,fixtureOnly:true,...(missionPlanEnabled?{brainMode:"MISSION_PLAN_V1"}:{}),...(contextQuery.trim()?{contextQuery:contextQuery.trim()}:{})});
    if(v.fixtureOnly!==true||v.externalEffectsAuthorized!==false||v.autonomousExecutionAuthorized!==false)throw Error("Unexpected rehearsal authority");
    setRehearsalRef(v.approvalId);setRehearsalResult(null);setNotice("Exact rehearsal review "+v.approvalId+" · "+v.decision+(v.contextPin?" · "+v.contextPin.references.length+" pinned evidence references":"")+". A different administrator must approve through the Approval inbox.");
   })}>Request exact specialist rehearsal review</button>
   <label>Approved specialist rehearsal reference<input value={rehearsalRef} disabled={busy} onChange={e=>{setRehearsalRef(e.target.value);setRehearsalResult(null);}}/></label>
   <button type="button" disabled={busy||!/^specialist-run-[0-9a-f]{64}$/.test(rehearsalRef)} onClick={()=>void run(async()=>{
    const v=await api("/specialists/execute-rehearsal",{approvalId:rehearsalRef,fixtureOnly:true});
    if(v.externalEffectsAuthorized!==false||!["COMPLETED","BLOCKED"].includes(v.status)||typeof v.executionId!=="string")throw Error("Invalid rehearsal result");
    setRehearsalResult({executionId:v.executionId,status:v.status,replayed:v.replayed===true,...(v.decision?.missionPlan?{missionPlan:v.decision.missionPlan}:{})});
   })}>Execute approved specialist rehearsal</button>
  </div>
  {rehearsalResult&&<div role="status"><strong>{rehearsalResult.status}</strong> · {rehearsalResult.replayed?"Historical receipt (no new execution)":"Draft recorded in AgentExecution"}<p style={{overflowWrap:"anywhere"}}>Execution reference: {rehearsalResult.executionId}</p>{rehearsalResult.missionPlan&&<div><h5>Mission planning draft</h5><p>{rehearsalResult.missionPlan.alignmentSignal} · {rehearsalResult.missionPlan.evidenceStatus}</p><p>Shared terms: {rehearsalResult.missionPlan.sharedTerms.join(", ")||"None"}</p><ol>{rehearsalResult.missionPlan.tasks.map(task=><li key={task.kind}>{task.description}</li>)}</ol></div>}<p>Output still requires review. No live provider, model or tool call.</p></div>}
  <h4>Registration reviews</h4>{registry.historyCapped&&<p>Showing latest 100 reviews.</p>}
  {registry.reviews.map(row=><div key={row.approvalId} style={{overflowWrap:"anywhere"}}>{row.input.name} · {row.decision} · {row.approvalId}</div>)}</>}
  {notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error}</p>}
 </section>;
}
