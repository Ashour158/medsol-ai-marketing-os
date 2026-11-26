"use client";
import {useState} from "react";
import {compareReviewedWatch,type WatchSelection} from "../lib/reviewed-market-watch";
import {reviewedMarketCsv,reviewedMarketWatchCsv,saveOfflineCsv} from "../lib/offline-evidence-csv";

type Identity={userId:string;organizationId:string;role:string}|null;
type MarketTopic={topic:string;sector:string;evidenceCount:number;
 recentSignals90Days:number;distinctSourceHosts:number;
 lastObservedAt:string;ageDays:number;
 freshness:"STALE"|"OBSERVED_WITHIN_90_DAYS";
 sourceCoverage:"SINGLE_OR_UNKNOWN_HOST"|"MULTIPLE_SOURCE_HOSTS";
 priority:"MONITOR"|"RESEARCH_PRIORITY";
 evidence:Array<{signalId:string;title:string;url:string;publishedAt:string|null}>;
 inferenceAuthorized:false;marketShareVerified:false;marketSizingVerified:false};
type Brief={organizationId:string;asOf:string;processed:number;
 registryWindowCappedAt:200;topics:MarketTopic[];
 independentVerification:false;externalPublishingEnabled:false};
type PersistentWatch={watchId:string;topic:string;sector:string;intervalHours:number;
 status:string;version:number;nextDueAt:string;lastEvaluatedAt:string|null;due:boolean;
 lastEvaluation:null|{status:string;evidenceCount:number;addedCount:number;removedCount:number;freshness:string};
 externalAcquisitionEnabled:false;automaticExecutionEnabled:false;independentVerification:false};
const shell={background:"#fff",padding:20,borderRadius:12,
 border:"1px solid #dbe4ed",marginTop:18};
const control={padding:"9px 12px",border:"1px solid #cbd5e1",
 borderRadius:7,background:"#fff"};

export default function MarketIntelligenceStudio({identity}:{identity:Identity}){
 const [brief,setBrief]=useState<Brief|null>(null);
 const [sector,setSector]=useState("");
 const [query,setQuery]=useState("");
 const [attention,setAttention]=useState<"ALL"|"RESEARCH_PRIORITY"|"STALE"|"SINGLE_SOURCE">("ALL");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [loadedFor,setLoadedFor]=useState("");
 const [watchTopic,setWatchTopic]=useState("");
 const [watchSector,setWatchSector]=useState("");
 const [watchInterval,setWatchInterval]=useState(24);
 const [persistent,setPersistent]=useState<{scope:string;rows:PersistentWatch[]}|null>(null);
 const [watchError,setWatchError]=useState("");
 const [watchBusy,setWatchBusy]=useState(false);
 const [watch,setWatch]=useState<{scope:string;baseline:Brief;selection:WatchSelection[]}|null>(null);
 const [comparison,setComparison]=useState<{scope:string;result:ReturnType<typeof compareReviewedWatch>}|null>(null);
 const scope=identity?identity.organizationId+":"+identity.userId:"";
 const canManage=!!identity&&["ADMIN","SUPER_ADMIN","CMO","MARKETING_DIRECTOR"].includes(identity.role.toUpperCase());
 async function watchCall(path:string,body?:unknown){
  const response=await fetch("/api/marketing/learning/watches"+path,{
   method:body===undefined?"GET":"POST",credentials:"same-origin",cache:"no-store",
   ...(body===undefined?{}:{headers:{"content-type":"application/json"},body:JSON.stringify(body)})});
  const value=await response.json();
  if(!response.ok)throw Error(typeof value.message==="string"?value.message:"Watch request denied");
  return value;
 }
 async function loadWatches(){
  const value=await watchCall("") as {watches:PersistentWatch[];automaticExecutionEnabled:false;externalAcquisitionEnabled:false};
  if(value.automaticExecutionEnabled!==false||value.externalAcquisitionEnabled!==false||
   !Array.isArray(value.watches)||value.watches.some(x=>x.independentVerification!==false||
   x.externalAcquisitionEnabled!==false||x.automaticExecutionEnabled!==false))
   throw Error("Unexpected watch provenance");
  setPersistent({scope,rows:value.watches});
 }
 async function runWatch(task:()=>Promise<void>){
  setWatchBusy(true);setWatchError("");
  try{await task();}catch(e){setWatchError(e instanceof Error?e.message:"Watch request rejected");}
  finally{setWatchBusy(false);}
 }
 async function refresh(){
  setBusy(true);setError("");setBrief(null);setComparison(null);
  try{
   const response=await fetch("/api/marketing/learning/trends",{
    credentials:"same-origin",cache:"no-store"
   });
   const body=await response.json() as Brief|{message?:string};
   if(!response.ok)throw Error("message" in body?
    body.message||"Market intelligence denied":"Market intelligence unavailable");
   setBrief(body as Brief);setLoadedFor(scope);
  }catch(e){setError(e instanceof Error?e.message:"Market intelligence unavailable");}
  finally{setBusy(false);}
 }
 if(!identity)return null;
 const visible=loadedFor===scope?brief:null;
 const activeWatch=watch?.scope===scope?watch:null;
 const activeComparison=comparison?.scope===scope&&comparison.result.currentAsOf===visible?.asOf?comparison.result:null;
 const topics=(visible?.topics??[]).filter(x=>
  (!sector||x.sector.toLowerCase().includes(sector.trim().toLowerCase()))&&
  (!query||x.topic.toLowerCase().includes(query.trim().toLowerCase()))&&
  (attention==="ALL"||
   (attention==="RESEARCH_PRIORITY"&&x.priority==="RESEARCH_PRIORITY")||
   (attention==="STALE"&&x.freshness==="STALE")||
   (attention==="SINGLE_SOURCE"&&x.sourceCoverage==="SINGLE_OR_UNKNOWN_HOST")));
 return <section aria-label="Reviewed market intelligence" id="market-intelligence"
  style={shell}>
  <h3 style={{margin:"0 0 6px"}}>Market Intelligence · Reviewed Evidence</h3>
  <p style={{fontSize:12,color:"#475569"}}>
   Intelligence is assembled exclusively from existing tenant-owned, human-reviewed
   LearningSignals and eligible source documents. Source-host diversity and
   observation recency are research-triage indicators, never proof of market
   size, product fit, competitor share or scientific truth. No web crawling,
   live model calls, or publishing occurs here.
  </p>
  <button type="button" disabled={busy} onClick={()=>void refresh()} style={{
   padding:"9px 13px",borderRadius:7,border:0,background:"#124d83",
   color:"white",cursor:"pointer"}}>{busy?"Loading…":"Refresh reviewed market intelligence"}</button>
  {canManage&&<section aria-label="Persistent reviewed-evidence watches" style={{border:"1px solid #dbe4ed",borderRadius:8,padding:12,marginTop:16}}>
   <h4 style={{margin:"0 0 8px"}}>Durable market watch registry</h4>
   <p style={{fontSize:12}}>Configure an exact topic and sector. Due evaluations compare reviewed evidence IDs in PostgreSQL. No autonomous scheduler or external source acquisition is active.</p>
   <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
    <label style={{fontSize:12}}>Watch topic<input style={{...control,display:"block"}} maxLength={180} value={watchTopic} onChange={e=>setWatchTopic(e.target.value)}/></label>
    <label style={{fontSize:12}}>Watch sector<input style={{...control,display:"block"}} maxLength={120} value={watchSector} onChange={e=>setWatchSector(e.target.value)}/></label>
    <label style={{fontSize:12}}>Evaluation interval<select style={{...control,display:"block"}} value={watchInterval} onChange={e=>setWatchInterval(Number(e.target.value))}>
     <option value={24}>Daily</option><option value={72}>Every three days</option><option value={168}>Weekly</option>
    </select></label>
   </div>
   <div style={{display:"flex",gap:8,marginTop:10,flexWrap:"wrap"}}>
    <button type="button" style={control} disabled={watchBusy||!watchTopic.trim()||!watchSector.trim()} onClick={()=>void runWatch(async()=>{
     await watchCall("",{topic:watchTopic,sector:watchSector,intervalHours:watchInterval});await loadWatches();
    })}>Create durable market watch</button>
    <button type="button" style={control} disabled={watchBusy} onClick={()=>void runWatch(loadWatches)}>Refresh persistent watches</button>
   </div>
   {watchError&&<p role="alert" style={{color:"#b91c1c"}}>{watchError}</p>}
   {persistent?.scope===scope&&persistent.rows.map(row=><article key={row.watchId} style={{borderTop:"1px solid #e2e8f0",padding:"10px 0",fontSize:12}}>
    <strong>{row.topic} · {row.sector} · {row.status}</strong>
    <p>Version {row.version} · {row.due?"Due for manual evaluation":"Not due"} · next: {row.nextDueAt}</p>
    {row.lastEvaluation&&<p>{row.lastEvaluation.status} · reviewed records {row.lastEvaluation.evidenceCount} · added {row.lastEvaluation.addedCount} · removed {row.lastEvaluation.removedCount} · {row.lastEvaluation.freshness}</p>}
    <div style={{display:"flex",gap:8}}>
     {([["EVALUATE_DUE","Evaluate due watch",row.due],["PAUSE","Pause watch",row.status==="ACTIVE"],["RESUME","Resume watch",row.status==="PAUSED"]] as const).filter(x=>x[2]).map(([action,label])=><button type="button" key={action} style={control} disabled={watchBusy} onClick={()=>void runWatch(async()=>{
      await watchCall("/"+encodeURIComponent(row.watchId)+"/transition",{action,expectedVersion:row.version});await loadWatches();
     })}>{label}</button>)}
    </div>
   </article>)}
  </section>}
  {error&&<p role="alert" style={{color:"#b91c1c"}}>{error}</p>}
  {visible&&<>
   <p role="status" style={{fontSize:12,color:"#475569"}}>
    {visible.processed} reviewed signal records inspected (up to 200) ·
    {visible.topics.length} grouped topics · source snapshot {visible.asOf}.
    Independent verification: <strong>not performed</strong>.
   </p>
   <p style={{fontSize:12,color:"#475569"}}>
    Evidence triage: {visible.topics.filter(x=>x.freshness==="STALE").length} stale
    topic(s) · {visible.topics.filter(x=>x.priority==="RESEARCH_PRIORITY").length}
    {" "}research-priority topic(s) ·
    {" "}{visible.topics.filter(x=>x.sourceCoverage==="SINGLE_OR_UNKNOWN_HOST").length}
    {" "}single/unknown source topic(s). This is a read-only review queue,
    not a running watchlist, market fact verification or external crawler.
   </p>
   <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
    <label style={{fontSize:12}}>Evidence attention queue
     <select style={{...control,display:"block"}} value={attention}
      onChange={e=>setAttention(e.target.value as typeof attention)}>
      <option value="ALL">All reviewed topics</option>
      <option value="RESEARCH_PRIORITY">Research priority</option>
      <option value="STALE">Stale evidence</option>
      <option value="SINGLE_SOURCE">Single/unknown source</option>
     </select>
    </label>
    <label style={{fontSize:12}}>Filter sector
     <input style={{...control,display:"block"}} value={sector}
      onChange={e=>setSector(e.target.value)} maxLength={100}
      placeholder="e.g. biotechnology"/></label>
    <label style={{fontSize:12}}>Filter research topic
     <input style={{...control,display:"block"}} value={query}
      onChange={e=>setQuery(e.target.value)} maxLength={100}
      placeholder="e.g. proteomics"/></label>
   </div>
   <button type="button" style={{...control,marginTop:12,cursor:"pointer"}}
    onClick={()=>{
     try{saveOfflineCsv(reviewedMarketCsv(visible,topics,identity.organizationId),
      "medsol-reviewed-market-signals.csv");setError("");}
     catch(e){setError(e instanceof Error?e.message:"Market export blocked");}
    }}>Export filtered reviewed intelligence (unsigned CSV)</button>
   <section aria-label="Reviewed evidence change watch" style={{marginTop:14,padding:12,
    border:"1px solid #dbe4ed",borderRadius:9}}>
    <strong>Reviewed evidence change watch · session only</strong>
    <p style={{fontSize:12,color:"#475569"}}>
     Filter to 1–20 topics, capture a baseline, refresh the canonical reviewed registry,
     and compare. No background polling, crawling or market-change verification.
    </p>
    <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
     <button type="button" style={control} disabled={topics.length<1||topics.length>20}
      onClick={()=>{setWatch({scope,baseline:visible,selection:topics.map(t=>({sector:t.sector,topic:t.topic}))});
       setComparison(null);setError("");}}>Capture filtered watch baseline ({topics.length})</button>
     <button type="button" style={control} disabled={!activeWatch||Date.parse(visible.asOf)<=Date.parse(activeWatch.baseline.asOf)}
      onClick={()=>{
       if(!activeWatch)return;
       try{setComparison({scope,result:compareReviewedWatch(activeWatch.baseline,visible,
        activeWatch.selection,identity.organizationId)});setError("");}
       catch(e){setComparison(null);setError(e instanceof Error?e.message:"Watch comparison blocked");}
      }}>Compare refreshed reviewed evidence</button>
     <button type="button" style={control} disabled={!activeComparison||!activeWatch}
      onClick={()=>{
       if(!activeComparison||!activeWatch)return;
       try{saveOfflineCsv(reviewedMarketWatchCsv(activeWatch.baseline,visible,
        activeWatch.selection,identity.organizationId,activeComparison),"medsol-reviewed-watch.csv");setError("");}
       catch(e){setError(e instanceof Error?e.message:"Watch export blocked");}
      }}>Export reviewed watch CSV</button>
     <button type="button" style={control} disabled={!activeWatch} onClick={()=>{
      setWatch(null);setComparison(null);setError("");
     }}>Clear watch</button>
    </div>
    {activeWatch&&<p style={{fontSize:12}}>Baseline: {activeWatch.baseline.asOf} ·
      {activeWatch.selection.length} selected topics. Refresh to obtain a new snapshot.</p>}
    {activeComparison&&<div role="status" style={{fontSize:12}}>
     {activeComparison.windowMayBeIncomplete&&<p>At least one source window reached its 200-record cap.</p>}
     {activeComparison.changes.map(c=><p key={JSON.stringify([c.sector,c.topic])}>
      {c.sector} · {c.topic}: <strong>{c.status.replaceAll("_"," ")}</strong>
      {" "}({c.baselineSignals} → {c.currentSignals??"not in current window"} reviewed records).
      {c.changedFields.length>0&&" Changed: "+c.changedFields.join(", ")}
     </p>)}
     <p>Missing topics may be outside the bounded window or no longer review-eligible.
      Neither a change nor disappearance proves market movement.</p>
    </div>}
   </section>
   <div style={{display:"grid",gap:12,marginTop:14}}>
    {topics.map(x=><article key={x.sector+"::"+x.topic} style={{
      border:"1px solid #dbe4ed",borderRadius:9,padding:12}}>
     <strong>{x.topic}</strong> <span style={{color:"#64748b"}}>· {x.sector}</span>
     <p style={{margin:"8px 0",fontSize:12}}>
      Research signal: <strong>{x.priority.replaceAll("_"," ")}</strong> ·
      {x.evidenceCount} reviewed records · {x.recentSignals90Days} observed within
      90 days · {x.distinctSourceHosts} distinct HTTPS source hosts ·
      {x.freshness==="STALE"?"Stale evidence":"Recent observations"}.
     </p>
     <details><summary style={{fontSize:12,cursor:"pointer"}}>
      Show {x.evidence.length} cited source references (not independently verified)
     </summary>
      <ul style={{fontSize:12}}>
       {x.evidence.map(item=><li key={item.signalId}>
        {item.title} · <code>{item.url}</code>
        {item.publishedAt?" · "+String(item.publishedAt).slice(0,10):""}
       </li>)}
      </ul>
     </details>
    </article>)}
    {topics.length===0&&<p style={{fontSize:12,color:"#64748b"}}>
     No reviewed evidence matching these filters. This is not proof of no market demand.
    </p>}
   </div>
  </>}
 </section>;
}
