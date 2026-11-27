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
 const lock=useRef(false),key=useRef("");
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
  <h4>Registration reviews</h4>{registry.historyCapped&&<p>Showing latest 100 reviews.</p>}
  {registry.reviews.map(row=><div key={row.approvalId} style={{overflowWrap:"anywhere"}}>{row.input.name} · {row.decision} · {row.approvalId}</div>)}</>}
  {notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error}</p>}
 </section>;
}
