"use client";
import {useEffect,useState} from "react";

type Identity={userId:string;organizationId:string;role:string};
type Document={id:string;sourceKey:string;title:string;status:string;
 accessMode:string;agentScope:string[];contentDigest:string;
 sourceUrl:string|null;reviewedBy:string|null};
type Result={results:Array<{citationRef:string;snippet:string;
 sourceTitle:string;sourceUrl:string|null;score:number;independentlyVerified:false}>;
 retrievalMethod:string;independentlyVerified:false};
const field={boxSizing:"border-box" as const,width:"100%",
 border:"1px solid #cbd5e1",borderRadius:8,padding:"9px 11px"};
const button={background:"#124d83",color:"#fff",border:0,
 borderRadius:8,padding:"9px 13px",fontWeight:650,cursor:"pointer"} as const;
export default function KnowledgeFabricStudio({identity}:{identity:Identity|null}){
 const [docs,setDocs]=useState<Document[]>([]);
 const [sourceKey,setSourceKey]=useState("");
 const [title,setTitle]=useState("");
 const [content,setContent]=useState("");
 const [url,setUrl]=useState("");
 const [scope,setScope]=useState("MKT-SCI-001,MKT-STR-001");
 const [accessMode,setAccessMode]=useState("AGENT_SCOPED");
 const [query,setQuery]=useState("sequencing genomics");
 const [results,setResults]=useState<Result|null>(null);
 const [reason,setReason]=useState("");
 const [topic,setTopic]=useState("");
 const [sector,setSector]=useState("");
 const [last,setLast]=useState<unknown>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 async function call(path:string,body?:unknown):Promise<unknown>{
  const response=await fetch("/api/marketing/learning/knowledge"+
    (path?"/"+path:""),{method:body===undefined?"GET":"POST",
    credentials:"same-origin",cache:"no-store",
    ...(body===undefined?{}:{headers:{"content-type":"application/json"},
     body:JSON.stringify(body)})});
  const data:unknown=await response.json();
  if(!response.ok)throw new Error(data&&typeof data==="object"&&"message" in data?
   String((data as {message:unknown}).message):
   "Knowledge operation was denied");
  return data;
 }
 async function refresh(){const data=await call("");setDocs(Array.isArray(data)?data as Document[]:[]);}
 useEffect(()=>{if(identity&&["ADMIN","SUPER_ADMIN","CMO","MARKETING_DIRECTOR"].includes(identity.role)){
  void refresh().catch(e=>setError(e instanceof Error?e.message:"Unable to load"));
 }},[identity?.userId,identity?.organizationId,identity?.role]);
 async function task(fn:()=>Promise<void>){
  setBusy(true);setError("");
  try{await fn();}catch(e){setError(e instanceof Error?e.message:"Operation failed");}
  finally{setBusy(false);}
 }
 if(!identity||!["ADMIN","SUPER_ADMIN","CMO","MARKETING_DIRECTOR"].includes(identity.role))return null;
 const isAdmin=["ADMIN","SUPER_ADMIN"].includes(identity.role);
 return <section aria-label="R3-H knowledge and learning fabric"
  style={{background:"#fff",border:"1px solid #cbd5e1",borderRadius:12,
   marginTop:20,padding:20}}>
  <h3 style={{marginTop:0}}>R3-H · Governed Knowledge & Agent Learning</h3>
  <p style={{fontSize:13,color:"#475569"}}>
   Curate tenant-specific evidence with immutable source digests and human review.
   Search combines PostgreSQL full-text with local sparse vectors. Results are
   <strong> reviewed source excerpts, not independently verified claims</strong>.
   No provider, model or web scraper is contacted.
  </p>
  {isAdmin&&<div>
   <h4>Quarantine a new source</h4>
   <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",
    gap:10}}>
    <label style={{fontSize:13}}>Source key
     <input style={field} value={sourceKey} onChange={e=>setSourceKey(e.target.value)}
      placeholder="Auto-generated on first submission"/></label>
    <label style={{fontSize:13}}>Source title
     <input style={field} value={title} onChange={e=>setTitle(e.target.value)}/></label>
    <label style={{fontSize:13}}>HTTPS source URL (optional)
     <input style={field} value={url} onChange={e=>setUrl(e.target.value)}/></label>
    <label style={{fontSize:13}}>Visibility
     <select style={field} value={accessMode}
      onChange={e=>setAccessMode(e.target.value)}>
      <option value="REVIEWERS_ONLY">Human reviewers only</option>
      <option value="AGENT_SCOPED">Specified canonical agents</option>
     </select></label>
   </div>
   {accessMode==="AGENT_SCOPED"&&<label style={{display:"block",
    fontSize:13,marginTop:9}}>Allowed agent IDs (comma separated)
    <input style={field} value={scope} onChange={e=>setScope(e.target.value)}/></label>}
   <label style={{display:"block",fontSize:13,marginTop:9}}>Source content (plain text)
    <textarea style={{...field,minHeight:130}} value={content}
     onChange={e=>setContent(e.target.value)} spellCheck={false}/>
   </label>
   <button disabled={busy} style={button} onClick={()=>void task(async()=>{
    const key=sourceKey||"local-"+crypto.randomUUID();
    if(!sourceKey)setSourceKey(key);
    const payload={sourceKey:key,title,text:content,sourceUrl:url||undefined,
     accessMode,agentScope:accessMode==="AGENT_SCOPED"?
      scope.split(",").map(s=>s.trim()).filter(Boolean):[]};
    setLast(await call("",payload));
    await refresh();
   })}>Submit to quarantine (not trusted yet)</button>
   <p style={{fontSize:12,color:"#64748b"}}>
    A different administrator must review the source before it is searchable.
    Editing a reviewed source requires a new source key and human review.
   </p>
  </div>}
  <h4>Search reviewed knowledge</h4>
  <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
   <input aria-label="Knowledge search query" style={{...field,flex:"1 1 280px"}}
    value={query} onChange={e=>setQuery(e.target.value)}/>
   <button style={button} disabled={busy} onClick={()=>void task(async()=>{
    setResults(await call("search",{query,limit:5}) as Result);
   })}>Search</button>
  </div>
  {results&&<div style={{marginTop:12,fontSize:13}}>
   <p>{results.results.length} cited result(s). Model and scientific verification: <strong>none</strong>.</p>
   {results.results.map(item=><div key={item.citationRef} style={{
    borderTop:"1px solid #e2e8f0",padding:"10px 0"}}>
    <strong>{item.sourceTitle}</strong> · rank {item.score.toFixed(3)}
    <div style={{color:"#475569",whiteSpace:"pre-wrap"}}>{item.snippet}</div>
    <code>{item.citationRef}</code>
    {item.sourceUrl&&<p><a target="_blank" rel="noopener noreferrer"
     href={item.sourceUrl}>Original source reference</a></p>}
   </div>)}
  </div>}
  <h4>Source governance</h4>
  {isAdmin&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",
   gap:10}}>
   <label style={{fontSize:13}}>Decision or revocation rationale
    <input style={field} value={reason} onChange={e=>setReason(e.target.value)}
     placeholder="12+ characters required"/></label>
   <label style={{fontSize:13}}>Learning topic
    <input style={field} value={topic} onChange={e=>setTopic(e.target.value)}/></label>
   <label style={{fontSize:13}}>Learning sector
    <input style={field} value={sector} onChange={e=>setSector(e.target.value)}/></label>
  </div>}
  <div style={{overflowX:"auto",marginTop:12}}>
   <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
    <thead><tr><th align="left">Source</th><th align="left">State</th>
     <th align="left">Agent scope</th><th align="left">Governance</th></tr></thead>
    <tbody>{docs.map(doc=><tr key={doc.id}>
     <td style={{padding:9,borderTop:"1px solid #e2e8f0"}}>
      <strong>{doc.title}</strong><div>{doc.sourceKey}</div></td>
     <td style={{padding:9,borderTop:"1px solid #e2e8f0"}}>{doc.status}</td>
     <td style={{padding:9,borderTop:"1px solid #e2e8f0"}}>
      {doc.accessMode==="REVIEWERS_ONLY"?"Reviewers only":doc.agentScope.join(", ")}</td>
     <td style={{padding:9,borderTop:"1px solid #e2e8f0"}}>
      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
       {isAdmin&&doc.status==="QUARANTINED"&&
        ["REVIEW","REJECT"].map(decision=><button key={decision}
         disabled={busy||reason.trim().length<12}
         style={{...button,background:decision==="REVIEW"?"#124d83":"#64748b"}}
         onClick={()=>void task(async()=>{setLast(await call(
          encodeURIComponent(doc.id)+"/review",{decision,reason}));await refresh();
         })}>{decision==="REVIEW"?"Review (other admin)":"Reject"}</button>)}
       {isAdmin&&doc.status==="REVIEWED"&&doc.sourceUrl&&
        <button disabled={busy||!topic.trim()||!sector.trim()} style={button}
         onClick={()=>void task(async()=>{setLast(await call(
          encodeURIComponent(doc.id)+"/promote",{topic,sector}));await refresh();
         })}>Create quarantined learning signal</button>}
       {isAdmin&&doc.status!=="REVOKED"&&
        <button disabled={busy||reason.trim().length<12}
         style={{...button,background:"#b91c1c"}}
         onClick={()=>void task(async()=>{setLast(await call(
          encodeURIComponent(doc.id)+"/revoke",{reason}));await refresh();
         })}>Revoke & scrub</button>}
      </div>
     </td>
    </tr>)}</tbody>
   </table>
  </div>
  {error&&<p role="alert" style={{color:"#b91c1c"}}>{error}</p>}
  {last!==null&&<pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere",
   padding:12,background:"#f8fafc",borderRadius:8,fontSize:12}}>
   {JSON.stringify(last,null,2)}</pre>}
 </section>;
}
