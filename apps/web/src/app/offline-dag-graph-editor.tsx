"use client";
import {useEffect,useMemo,useState} from "react";
import {OFFLINE_EDITOR_NODE_TYPES,readOfflineEditorManifest,
 addOfflineEditorNode,removeOfflineEditorNode,addOfflineEditorEdge,
 removeOfflineEditorEdge,layoutOfflineEditor,
 type EditorNodeType,type OfflineEditorManifest} from "../lib/offline-dag-graph";
type Agent={id:string;name:string};
const field={padding:8,border:"1px solid #cbd5e1",borderRadius:7,
 width:"100%",boxSizing:"border-box" as const};
const button={padding:"8px 12px",borderRadius:7,border:0,background:"#124d83",
 color:"#fff",fontWeight:650 as const,cursor:"pointer"};
export default function OfflineDagGraphEditor({json,onChange}:{
 json:string;onChange:(next:string)=>void
}){
 const [agents,setAgents]=useState<Agent[]>([]);
 const [id,setId]=useState("new-review");
 const [type,setType]=useState<EditorNodeType>("APPROVAL");
 const [agentId,setAgentId]=useState("");
 const [from,setFrom]=useState("");
 const [to,setTo]=useState("");
 const [error,setError]=useState("");
 const parsed=useMemo(()=>{
  try{return{value:readOfflineEditorManifest(json),error:""};}
  catch(e){return{value:null,error:e instanceof Error?e.message:"Invalid JSON";}}
 },[json]);
 useEffect(()=>{
  let active=true;
  void fetch("/api/marketing/agents",{cache:"no-store",credentials:"same-origin"})
   .then(async r=>{if(!r.ok)throw Error("Agent roster unavailable");
    return await r.json() as unknown;})
   .then(data=>{if(active&&Array.isArray(data))setAgents(data.filter(
    (a):a is Agent=>!!a&&typeof a==="object"&&
     typeof (a as Agent).id==="string"&&typeof (a as Agent).name==="string"));})
   .catch(()=>{if(active)setAgents([]);});
  return()=>{active=false;};
 },[]);
 function apply(fn:(m:OfflineEditorManifest)=>OfflineEditorManifest){
  try{
   if(!parsed.value)throw Error(parsed.error);
   const updated=fn(parsed.value);
   onChange(JSON.stringify(updated,null,2));
   setError("");
  }catch(e){setError(e instanceof Error?e.message:"Cannot edit graph");}
 }
 const graph=parsed.value;
 const positions=graph?layoutOfflineEditor(graph):[];
 const xy=new Map(positions.map(n=>[n.id,n]));
 const width=Math.max(440,...positions.map(n=>n.x+220));
 const height=Math.max(180,...positions.map(n=>n.y+85));
 return <details style={{marginTop:14,padding:12,border:"1px solid #d3deeb",
  borderRadius:10}}>
  <summary style={{cursor:"pointer",fontWeight:700}}>
   Visual offline workflow builder · controlled nodes and edges
  </summary>
  <p style={{fontSize:12,color:"#475569"}}>
   Edits directly update the signed JSON draft. Only deterministic internal graph
   operations are offered; the canonical API still validates human-review paths,
   tenant authorization, signatures and deployed execution. Existing signatures
   must be recreated after every edit.
  </p>
  {!graph&&<p role="alert" style={{fontSize:12,color:"#b91c1c"}}>
   Cannot open this draft visually: {parsed.error}. Advanced JSON remains unchanged.
  </p>}
  {graph&&<>
   <div style={{overflowX:"auto",margin:"14px 0",borderRadius:8,
    background:"#f8fafc",border:"1px solid #e2e8f0"}}>
    <svg role="img" aria-label="Directed offline workflow graph"
     width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
     <defs><marker id="dag-arrow" markerWidth="7" markerHeight="7"
      refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z"
       fill="#64748b"/></marker></defs>
     {graph.draft.edges.map((e,i)=>{
      const a=xy.get(e.from),b=xy.get(e.to);
      if(!a||!b)return null;
      return <path key={i} d={`M ${a.x+196} ${a.y+30} C ${a.x+225} ${a.y+30},
       ${b.x-30} ${b.y+30}, ${b.x} ${b.y+30}`}
       stroke="#64748b" strokeWidth="1.7" fill="none" markerEnd="url(#dag-arrow)"/>;
     })}
     {positions.map(n=><g key={n.id}>
      <rect x={n.x} y={n.y} width="196" height="65" rx="9"
       fill={n.type==="APPROVAL"||n.type==="HUMAN_TASK"?"#fff7ed":"#e8f2fc"}
       stroke={n.type==="APPROVAL"||n.type==="HUMAN_TASK"?"#d97706":"#377bad"}/>
      <text x={n.x+10} y={n.y+24} fill="#0f172a" fontSize="13" fontWeight="700">
       {n.id.slice(0,22)}</text>
      <text x={n.x+10} y={n.y+46} fill="#334155" fontSize="11">
       {n.type.replaceAll("_"," ")}{n.agentId?" · "+n.agentId.slice(0,11):""}</text>
     </g>)}
    </svg>
   </div>
   <div style={{display:"grid",gap:9,
    gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))"}}>
    <label style={{fontSize:12}}>New node ID
     <input style={field} value={id} onChange={e=>setId(e.target.value)}/></label>
    <label style={{fontSize:12}}>Internal node type
     <select style={field} value={type}
      onChange={e=>setType(e.target.value as EditorNodeType)}>
      {OFFLINE_EDITOR_NODE_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
     </select></label>
    {type==="AGENT_TASK"&&<label style={{fontSize:12}}>Canonical agent (API roster)
     <select style={field} value={agentId} onChange={e=>setAgentId(e.target.value)}>
      <option value="">Choose a listed canonical agent</option>
      {agents.map(a=><option key={a.id} value={a.id}>{a.name} · {a.id}</option>)}
     </select></label>}
   </div>
   <button type="button" style={{...button,marginTop:10}}
    onClick={()=>apply(m=>addOfflineEditorNode(m,{
     id:id.trim(),type,...(type==="AGENT_TASK"?{agentId,maxSeconds:45}:{})
    }))} disabled={type==="AGENT_TASK"&&!agents.some(a=>a.id===agentId)}>
    Add bounded node</button>
   <div style={{marginTop:14}}>
    <strong style={{fontSize:13}}>Nodes ({graph.draft.nodes.length})</strong>
    <div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:9}}>
     {graph.draft.nodes.map(n=><div key={n.id} style={{padding:"7px 10px",
      background:"#f1f5f9",borderRadius:7,fontSize:12}}>
      {n.id} · {n.type}
      <button type="button" style={{marginLeft:8}} aria-label={"Remove "+n.id}
       onClick={()=>apply(m=>removeOfflineEditorNode(m,n.id))}>×</button>
     </div>)}
    </div>
   </div>
   <div style={{display:"grid",gap:9,marginTop:14,
    gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))"}}>
    <label style={{fontSize:12}}>From node
     <select style={field} value={from} onChange={e=>setFrom(e.target.value)}>
      <option value="">Choose source</option>
      {graph.draft.nodes.filter(n=>n.type!=="END").map(n=>
       <option key={n.id} value={n.id}>{n.id}</option>)}
     </select></label>
    <label style={{fontSize:12}}>To node
     <select style={field} value={to} onChange={e=>setTo(e.target.value)}>
      <option value="">Choose destination</option>
      {graph.draft.nodes.filter(n=>n.type!=="TRIGGER").map(n=>
       <option key={n.id} value={n.id}>{n.id}</option>)}
     </select></label>
   </div>
   <button type="button" style={{...button,marginTop:10}} disabled={!from||!to}
    onClick={()=>apply(m=>addOfflineEditorEdge(m,from,to))}>Connect nodes</button>
   <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:10}}>
    {graph.draft.edges.map((e,i)=><div key={i} style={{padding:6,
     border:"1px solid #e2e8f0",borderRadius:7,fontSize:12}}>
     {e.from} → {e.to}
     <button type="button" aria-label={"Remove connection "+e.from+" to "+e.to}
      style={{marginLeft:7}} onClick={()=>apply(m=>removeOfflineEditorEdge(m,e.from,e.to))}>
      ×</button>
    </div>)}
   </div>
  </>}
  {error&&<p role="alert" style={{fontSize:12,color:"#b91c1c"}}>{error}</p>}
 </details>;
}
