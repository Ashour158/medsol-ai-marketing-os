"use client";
import {useRef,useState} from "react";
type Identity={organizationId:string;userId:string;role:string};
type Agent={id:string;name:string};
type Member={agentId:string;expectedVersion:number;roleLabel:string};
type Preview={organizationId:string;members:Array<{agentId:string;roleLabel:string;observedVersion:number;capability:string;installed:boolean}>;manifest:unknown;digest:string;fixtureOnly:true;unsignedDraft:true;executionAuthorized:false;externalEffectsAuthorized:false;agentsCreated:0;agentExecutions:0;memberVersionsObservedOnly:true};
export default function OfflineTeamAssemblyStudio({identity,onPrepare}:{identity:Identity;onPrepare:(manifest:string)=>void}){
 const [roster,setRoster]=useState<Agent[]>([]),[members,setMembers]=useState<Member[]>([]);
 const [selected,setSelected]=useState(""),[label,setLabel]=useState("");
 const [blueprintId,setBlueprintId]=useState(""),[version,setVersion]=useState(1);
 const [preview,setPreview]=useState<Preview|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const lock=useRef(false);
 async function api(path:string,body?:unknown){
  const r=await fetch("/api/marketing/agents"+path,{method:body===undefined?"GET":"POST",cache:"no-store",...(body===undefined?{}:{headers:{"content-type":"application/json"},body:JSON.stringify(body)})});
  const v=await r.json();if(!r.ok)throw Error(typeof v.message==="string"?v.message:"Team assembly request denied");return v;
 }
 async function run(fn:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);setError("");try{await fn();}catch(e){setError(e instanceof Error?e.message:"Team assembly failed");}finally{lock.current=false;setBusy(false);}}
 function invalidate(){setPreview(null);}
 if(!["ADMIN","SUPER_ADMIN"].includes(identity.role.toUpperCase()))return null;
 return <section className="alpha-card" aria-label="Offline team assembly" style={{marginTop:16}}>
  <h3>Offline team assembly</h3><p>Choose up to eight canonical agents and assign display-only specialist roles. No new executable agent, persistent memory or tool authority is created.</p>
  <button type="button" disabled={busy} onClick={()=>void run(async()=>{setRoster(await api(""));invalidate();})}>Load team agent catalog</button>
  <div className="alpha-grid">
   <label>Team blueprint ID<input value={blueprintId} placeholder="team-research-launch" disabled={busy} onChange={e=>{setBlueprintId(e.target.value);invalidate();}}/></label>
   <label>Blueprint revision<input type="number" min={1} max={1000000} value={version} disabled={busy} onChange={e=>{setVersion(Number(e.target.value));invalidate();}}/></label>
   <label>Team canonical agent<select value={selected} disabled={busy} onChange={e=>setSelected(e.target.value)}><option value="">Select agent</option>{roster.filter(a=>!members.some(m=>m.agentId===a.id)).map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
   <label>Specialist role label<input value={label} maxLength={80} disabled={busy} onChange={e=>setLabel(e.target.value)}/></label>
   <button type="button" disabled={busy||!selected||label.trim().length<3||members.length>=8} onClick={()=>void run(async()=>{
    const baseline=await api("/manifests/baseline/"+encodeURIComponent(selected));
    setMembers(prev=>[...prev,{agentId:selected,roleLabel:label.trim(),expectedVersion:baseline.activeVersion}]);setSelected("");setLabel("");invalidate();
   })}>Add specialist</button>
  </div>
  <ol>{members.map((m,i)=><li key={m.agentId}>{m.roleLabel} · {m.agentId} · v{m.expectedVersion}{" "}<button type="button" disabled={busy||i===0} aria-label={"Move "+m.roleLabel+" earlier"} onClick={()=>{setMembers(old=>{const copy=[...old];[copy[i-1],copy[i]]=[copy[i]!,copy[i-1]!];return copy;});invalidate();}}>↑</button>{" "}<button type="button" disabled={busy} aria-label={"Remove "+m.roleLabel} onClick={()=>{setMembers(old=>old.filter(x=>x.agentId!==m.agentId));invalidate();}}>Remove</button></li>)}</ol>
  <button type="button" disabled={busy||!members.length||!blueprintId.trim()} onClick={()=>void run(async()=>{
   invalidate();const v=await api("/team-preview",{blueprintId,version,members,fixtureOnly:true}) as Preview;
   if(v.organizationId!==identity.organizationId||v.fixtureOnly!==true||v.unsignedDraft!==true||v.executionAuthorized!==false||v.externalEffectsAuthorized!==false||v.agentsCreated!==0||v.agentExecutions!==0||v.memberVersionsObservedOnly!==true)throw Error("Unexpected team preview authority");
   setPreview(v);
  })}>Validate offline team draft</button>
  {preview&&<><p role="status">Unsigned team draft validated · {preview.members.length} members · independent review required.</p><p className="alpha-subtle">Observed release versions are a snapshot, not execution pins. The signed Workflow Studio remains the execution authority.</p><p style={{overflowWrap:"anywhere"}}>{preview.digest}</p><ul>{preview.members.map(m=><li key={m.agentId}>{m.roleLabel}: {m.capability} · observed v{m.observedVersion}{m.installed?"":" · baseline not installed"}</li>)}</ul><button type="button" disabled={busy} onClick={()=>onPrepare(JSON.stringify(preview.manifest,null,2))}>Open unsigned team in Workflow Studio</button></>}
  {error&&<p role="alert">{error}</p>}
 </section>;
}
