"use client";
import {useEffect,useState} from "react";
type Identity={userId:string;organizationId:string;role:string};
type Source={id:string;title:string;status:string;accessMode:string;agentScope:string[]};
type Memory={memoryId:string;documentId:string;agentId:string;status:string;
 memoryKey:string;contentDigest:string;expiresAt:string;createdBy:string;reviewedBy:string|null};
type Graph={documentId:string;edges:Array<{edgeId:string;fromDocumentId:string;
 toDocumentId:string;relationType:string;note:string;scientificTruthVerified:false}>};
const style={boxSizing:"border-box" as const,width:"100%",padding:"9px 10px",
 border:"1px solid #cbd5e1",borderRadius:7};
const btn={border:0,borderRadius:7,padding:"9px 12px",background:"#124d83",
 color:"#fff",cursor:"pointer",fontWeight:600} as const;
export default function MemoryGraphStudio({identity}:{identity:Identity|null}){
 const [sources,setSources]=useState<Source[]>([]);
 const [memories,setMemories]=useState<Memory[]>([]);
 const [sourceId,setSourceId]=useState("");
 const [targetId,setTargetId]=useState("");
 const [agentId,setAgentId]=useState("MKT-SCI-001");
 const [memoryKey,setMemoryKey]=useState("");
 const [content,setContent]=useState("");
 const [expiresAt,setExpiresAt]=useState("");
 const [relationType,setRelationType]=useState("SHARES_TOPIC");
 const [note,setNote]=useState("");
 const [reason,setReason]=useState("");
 const [graph,setGraph]=useState<Graph|null>(null);
 const [feedbackChunk,setFeedbackChunk]=useState("");
 const [feedbackQuery,setFeedbackQuery]=useState("proteomics");
 const [feedbackLabel,setFeedbackLabel]=useState("RELEVANT");
 const [evalCases,setEvalCases]=useState("[]");
 const [feedback,setFeedback]=useState<unknown>(null);
 const [last,setLast]=useState<unknown>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 const authorized=!!identity&&["ADMIN","SUPER_ADMIN"].includes(identity.role.toUpperCase());
 async function api(path:string,body?:unknown):Promise<any>{
  const response=await fetch("/api/marketing/learning/"+path,{
   credentials:"same-origin",cache:"no-store",
   method:body===undefined?"GET":"POST",
   ...(body===undefined?{}:{headers:{"content-type":"application/json"},
    body:JSON.stringify(body)})});
  const result:unknown=await response.json();
  if(!response.ok)throw new Error(result&&typeof result==="object"&&
   "message" in result?String((result as {message:unknown}).message):
   "Governed knowledge operation denied");
  return result;
 }
 async function refresh(){
  const [a,b]=await Promise.all([api("knowledge"),api("memories")]);
  setSources(Array.isArray(a)?a as Source[]:[]);
  setMemories(Array.isArray(b)?b as Memory[]:[]);
 }
 useEffect(()=>{if(authorized)void refresh().catch(e=>setError(String(e)));},
  [identity?.organizationId,identity?.userId,authorized]);
 async function task(run:()=>Promise<void>){
  setBusy(true);setError("");
  try{await run();}catch(e){setError(e instanceof Error?e.message:"Operation denied");}
  finally{setBusy(false);}
 }
 if(!authorized)return null;
 const active=sources.filter(s=>s.status==="REVIEWED");
 const option=(s:Source)=><option key={s.id} value={s.id}>{s.title} · {s.id.slice(0,8)}</option>;
 const labelStyle={fontSize:12,fontWeight:600 as const};
 return <section aria-label="R3-I governed agent memory and knowledge graph"
  style={{background:"white",border:"1px solid #cbd5e1",borderRadius:12,
   padding:20,marginTop:20}}>
  <h3 style={{marginTop:0}}>R3-I · Agent Memory, Knowledge Graph & Learning Evaluation</h3>
  <p style={{color:"#475569",fontSize:13}}>
   All memory is human-authored, source-backed, per-agent and automatically
   time-limited. All graph relationships require an independent reviewer.
   Retrieval feedback is observational only: it cannot change a model,
   skill, ranking policy or approval without a separate reviewed release.
  </p>
  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:10}}>
   <label style={labelStyle}>Reviewed source
    <select style={style} value={sourceId} onChange={e=>setSourceId(e.target.value)}>
     <option value="">Select source</option>{active.map(option)}
    </select></label>
   <label style={labelStyle}>Related reviewed source
    <select style={style} value={targetId} onChange={e=>setTargetId(e.target.value)}>
     <option value="">Select source</option>{active.map(option)}
    </select></label>
   <label style={labelStyle}>Canonical agent ID
    <input style={style} value={agentId} onChange={e=>setAgentId(e.target.value)}/></label>
   <label style={labelStyle}>Detailed decision rationale (12+ characters)
    <input style={style} value={reason} onChange={e=>setReason(e.target.value)}/></label>
  </div>
  <h4>Propose a source-backed graph relationship</h4>
  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(250px,1fr))",gap:10}}>
   <label style={labelStyle}>Relationship classification
    <select style={style} value={relationType} onChange={e=>setRelationType(e.target.value)}>
     <option value="SHARES_TOPIC">Shares a research topic</option>
     <option value="METHODOLOGICALLY_RELATED">Methodologically related</option>
     <option value="REPORTS_CONFLICT">Reports conflicting findings</option>
    </select></label>
   <label style={labelStyle}>Relationship explanation (not a truth claim)
    <input style={style} value={note} onChange={e=>setNote(e.target.value)}/></label>
  </div>
  <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:10}}>
   <button disabled={busy||!sourceId||!targetId} style={btn}
    onClick={()=>void task(async()=>{setLast(await api("graph",{
     fromDocumentId:sourceId,toDocumentId:targetId,relationType,note}));})}>
    Propose reviewed-source edge</button>
   <button disabled={busy||!sourceId} style={{...btn,background:"#475569"}}
    onClick={()=>void task(async()=>setGraph(await api("graph/"+encodeURIComponent(sourceId))))}>
    Show approved graph neighbors</button>
  </div>
  <p style={{fontSize:12,color:"#475569"}}>
   An independently authorized administrator must approve an edge ID;
   proposed edges never appear in agent context.
  </p>
  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
   <button disabled={busy||reason.length<12||
    !last||typeof last!=="object"||!("edgeId" in last)}
    style={btn} onClick={()=>void task(async()=>{
     const id=(last as {edgeId:string}).edgeId;
     setLast(await api("graph/"+encodeURIComponent(id)+"/review",{
      decision:"APPROVE",reason}));
     if(sourceId)setGraph(await api("graph/"+encodeURIComponent(sourceId)));
    })}>Approve proposed edge (different administrator)</button>
   <button disabled={busy||reason.length<12||
    !last||typeof last!=="object"||!("edgeId" in last)}
    style={{...btn,background:"#b91c1c"}} onClick={()=>void task(async()=>{
     setLast(await api("graph/"+encodeURIComponent(
      (last as {edgeId:string}).edgeId)+"/revoke",{reason}));
    })}>Revoke selected edge</button>
  </div>
  {graph&&<div style={{fontSize:12,marginTop:10}}>
   <strong>Reviewed graph edges ({graph.edges.length})</strong>
   {graph.edges.map(edge=><p key={edge.edgeId}>
    {edge.relationType} · {edge.fromDocumentId.slice(0,8)}
    {" → "}{edge.toDocumentId.slice(0,8)} · {edge.note}
   </p>)}
  </div>}
  <h4>Human-curated agent memory</h4>
  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:10}}>
   <label style={labelStyle}>Stable memory key
    <input style={style} value={memoryKey} onChange={e=>setMemoryKey(e.target.value)}
     placeholder="Created once on submit"/></label>
   <label style={labelStyle}>Expiry date/time (ISO 8601, max 30 days)
    <input style={style} value={expiresAt} onChange={e=>setExpiresAt(e.target.value)}
     placeholder="2026-11-26T12:00:00.000Z"/></label>
  </div>
  <label style={{display:"block",fontSize:12,fontWeight:600,marginTop:10}}>
   Reviewed-source-backed memory statement
   <textarea style={{...style,minHeight:92}} value={content}
    onChange={e=>setContent(e.target.value)}/>
  </label>
  <button disabled={busy||!sourceId} style={btn}
   onClick={()=>void task(async()=>{
    const key=memoryKey||"memory-"+crypto.randomUUID();if(!memoryKey)setMemoryKey(key);
    const expiry=expiresAt||new Date(Date.now()+7*86400000).toISOString();
    if(!expiresAt)setExpiresAt(expiry);
    setLast(await api("memories",{documentId:sourceId,agentId,memoryKey:key,
     content,expiresAt:expiry}));await refresh();
   })}>Propose non-autonomous memory</button>
  <div style={{overflowX:"auto",marginTop:10}}>
   <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
    <thead><tr><th align="left">Agent / scope</th><th align="left">Status</th>
     <th align="left">Expires</th><th align="left">Governance</th></tr></thead>
    <tbody>{memories.map(m=><tr key={m.memoryId}>
     <td style={{padding:8,borderTop:"1px solid #e2e8f0"}}>
      {m.agentId}<div>{m.memoryKey}</div></td>
     <td style={{padding:8,borderTop:"1px solid #e2e8f0"}}>{m.status}</td>
     <td style={{padding:8,borderTop:"1px solid #e2e8f0"}}>
      {new Date(m.expiresAt).toLocaleDateString()}</td>
     <td style={{padding:8,borderTop:"1px solid #e2e8f0"}}>
      <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
       {m.status==="PROPOSED"&&<button disabled={busy||reason.length<12} style={btn}
        onClick={()=>void task(async()=>{setLast(await api("memories/"+
         encodeURIComponent(m.memoryId)+"/review",{decision:"APPROVE",reason}));await refresh();
        })}>Approve (different administrator)</button>}
       {m.status!=="REVOKED"&&<button disabled={busy||reason.length<12}
        style={{...btn,background:"#b91c1c"}}
        onClick={()=>void task(async()=>{setLast(await api("memories/"+
         encodeURIComponent(m.memoryId)+"/revoke",{reason}));await refresh();
        })}>Revoke / scrub</button>}
      </div>
     </td>
    </tr>)}</tbody>
   </table>
  </div>
  <h4>Feedback and retrieval-quality evaluation</h4>
  <p style={{fontSize:12,color:"#64748b"}}>
   Use a real chunk ID from a reviewed search result. Evaluation accepts
   operator-labeled expected source IDs; results are metrics, not proof of truth.
  </p>
  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:10}}>
   <label style={labelStyle}>Search query
    <input style={style} value={feedbackQuery}
     onChange={e=>setFeedbackQuery(e.target.value)}/></label>
   <label style={labelStyle}>Reviewed chunk ID
    <input style={style} value={feedbackChunk}
     onChange={e=>setFeedbackChunk(e.target.value)}/></label>
   <label style={labelStyle}>Human relevance label
    <select style={style} value={feedbackLabel}
     onChange={e=>setFeedbackLabel(e.target.value)}>
     <option value="RELEVANT">Relevant</option>
     <option value="IRRELEVANT">Irrelevant</option>
     <option value="MISLEADING">Misleading</option>
    </select></label>
  </div>
  <div style={{display:"flex",gap:8,marginTop:9,flexWrap:"wrap"}}>
   <button disabled={busy||reason.length<12} style={btn}
    onClick={()=>void task(async()=>{
     setLast(await api("knowledge/feedback",{query:feedbackQuery,
      chunkId:feedbackChunk,label:feedbackLabel,reason}));
    })}>Record reviewed feedback</button>
   <button disabled={busy} style={{...btn,background:"#475569"}}
    onClick={()=>void task(async()=>setFeedback(await api("knowledge/feedback")))}>
    Show feedback summary</button>
  </div>
  <label style={{display:"block",fontWeight:600,fontSize:12,marginTop:9}}>
   Operator-labeled evaluation cases (JSON, max 12)
   <textarea style={{...style,minHeight:72,fontFamily:"monospace"}} spellCheck={false}
    value={evalCases} onChange={e=>setEvalCases(e.target.value)}/>
  </label>
  <button disabled={busy} style={btn}
   onClick={()=>void task(async()=>setLast(await api("knowledge/evaluate",{
    k:5,cases:JSON.parse(evalCases) as unknown})))}>
   Run offline retrieval evaluation (no auto-learning)</button>
  {error&&<p role="alert" style={{color:"#b91c1c"}}>{error}</p>}
  {last!==null&&<pre style={{fontSize:12,padding:10,background:"#f8fafc",
   borderRadius:8,whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>
   {JSON.stringify(last,null,2)}</pre>}
  {feedback!==null&&<pre style={{fontSize:12,padding:10,background:"#f8fafc",
   borderRadius:8,whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>
   {JSON.stringify(feedback,null,2)}</pre>}
 </section>;
}
