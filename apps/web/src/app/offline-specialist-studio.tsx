"use client";
import {useRef,useState} from "react";
type Identity={organizationId:string;userId:string;role:string};
type Agent={id:string;name:string};
type Configuration={version:number;mission:string;evidenceRequired:boolean;maxObjectiveChars:number;reviewSkills?:string[]};
type Row={configuration?:Configuration|null;agentId:string;approvalId:string;decision?:string;status?:string;input:{name:string;slug:string;mission:string;templateAgentId:string};proposedCapability:string;templateRisk:string;executionAuthorized:false;reviewExpiresAt:string};
type Registry={organizationId:string;records:Row[];reviews:Row[];historyCapped:boolean;configurations?:{approvalId:string;decision:string;version:number;input:{agentId:string;mission:string}}[];configurationHistoryCapped?:boolean;retirements?:{approvalId:string;decision:string;input:{agentId:string;reason:string}}[];retirementHistoryCapped?:boolean;fixtureOnly:true;executionAuthorized:false;externalEffectsAuthorized:false};
export default function OfflineSpecialistStudio({identity}:{identity:Identity}){
 const [roster,setRoster]=useState<Agent[]>([]),[registry,setRegistry]=useState<Registry|null>(null);
 const [name,setName]=useState(""),[slug,setSlug]=useState(""),[mission,setMission]=useState(""),[template,setTemplate]=useState("");
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [rehearsalAgent,setRehearsalAgent]=useState(""),[objective,setObjective]=useState(""),[market,setMarket]=useState("");
 const [handoverId,setHandoverId]=useState("");
 const [contextQuery,setContextQuery]=useState(""),[missionPlanEnabled,setMissionPlanEnabled]=useState(false),[decisionMode,setDecisionMode]=useState(false),[providerContracts,setProviderContracts]=useState(false);
 const [batchRefs,setBatchRefs]=useState(""),[batchResult,setBatchResult]=useState<{status:string;items:{approvalId:string;status:string;executionId?:string;replayed?:boolean}[]}|null>(null);
 const batchIds=batchRefs.split(/\s+/).filter(Boolean);
 const [rehearsalRef,setRehearsalRef]=useState(""),[rehearsalResult,setRehearsalResult]=useState<{executionId:string;status:string;replayed:boolean;providerContracts?:{results:{providerKey:string;model:string;passed:boolean}[];providerRequestsMade:number;realModelInvocations:number;actualCostMicros:number};handover?:{sourceAgentId:string;approvalId:string;sourceEvidenceTransferred:false;ancestorAgentIds?:string[]};specialistDecision?:{disposition:string;rationale:string;draftEligible:boolean;candidates:{disposition:string;eligible:boolean;reason:string}[]};missionPlan?:{alignmentSignal:string;evidenceStatus:string;sharedTerms:string[];tasks:{kind:string;description:string}[]}}|null>(null);
 const [retireAgent,setRetireAgent]=useState(""),[retireReason,setRetireReason]=useState("");
 const [configAgent,setConfigAgent]=useState(""),[configMission,setConfigMission]=useState(""),[configEvidence,setConfigEvidence]=useState(false),[configLimit,setConfigLimit]=useState("500"),[configVersion,setConfigVersion]=useState(0);
 const [configSkills,setConfigSkills]=useState<string[]>([]);
 const [configLearningId,setConfigLearningId]=useState("");
 const configKey=useRef("");
 const lock=useRef(false),key=useRef(""),rehearsalKey=useRef(""),retirementKey=useRef("");
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
  </div><h4>Registered specialist identities ({registry.records.length})</h4>
  {registry.records.map(row=><article key={row.agentId}><strong>{row.input.name}</strong> · {row.status}<p>{row.agentId} · template {row.input.templateAgentId} · risk {row.templateRisk}</p><p>{row.configuration?.mission??row.input.mission}</p><p>Configuration v{row.configuration?.version??0} · {row.configuration?.evidenceRequired?"Reviewed context required":"Reviewed context optional"} · objective limit {row.configuration?.maxObjectiveChars??500} · competencies {row.configuration?.reviewSkills?.join(", ")||"None"}</p></article>)}
  <h4>Versioned specialist configuration</h4>
  <p>A different administrator must approve each revision. Changes cannot grant capabilities; they apply to future rehearsals and invalidate outstanding approvals.</p>
  <div className="alpha-grid">
   <label>Specialist to configure<select disabled={busy} value={configAgent} onChange={e=>{const row=registry.records.find(r=>r.agentId===e.target.value);setConfigAgent(e.target.value);setConfigMission(row?.configuration?.mission??row?.input.mission??"");setConfigEvidence(row?.configuration?.evidenceRequired??false);setConfigLimit(String(row?.configuration?.maxObjectiveChars??500));setConfigVersion(row?.configuration?.version??0);setConfigSkills(row?.configuration?.reviewSkills??[]);setConfigLearningId("");configKey.current="";}}><option value="">Choose paused specialist</option>{registry.records.filter(r=>r.status==="PAUSED").map(r=><option key={r.agentId} value={r.agentId}>{r.input.name}</option>)}</select></label>
   <label>Revised specialist mission<textarea disabled={busy} maxLength={500} value={configMission} onChange={e=>{setConfigMission(e.target.value);configKey.current="";}}/></label>
   <label><input type="checkbox" checked={configEvidence} disabled={busy} onChange={e=>{setConfigEvidence(e.target.checked);configKey.current="";}}/> Require reviewed knowledge context</label>
   <label>Maximum objective characters<input type="number" min={12} max={500} disabled={busy} value={configLimit} onChange={e=>{setConfigLimit(e.target.value);configKey.current="";}}/></label>
   <fieldset disabled={busy}><legend>Reviewed planning competencies (draft checklists only)</legend>{["CLAIM_LIMITATIONS","EVIDENCE_GAPS","AUDIENCE_FIT","MEASUREMENT_DESIGN"].map(skill=><label key={skill} style={{display:"block"}}><input type="checkbox" checked={configSkills.includes(skill)} onChange={e=>{setConfigSkills(prev=>e.target.checked?[...prev,skill]:prev.filter(x=>x!==skill));configKey.current="";}}/> {skill.replaceAll("_"," ")}</label>)}</fieldset>
   <label>Optional specialist retrieval evaluation ID<input maxLength={36} disabled={busy} value={configLearningId} onChange={e=>{setConfigLearningId(e.target.value);configKey.current="";}} placeholder="Recorded evaluation ID"/></label>
   <p>For evidence-linked changes, use a specialist retrieval evaluation from the last seven days. Select EVIDENCE GAPS for recall or precision below 1; otherwise select CLAIM LIMITATIONS. Retrieval metrics are not claim verification or model-quality evaluation.</p>
   <p>Reviewing revision {configVersion+1} from version {configVersion}. Reload and reselect the specialist after approval.</p>
   <button type="button" disabled={busy||!registry.records.some(r=>r.agentId===configAgent&&r.status==="PAUSED"&&(r.configuration?.version??0)===configVersion)||configMission.trim().length<12||!Number.isInteger(Number(configLimit))||Number(configLimit)<12||Number(configLimit)>500||configVersion>=50|| (!!configLearningId.trim()&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(configLearningId.trim()))} onClick={()=>void run(async()=>{
    const requestKey=configKey.current||"fixture-"+crypto.randomUUID();configKey.current=requestKey;
    const v=await api("/specialists",{action:"CONFIGURE",agentId:configAgent,requestKey,mission:configMission,evidenceRequired:configEvidence,maxObjectiveChars:Number(configLimit),expectedVersion:configVersion,reviewSkills:configSkills,fixtureOnly:true,...(configLearningId.trim()?{learningEvaluationId:configLearningId.trim()}:{})});
    if(v.executionAuthorized!==false||v.externalEffectsAuthorized!==false||v.version!==configVersion+1)throw Error("Unexpected configuration authority");
    await refresh();setNotice("Configuration review "+v.approvalId+" · "+v.decision+(v.learningEvidence?" · diagnostic recommendation "+v.learningEvidence.recommendedSkill:"")+". A different administrator must approve.");
   })}>Request specialist configuration review</button>
  </div>
  {registry.configurationHistoryCapped&&<p>Showing latest 100 configuration reviews.</p>}
  {registry.configurations?.map(r=><p key={r.approvalId} style={{overflowWrap:"anywhere"}}>{r.input.agentId} · v{r.version} · {r.decision} · {r.input.mission}</p>)}
  <h4>Retire specialist identity</h4>
  <p>Retirement is irreversible and requires a different administrator. It blocks new rehearsals and specialist knowledge access; historical records are retained.</p>
  <div className="alpha-grid">
   <label>Specialist to retire<select disabled={busy} value={retireAgent} onChange={e=>{setRetireAgent(e.target.value);retirementKey.current="";}}><option value="">Choose paused specialist</option>{registry.records.filter(row=>row.status==="PAUSED").map(row=><option key={row.agentId} value={row.agentId}>{row.input.name}</option>)}</select></label>
   <label>Retirement reason<textarea disabled={busy} maxLength={500} value={retireReason} onChange={e=>{setRetireReason(e.target.value);retirementKey.current="";}}/></label>
   <button type="button" disabled={busy||!registry.records.some(row=>row.agentId===retireAgent&&row.status==="PAUSED")||retireReason.trim().length<12} onClick={()=>void run(async()=>{
    const requestKey=retirementKey.current||"fixture-"+crypto.randomUUID();retirementKey.current=requestKey;
    const v=await api("/specialists",{action:"RETIRE",agentId:retireAgent,requestKey,reason:retireReason,fixtureOnly:true});
    if(v.executionAuthorized!==false||v.externalEffectsAuthorized!==false||v.targetStatus!=="RETIRED")throw Error("Unexpected retirement authority");
    await refresh();setNotice("Retirement review "+v.approvalId+" · "+v.decision+". A different administrator must approve.");
   })}>Request independent specialist retirement</button>
  </div>
  {registry.retirementHistoryCapped&&<p>Showing latest 100 retirement reviews.</p>}
  {registry.retirements?.map(row=><p key={row.approvalId} style={{overflowWrap:"anywhere"}}>{row.input.agentId} · {row.decision} · {row.input.reason} · {row.approvalId}</p>)}
  <h4>Independently reviewed specialist rehearsal</h4>
  <p>One approved fixture assessment through the canonical template. This does not activate the specialist, change permissions or approve its output. Do not enter confidential or real customer data.</p>
  <div className="alpha-grid">
   <label>Rehearsal specialist<select value={rehearsalAgent} disabled={busy} onChange={e=>{setRehearsalAgent(e.target.value);if(registry.records.find(r=>r.agentId===e.target.value)?.configuration?.reviewSkills?.length)setMissionPlanEnabled(true);rehearsalKey.current="";setRehearsalResult(null);}}><option value="">Choose paused specialist</option>{registry.records.filter(row=>row.status==="PAUSED").map(row=><option key={row.agentId} value={row.agentId}>{row.input.name}</option>)}</select></label>
   <label>Fixture assessment objective<textarea maxLength={500} value={objective} disabled={busy} onChange={e=>{setObjective(e.target.value);rehearsalKey.current="";setRehearsalResult(null);}}/></label>
   <label>Fixture assessment market<input maxLength={100} value={market} disabled={busy} onChange={e=>{setMarket(e.target.value);rehearsalKey.current="";setRehearsalResult(null);}}/></label>
   <label>Optional reviewed specialist context query<input maxLength={200} value={contextQuery} disabled={busy} onChange={e=>{setContextQuery(e.target.value);rehearsalKey.current="";setRehearsalResult(null);}}/></label>
   <label><input type="checkbox" checked={missionPlanEnabled} disabled={busy} onChange={e=>{setMissionPlanEnabled(e.target.checked);if(!e.target.checked)setDecisionMode(false);rehearsalKey.current="";setRehearsalResult(null);}}/> Include mission-specific offline planning (review required)</label>
   <label><input type="checkbox" checked={decisionMode} disabled={busy||!missionPlanEnabled} onChange={e=>{setDecisionMode(e.target.checked);rehearsalKey.current="";setRehearsalResult(null);}}/> Apply specialist decision policy (blocks incomplete drafts)</label>
   <label><input type="checkbox" checked={providerContracts&&decisionMode} disabled={busy||!decisionMode} onChange={e=>{setProviderContracts(e.target.checked);rehearsalKey.current="";setRehearsalResult(null);}}/> Rehearse four offline provider contracts (no AI inference or billing)</label>
   <label>Optional completed source specialist approval<input disabled={busy||!decisionMode} value={handoverId} maxLength={79} onChange={e=>{setHandoverId(e.target.value);rehearsalKey.current="";setRehearsalResult(null);}} placeholder="specialist-run-…"/></label>
   <p>Up to four stages: each specialist must be distinct, independently reviewed and currently eligible. Only provenance crosses the boundary; the target must retrieve its own authorized evidence.</p>
   <p className="alpha-subtle">If supplied, the exact source and memory citations must remain eligible at approval and execution. The engine receives references only, not raw knowledge text.</p>
   <button type="button" disabled={busy||!registry.records.some(row=>row.agentId===rehearsalAgent&&row.status==="PAUSED")||(!missionPlanEnabled&&!!registry.records.find(r=>r.agentId===rehearsalAgent)?.configuration?.reviewSkills?.length)||(decisionMode&&!!handoverId.trim()&&!/^specialist-run-[0-9a-f]{64}$/.test(handoverId.trim()))||objective.trim().length<12||market.trim().length<2||(!!contextQuery&&contextQuery.trim().length<3)} onClick={()=>void run(async()=>{
    const requestKey=rehearsalKey.current||"fixture-"+crypto.randomUUID();rehearsalKey.current=requestKey;
    const v=await api("/specialists/rehearse",{agentId:rehearsalAgent,requestKey,objective,market,fixtureOnly:true,...(missionPlanEnabled?{brainMode:decisionMode?"SPECIALIST_DECISION_V1":"MISSION_PLAN_V1"}:{}),...(contextQuery.trim()?{contextQuery:contextQuery.trim()}:{}),...(decisionMode&&handoverId.trim()?{handoverApprovalId:handoverId.trim()}:{}),...(decisionMode&&providerContracts?{simulationMode:"PROVIDER_CONTRACT_V1"}:{})});
    if(v.fixtureOnly!==true||v.externalEffectsAuthorized!==false||v.autonomousExecutionAuthorized!==false)throw Error("Unexpected rehearsal authority");
    setRehearsalRef(v.approvalId);setRehearsalResult(null);setNotice("Exact rehearsal review "+v.approvalId+" · "+v.decision+(v.contextPin?" · "+v.contextPin.references.length+" pinned evidence references":"")+". A different administrator must approve through the Approval inbox.");
   })}>Request exact specialist rehearsal review</button>
   <label>Approved specialist rehearsal reference<input value={rehearsalRef} disabled={busy} onChange={e=>{setRehearsalRef(e.target.value);setRehearsalResult(null);}}/></label>
   <button type="button" disabled={busy||!/^specialist-run-[0-9a-f]{64}$/.test(rehearsalRef)} onClick={()=>void run(async()=>{
    const v=await api("/specialists/execute-rehearsal",{approvalId:rehearsalRef,fixtureOnly:true});
    if(v.externalEffectsAuthorized!==false||!["COMPLETED","BLOCKED"].includes(v.status)||typeof v.executionId!=="string")throw Error("Invalid rehearsal result");
    setRehearsalResult({executionId:v.executionId,status:v.status,replayed:v.replayed===true,...(v.decision?.missionPlan?{missionPlan:v.decision.missionPlan}:{}),...(v.decision?.specialistDecision?{specialistDecision:v.decision.specialistDecision}:{}),...(v.decision?.handover?{handover:v.decision.handover}:{}),...(v.decision?.providerContracts?{providerContracts:v.decision.providerContracts}:{})});
   })}>Execute approved specialist rehearsal</button>
  </div>
  <h4>Approved specialist batch dispatch</h4>
  <p>Dispatch up to four distinct, independently approved specialist decisions in order. Stops on the first block or error. Previous completed transactions remain committed; replay does not create another execution.</p>
  <label>Approved rehearsal references (one per line)<textarea value={batchRefs} maxLength={340} disabled={busy} onChange={e=>{setBatchRefs(e.target.value);setBatchResult(null);}}/></label>
  <button type="button" disabled={busy||batchIds.length<1||batchIds.length>4||new Set(batchIds).size!==batchIds.length||batchIds.some(id=>!/^specialist-run-[0-9a-f]{64}$/.test(id))} onClick={()=>void run(async()=>{
   const v=await api("/specialists/execute-batch",{approvalIds:batchIds,fixtureOnly:true});
   if(v.schema!=="medsol.specialist-batch-dispatch.v1"||v.externalEffectsAuthorized!==false||v.atomic!==false||v.automaticRetry!==false||!Array.isArray(v.items)||v.items.length!==batchIds.length||v.items.some((item:{approvalId:string},i:number)=>item.approvalId!==batchIds[i]))throw Error("Unexpected dispatch result");
   setBatchResult(v);setNotice("Specialist batch "+v.status+". Inspect individual receipts before resubmission.");
  })}>Dispatch approved specialist batch</button>
  {batchResult&&<div role="status"><strong>Batch: {batchResult.status}</strong><ol>{batchResult.items.map(item=><li key={item.approvalId} style={{overflowWrap:"anywhere"}}>{item.status} · {item.approvalId}{item.replayed?" · historical replay":""}{item.executionId?" · "+item.executionId:""}</li>)}</ol></div>}
  {rehearsalResult&&<div role="status"><strong>{rehearsalResult.status}</strong> · {rehearsalResult.replayed?"Historical receipt (no new execution)":"Draft recorded in AgentExecution"}<p style={{overflowWrap:"anywhere"}}>Execution reference: {rehearsalResult.executionId}</p>{rehearsalResult.missionPlan&&<div><h5>Mission planning draft</h5><p>{rehearsalResult.missionPlan.alignmentSignal} · {rehearsalResult.missionPlan.evidenceStatus}</p><p>Shared terms: {rehearsalResult.missionPlan.sharedTerms.join(", ")||"None"}</p><ol>{rehearsalResult.missionPlan.tasks.map(task=><li key={task.kind}>{task.description}</li>)}</ol></div>}{rehearsalResult.specialistDecision&&<div><h5>Specialist decision: {rehearsalResult.specialistDecision.disposition}</h5><p>{rehearsalResult.specialistDecision.rationale}</p><ul>{rehearsalResult.specialistDecision.candidates.map(candidate=><li key={candidate.disposition}>{candidate.eligible?"Selected":"Not eligible"}: {candidate.disposition} — {candidate.reason}</li>)}</ul></div>}{rehearsalResult.handover&&<p>Handover chain: {(rehearsalResult.handover.ancestorAgentIds??[rehearsalResult.handover.sourceAgentId]).join(" → ")} · {rehearsalResult.handover.approvalId} · source evidence not transferred.</p>}{rehearsalResult.providerContracts&&<div><h5>Synthetic provider contract results</h5><ul>{rehearsalResult.providerContracts.results.map(result=><li key={result.providerKey}>{result.providerKey} · {result.passed?"Passed":"Failed"} · {result.model}</li>)}</ul><p>Real requests: {rehearsalResult.providerContracts.providerRequestsMade} · Real inference: {rehearsalResult.providerContracts.realModelInvocations} · Cost: {rehearsalResult.providerContracts.actualCostMicros}</p></div>}<p>Output still requires review. No live provider, model or tool call.</p></div>}
  <h4>Registration reviews</h4>{registry.historyCapped&&<p>Showing latest 100 reviews.</p>}
  {registry.reviews.map(row=><div key={row.approvalId} style={{overflowWrap:"anywhere"}}>{row.input.name} · {row.decision} · {row.approvalId}</div>)}</>}
  {notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error}</p>}
 </section>;
}
