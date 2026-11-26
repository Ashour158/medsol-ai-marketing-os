"use client";
import {useState} from "react";
type Agent={id:string;name:string;mission?:string;capabilities?:string[];authority?:string[]};
type Stage={stage:string;agents:string[]};
type Plan={stages:Stage[];handoffs:Record<string,string[]>;controls?:Record<string,boolean>};
type Step={agentId:string;status:string;executionId?:string|null};
const record=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==="object"&&!Array.isArray(x);
const strings=(x:unknown):x is string[]=>Array.isArray(x)&&x.every(y=>typeof y==="string");
export function readBrainMap(plan:unknown,roster:unknown){
 if(!record(plan)||!Array.isArray(plan.stages)||!record(plan.handoffs)||!Array.isArray(roster))return null;
 const agents:Agent[]=roster.filter((a):a is Agent=>record(a)&&typeof a.id==="string"&&typeof a.name==="string");
 const byId=new Map(agents.map(a=>[a.id,a]));
 if(!agents.length||agents.length!==byId.size)return null;
 const seen=new Set<string>(),stages:Stage[]=[];
 for(const x of plan.stages){if(!record(x)||typeof x.stage!=="string"||!strings(x.agents)||!x.agents.length)return null;
  for(const id of x.agents){if(!byId.has(id)||seen.has(id))return null;seen.add(id);}
  stages.push({stage:x.stage,agents:x.agents});
 }
 if(seen.size!==agents.length)return null;
 const handoffs:Record<string,string[]>={};
 for(const [id,to] of Object.entries(plan.handoffs)){if(!seen.has(id)||!strings(to)||to.some(t=>!seen.has(t)))return null;handoffs[id]=to;}
 return {agents,byId,plan:{stages,handoffs} as Plan};
}
export default function AlphaBrainMap({plan,roster,run,authenticated,onNavigate}:{
 plan:unknown;roster:unknown;run:unknown;authenticated:boolean;onNavigate:(id:string)=>void
}){
 const [selected,setSelected]=useState("");
 const data=readBrainMap(plan,roster);
 if(!authenticated||!data)return <div className="alpha-notice">Load the authorized brain map to see agent relationships. No execution is initiated.</div>;
 const id=data.byId.has(selected)?selected:data.agents[0]!.id;
 const a=data.byId.get(id)!;
 const steps:Step[]=record(run)&&Array.isArray(run.steps)?run.steps.filter((x):x is Step=>record(x)&&typeof x.agentId==="string"&&typeof x.status==="string"):[];
 const known=new Map(steps.map(s=>[s.agentId,s]));
 const outgoing=data.plan.handoffs[id]??[],incoming=Object.entries(data.plan.handoffs).filter(([,to])=>to.includes(id)).map(([from])=>from);
 return <section className="alpha-card" aria-label="Visual agent and nervous system map" style={{marginTop:14}}>
  <div className="alpha-kicker">Canonical coordination</div><h3>Agent network & handoffs</h3>
  <p className="alpha-subtle">Plan from the authorized Brain API; a declared handoff is not a completed execution. Checkpoint labels refer only to the inspected run.</p>
  <div className="alpha-flow">{data.plan.stages.map((s,i)=><div key={s.stage} className="alpha-stage"><span className="alpha-kicker">{String(i+1).padStart(2,"0")} · {s.stage}</span>{s.agents.map(k=><button type="button" key={k} aria-pressed={id===k} onClick={()=>setSelected(k)}>{data.byId.get(k)?.name}<br/><span className="alpha-subtle">{known.get(k)?.status??"Plan member"}</span></button>)}</div>)}</div>
  <div className="alpha-card" style={{marginTop:12,boxShadow:"none"}}><div className="alpha-status-row"><h3>{a.name}</h3><span className="alpha-pill">{id}</span></div><p>{typeof a.mission==="string"?a.mission:"Mission not supplied by roster."}</p>
   <div className="alpha-grid"><div><strong>Capabilities</strong><ul>{(strings(a.capabilities)?a.capabilities:[]).map(c=><li key={c}>{c.replaceAll("_"," ")}</li>)}</ul></div><div><strong>Incoming handoffs</strong><ul>{incoming.map(k=><li key={k}>{data.byId.get(k)?.name}</li>)}</ul>{!incoming.length&&<p className="alpha-subtle">None declared</p>}</div><div><strong>Outgoing handoffs</strong><ul>{outgoing.map(k=><li key={k}>{data.byId.get(k)?.name}</li>)}</ul>{!outgoing.length&&<p className="alpha-subtle">None declared</p>}</div></div>
   <div className="alpha-status-row"><span className="alpha-subtle">Checkpoint: {known.get(id)?.status??"No inspected checkpoint"}</span><button type="button" onClick={()=>onNavigate("agent-studio")}>Signed agent configuration</button><button type="button" onClick={()=>onNavigate("knowledge")}>Knowledge & evidence</button><button type="button" onClick={()=>onNavigate("memory")}>Scoped memory</button></div>
  </div>
  <div className="alpha-notice" style={{marginTop:12}}><strong>Trigger and execution boundaries:</strong> manual queued Brain execution, optional worker dispatch, reviewed-watch scheduling and signed offline workflow nodes. External triggers are not active. Worker health and incident evidence are available in operations.</div>
  <button style={{marginTop:10}} type="button" onClick={()=>onNavigate("workflow-studio")}>Open bounded workflow builder</button>
 </section>
}
