"use client";
import {useState} from "react";
import {reviewedMarketCsv,saveOfflineCsv} from "../lib/offline-evidence-csv";

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
 const scope=identity?identity.organizationId+":"+identity.userId:"";
 async function refresh(){
  setBusy(true);setError("");setBrief(null);
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
