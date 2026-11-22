"use client";
import {useEffect,useRef,useState} from "react";
import {CAMPAIGN_STAGE_ORDER,campaignReadiness,isCampaignSummary,campaignReadinessPageBounds,
 portfolioReadinessSummary,type PortfolioReadinessRow} from "../lib/campaign-readiness";

type Identity={userId:string;organizationId:string;email:string;role:string};
const section={padding:20,borderRadius:14,background:"#fff",marginTop:20,
 border:"1px solid #dce5ed"};
const button={background:"#124d83",color:"#fff",fontWeight:650 as const,
 border:0,borderRadius:8,padding:"9px 14px",cursor:"pointer"};
async function get(path:string):Promise<unknown>{
 const r=await fetch("/api/marketing/"+path,{method:"GET",cache:"no-store",
  credentials:"same-origin"});
 let data:unknown;
 try{data=await r.json()}catch{throw Error("Invalid response to "+path)}
 if(!r.ok)throw Error("Request rejected ("+r.status+")");
 return data;
}
function unknown(id:string,name:string,reason:string):PortfolioReadinessRow{
 return{kind:"UNKNOWN",id,name,reason};
}
/** A read-only command board; every campaign journey remains server-tenant scoped.
 * No batch side effects, no approval shortcuts, no spoofed status or provider calls.
 */
export default function CampaignReadinessBoard({identity}:{identity:Identity|null}){
 const [rows,setRows]=useState<PortfolioReadinessRow[]>([]);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState("");
 const [loaded,setLoaded]=useState(false);
 const [count,setCount]=useState(0);
 const [campaignList,setCampaignList]=useState<Array<{id:string;name:string;code:string;status:string}>>([]);
 const [page,setPage]=useState(0);
 const [filter,setFilter]=useState("ALL");
 const epoch=useRef(0);
 useEffect(()=>{
  epoch.current++;setRows([]);setLoaded(false);setLoading(false);setError("");
  setCount(0);setCampaignList([]);setPage(0);setFilter("ALL");
 },[identity?.organizationId,identity?.userId]);
 async function loadPage(
  list:Array<{id:string;name:string;code:string;status:string}>,
  nextPage:number,current:number
 ){
  const bounds=campaignReadinessPageBounds(list.length,nextPage);
  const source=list.slice(bounds.start,bounds.end);
  const results:PortfolioReadinessRow[]=Array(source.length);
  let cursor=0;
  // Bound fan-out at four tenant-authenticated reads, never combine tenant data.
  const workers=Array.from({length:Math.min(source.length,4)},async()=>{
   while(true){
    const pos=cursor++;
    if(pos>=source.length)return;
    const campaign=source[pos]!;
    try{
     const journey=await get("journeys/"+encodeURIComponent(campaign.id));
     if(current!==epoch.current)return;
     results[pos]={kind:"KNOWN",item:campaignReadiness(journey,campaign.id)};
    }catch(e){
     results[pos]=unknown(campaign.id,campaign.name,
      e instanceof Error?e.message:"Journey unavailable");
    }
   }
  });
  await Promise.all(workers);
  if(current!==epoch.current)return;
  setRows(results);setPage(nextPage);setCount(list.length);setLoaded(true);
 }
 async function refresh(){
  if(!identity||loading)return;
  const current=++epoch.current;
  setLoading(true);setError("");setLoaded(false);setRows([]);setCount(0);
  setCampaignList([]);setPage(0);
  try{
   const list=await get("campaigns");
   if(!Array.isArray(list)||list.length>100||!list.every(isCampaignSummary))
    throw Error("Authoritative tenant campaign listing is malformed or exceeds 100");
   const ids=new Set(list.map(x=>x.id));
   if(ids.size!==list.length)
    throw Error("Campaign listing contains duplicate identities");
   if(current!==epoch.current)return;
   setCampaignList(list);
   await loadPage(list,0,current);
  }catch(e){
   if(current===epoch.current)setError(e instanceof Error?e.message:"Portfolio retrieval failed");
  }finally{
   if(current===epoch.current)setLoading(false);
  }
 }
 async function changePage(nextPage:number){
  if(!identity||loading||nextPage<0||nextPage>=campaignReadinessPageBounds(campaignList.length,0).pages)return;
  const current=++epoch.current;
  setLoading(true);setError("");setRows([]);setLoaded(false);setFilter("ALL");
  try{await loadPage(campaignList,nextPage,current);}
  catch(e){if(current===epoch.current)
   setError(e instanceof Error?e.message:"Campaign page unavailable");}
  finally{if(current===epoch.current)setLoading(false);}
 }
 const summary=portfolioReadinessSummary(rows);
 const visible=rows.filter(x=>filter==="ALL"||
  (x.kind==="UNKNOWN"?filter==="UNKNOWN":x.item.state===filter));
 return <section id="readiness-board" aria-label="Campaign readiness board"
  style={{...section,scrollMarginTop:120}}>
  <h2 style={{marginTop:0,color:"#124d83"}}>Campaign readiness & blocker board</h2>
  <p style={{color:"#475569",fontSize:13}}>
   Tenant-scoped, read-only view of the existing campaign journey, approval, creative,
   simulation, performance and learning ledgers. All ten gates are <strong>offline
   simulation milestones</strong>, not real delivery or production certification.
  </p>
  <button style={button} type="button" disabled={!identity||loading}
   onClick={()=>void refresh()}>
   {loading?"Checking tenant campaigns…":"Refresh campaign readiness"}
  </button>
  {!identity&&<p>Authenticate to inspect your tenant campaigns.</p>}
  {error&&<p role="alert" style={{color:"#b91c1c"}}>{error}</p>}
  {loaded&&<>
   <p role="status" style={{fontSize:13,color:"#475569"}}>
    Inspected page {page+1} of {Math.max(1,Math.ceil(count/25))}:
    {summary.campaignsChecked} of {count} listed campaigns (maximum 25 per page, 100 per listing).
   </p>
   <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:14}}>
    <button type="button" disabled={loading||page===0}
     onClick={()=>void changePage(page-1)}>Previous 25</button>
    <span style={{fontSize:13}}>Campaigns {count===0?0:page*25+1}–{Math.min(count,(page+1)*25)}</span>
    <button type="button" disabled={loading||(page+1)*25>=count}
     onClick={()=>void changePage(page+1)}>Next 25</button>
   </div>
   <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:14}}>
    {[
     ["Inspected",summary.campaignsChecked],
     ["Incomplete",summary.incomplete],
     ["Blocked",summary.blocked],
     ["Unknown / inaccessible",summary.unknown],
     ["Offline journey complete",summary.simulatedComplete]
    ].map(([label,value])=><div key={label} style={{padding:"12px 16px",
      background:"#f8fafc",border:"1px solid #dbe4ed",borderRadius:9,
      minWidth:125}}>
      <div style={{fontSize:22,fontWeight:700,color:"#124d83"}}>{value}</div>
      <div style={{fontSize:12,color:"#475569"}}>{label}</div>
     </div>)}
   </div>
   <label style={{display:"block",fontSize:13,marginBottom:12}}>
    Filter operator state{" "}
    <select aria-label="Filter readiness" value={filter}
     onChange={e=>setFilter(e.target.value)}
     style={{padding:8,borderRadius:8,border:"1px solid #cbd5e1"}}>
     {["ALL","INCOMPLETE","BLOCKED","UNKNOWN","SIMULATION_COMPLETE"].map(x=>
      <option key={x} value={x}>{x.replaceAll("_"," ")}</option>)}
    </select>
   </label>
   {visible.length===0?<p>No campaigns match this filter.</p>:
    <div style={{display:"grid",gap:12}}>
     {visible.map(row=>row.kind==="UNKNOWN"?
      <article key={row.id} style={{padding:16,border:"1px solid #fca5a5",
       borderRadius:10}}>
       <strong>{row.name}</strong> — <span style={{color:"#b91c1c"}}>
       UNKNOWN: {row.reason}</span>
       <p style={{fontSize:12}}>No readiness assessment is possible for this campaign.
        This is not a passing result.</p>
      </article>:
      <article key={row.item.id} style={{padding:16,
       border:"1px solid #dbe4ed",borderRadius:10}}>
       <div style={{display:"flex",justifyContent:"space-between",
        alignItems:"baseline",flexWrap:"wrap",gap:10}}>
        <strong>{row.item.name} <span style={{fontSize:12,color:"#64748b"}}>
         {row.item.code}</span></strong>
        <span style={{fontSize:13,fontWeight:700}}>
         {row.item.completed}/{row.item.total} offline gates • {row.item.state.replaceAll("_"," ")}
        </span>
       </div>
       <div style={{width:"100%",height:8,background:"#e2e8f0",
        borderRadius:8,overflow:"hidden",marginTop:10}}>
        <div style={{height:"100%",background:"#124d83",
         width:(row.item.completed/row.item.total*100)+"%"}}/>
       </div>
       <p style={{fontSize:12,color:"#475569",marginBottom:5}}>
        Campaign: {row.item.campaignStatus} · Workflow: {row.item.workflowStatus}
       </p>
       <details>
        <summary style={{cursor:"pointer",fontSize:13}}>
         {row.item.blockers.length} missing evidence gates — inspect next actions
        </summary>
        {row.item.blockers.length===0?
         <p>Offline gates complete. Real publishing and production remain prohibited.</p>:
         <ol style={{fontSize:13}}>
          {row.item.blockers.map(b=><li key={b.key} style={{padding:"4px 0"}}>
           {b.label} · <a href={"#"+b.workspace}>Open {b.workspace} workspace</a>
          </li>)}
         </ol>}
       </details>
      </article>)}
    </div>}
   <p style={{fontSize:12,color:"#64748b"}}>
    Does not authorize provider connections, publishing, sending email,
    finance postings, or automatic promotion. The existing operator
    workspaces and server-side human approval rules remain authoritative.
   </p>
  </>}
 </section>;
}
