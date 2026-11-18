"use client";
import {useCallback,useState} from "react";

type Identity={userId:string;organizationId:string;email:string;role:string};
type Snapshot={
 asOf:string;health:string;totals:Record<string,number>;
 incidents:Array<{id:string;severity:string;kind:string;message:string;runId:string|null}>;
 brainRuns:Array<{id:string;status:string;currentAgentId:string|null;updatedAt:string}>;
 modelBudget:{enabled:boolean;estimatedSpentMicros?:string;verifiedBilledMicros?:string;awaitingInvoiceCount?:number};
 brand:{approved:boolean;version:number|null};
 learning:{topics:Array<{topic:string;sector:string;recentSignals90Days:number;distinctSourceHosts:number;status:string}>};
 controls:{externalPublishingEnabled:boolean;autonomousSkillPromotionEnabled:boolean;modelProviderEnabled:boolean};
};
type BrandRevision={id:string;version:number;status:string;proposedBy:string;sourceReference:string};
type Signal={id:string;topic:string;sourceTitle:string;sourceUrl:string;status:string};
type Proposal={id:string;agentId:string;skillKey:string;status:string};
type Agent={id:string;name:string;capabilities:string[]};

export default function OperationsConsole({identity,onRunSelected}:{identity:Identity|null;onRunSelected:(id:string)=>void}){
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null);
 const [brand,setBrand]=useState<{version:number;rules:unknown;sourceReference:string}|null>(null);
 const [revisions,setRevisions]=useState<BrandRevision[]>([]);
 const [signals,setSignals]=useState<Signal[]>([]);
 const [proposals,setProposals]=useState<Proposal[]>([]);
 const [agents,setAgents]=useState<Agent[]>([]);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [researchQuery,setResearchQuery]=useState("");
 const [researchSector,setResearchSector]=useState("genomics");
 const [reviewSignalId,setReviewSignalId]=useState("");
 const [skillAgent,setSkillAgent]=useState("");
 const [skillKey,setSkillKey]=useState("");
 const [skillReason,setSkillReason]=useState("");
 const [selectedProposal,setSelectedProposal]=useState("");
 const [decisionReason,setDecisionReason]=useState("");
 const [brandSource,setBrandSource]=useState("");
 const [brandVoice,setBrandVoice]=useState("");
 const [brandColor,setBrandColor]=useState("#125A83");
 const [prohibited,setProhibited]=useState("");
 const [disclaimers,setDisclaimers]=useState("");
 const [selectedRevision,setSelectedRevision]=useState("");
 const [brandDecisionReason,setBrandDecisionReason]=useState("");
 const manageable=!!identity&&["SUPER_ADMIN","ADMIN","MARKETING_DIRECTOR","CMO"].includes(identity.role.toUpperCase());
 const button={padding:"9px 13px",border:0,borderRadius:7,background:"#124d83",color:"#fff",fontWeight:700 as const,cursor:"pointer"};
 const field={padding:10,border:"1px solid #cbd5e1",borderRadius:7,width:"100%",boxSizing:"border-box" as const,marginTop:6,background:"#fff"};
 const surface={border:"1px solid #e0e7ef",borderRadius:12,padding:16,background:"#f8fafc"};
 const call=async(path:string,data?:unknown)=>{
  const response=await fetch("/api/marketing/"+path,{method:data===undefined?"GET":"POST",
   headers:data===undefined?{}:{"content-type":"application/json"},
   ...(data===undefined?{}:{body:JSON.stringify(data)}),cache:"no-store"});
  const result=await response.json();
  if(!response.ok)throw new Error(typeof result.message==="string"?result.message:"Operation failed ("+response.status+")");
  return result;
 };
 const load=useCallback(async()=>{
  const [snap,active,list,evidence,skills,roster]=await Promise.all([
   call("command-center"),call("brand/active"),call("brand/revisions"),
   call("learning/signals"),call("learning/proposals"),call("agents")]);
  setSnapshot(snap as Snapshot);
  setBrand(active as typeof brand);
  setRevisions(list as BrandRevision[]);setSignals(evidence as Signal[]);
  setProposals(skills as Proposal[]);setAgents(roster as Agent[]);
 },[]);
 async function act(action:()=>Promise<void>){
  setBusy(true);setError("");setNotice("");
  try{await action();}catch(e){setError(e instanceof Error?e.message:"Unexpected error");}
  finally{setBusy(false);}
 }
 const availableSkills=agents.find(x=>x.id===skillAgent)?.capabilities??[];
 const claims=(value:string)=>value.split("\n").map(x=>x.trim()).filter(Boolean);
 if(!identity)return <section style={{...surface,marginTop:18}}><h2>Operations & Intelligence Console</h2><p>Sign in and load your authenticated workspace to inspect governed operations.</p></section>;
 return <section id="operations-console" style={{background:"#fff",borderRadius:14,padding:24,marginTop:20}}>
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
   <div><h2 style={{margin:"0 0 5px"}}>Operations & Intelligence Console</h2>
    <p style={{color:"#64748b",margin:0,fontSize:13}}>Live tenant-scoped controls · approval and publishing remain separate authorities</p></div>
   <button style={button} disabled={busy||!manageable} onClick={()=>act(load)}>Refresh operational snapshot</button>
  </div>
  {!manageable&&<p style={{color:"#9a3412"}}>Manager-level audit permission required for this console.</p>}
  {snapshot&&<div style={{marginTop:18}}>
   <div style={{...surface,borderLeft:"4px solid "+(snapshot.health==="ACTION_REQUIRED"?"#b91c1c":snapshot.health==="ATTENTION"?"#b45309":"#15803d")}}>
    <strong>Operational status: {snapshot.health.replaceAll("_"," ")}</strong>
    <div style={{fontSize:12,color:"#64748b",marginTop:4}}>Observed {new Date(snapshot.asOf).toLocaleString()} · monitoring is not an uptime SLA</div>
   </div>
   <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(155px,1fr))",gap:10,marginTop:12}}>
    {Object.entries(snapshot.totals).filter(([k])=>["brainRuns","pendingApprovals","pendingSkillDecisions","failedAgentExecutions","interventionBrainRuns","staleBrainRuns"].includes(k))
     .map(([k,v])=><div key={k} style={surface}><strong style={{fontSize:24,color:"#124d83"}}>{v}</strong><div style={{fontSize:12,color:"#475569"}}>{k.replace(/([A-Z])/g," $1")}</div></div>)}
   </div>
   <h3>Incidents requiring investigation ({snapshot.incidents.length})</h3>
   {snapshot.incidents.length===0?<p style={{color:"#64748b"}}>No incidents detected by the current checks.</p>:
    <div style={{display:"grid",gap:8}}>{snapshot.incidents.map(issue=><div key={issue.id} style={{...surface,background:issue.severity==="CRITICAL"?"#fff8f8":"#fffcf4"}}>
      <strong>{issue.severity} · {issue.kind.replaceAll("_"," ")}</strong>
      <div style={{fontSize:13,margin:"6px 0"}}>{issue.message}</div>
      {issue.runId&&<button disabled={busy} onClick={()=>onRunSelected(issue.runId!)}>Inspect Brain run {issue.runId.slice(0,10)}</button>}
     </div>)}</div>}
   <h3>Recent Brain runs</h3>
   {snapshot.brainRuns.length===0?<p style={{color:"#64748b"}}>No recorded Brain runs.</p>:<div style={{overflowX:"auto"}}>
    <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,textAlign:"left"}}><thead><tr><th>Run</th><th>State</th><th>Current agent</th><th>Inspect</th></tr></thead>
    <tbody>{snapshot.brainRuns.map(r=><tr key={r.id} style={{borderTop:"1px solid #e2e8f0"}}>
     <td style={{padding:9}}>{r.id.slice(0,12)}</td><td>{r.status}</td><td>{r.currentAgentId??"—"}</td>
     <td><button disabled={busy} onClick={()=>onRunSelected(r.id)}>Open</button></td>
    </tr>)}</tbody></table></div>}
   <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(235px,1fr))",gap:12,marginTop:16}}>
    <div style={surface}><h3 style={{marginTop:0}}>Model finance</h3>{snapshot.modelBudget.enabled?<>
     <div>Budget estimate: {snapshot.modelBudget.estimatedSpentMicros??"0"} micro-units</div>
     <div>Invoice verified: {snapshot.modelBudget.verifiedBilledMicros??"0"} micro-units</div>
     <div>Unreconciled calls: {snapshot.modelBudget.awaitingInvoiceCount??0}</div>
     </>:<p>No tenant model budget provisioned.</p>}
     <small>Estimates and provider invoices are different financial records.</small></div>
    <div style={surface}><h3 style={{marginTop:0}}>Governance</h3>
     <div>Brand: {snapshot.brand.approved?"Approved v"+snapshot.brand.version:"No approved master"}</div>
     <div>Model: {snapshot.controls.modelProviderEnabled?"Configured":"Disabled"}</div>
     <div>External publishing: {snapshot.controls.externalPublishingEnabled?"Enabled":"Disabled"}</div>
     <div>Self-promoting skills: {snapshot.controls.autonomousSkillPromotionEnabled?"Enabled":"Disabled"}</div></div>
   </div>
   <h3>Reviewed trend signals (not independently verified)</h3>
   {snapshot.learning.topics.length===0?<p style={{color:"#64748b"}}>No reviewed learning signals.</p>:
    <ul>{snapshot.learning.topics.map((t,i)=><li key={t.topic+i}><strong>{t.topic}</strong> · {t.sector} · {t.recentSignals90Days} signals in 90 days, {t.distinctSourceHosts} source hosts</li>)}</ul>}
  </div>}
  {manageable&&<div style={{marginTop:20,display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(275px,1fr))",gap:14}}>
   <div style={surface}>
    <h3 style={{marginTop:0}}>Scientific research intake</h3>
    <label>Topic<input style={field} value={researchQuery} onChange={e=>setResearchQuery(e.target.value)} placeholder="long-read sequencing"/></label>
    <label style={{display:"block",marginTop:10}}>Sector<select style={field} value={researchSector} onChange={e=>setResearchSector(e.target.value)}>
     {["genomics","sequencing","molecular diagnostics","proteomics","cell therapy","precision medicine","biotechnology","digital pathology","pathology","clinical research","biobanking"].map(s=><option key={s} value={s}>{s}</option>)}
    </select></label>
    <button style={{...button,marginTop:12}} disabled={busy||!researchQuery.trim()} onClick={()=>act(async()=>{const result=await call("learning/discover",{query:researchQuery.trim(),sector:researchSector,maxResults:5});setNotice("Imported "+result.count+" quarantined literature records.");await load();})}>Discover public literature</button>
    <label style={{display:"block",marginTop:14}}>Review quarantined source<select style={field} value={reviewSignalId} onChange={e=>setReviewSignalId(e.target.value)}>
     <option value="">Choose source</option>{signals.filter(s=>s.status==="QUARANTINED").map(s=><option key={s.id} value={s.id}>{s.sourceTitle.slice(0,55)}</option>)}
    </select></label>
    <button style={{...button,marginTop:10}} disabled={busy||!reviewSignalId} onClick={()=>act(async()=>{await call("learning/verify",{signalId:reviewSignalId});setReviewSignalId("");setNotice("Human-reviewed metadata. Scientific verification NOT established.");await load();})}>Mark metadata reviewed</button>
   </div>
   <div style={surface}>
    <h3 style={{marginTop:0}}>Governed skills</h3>
    <label>Reviewed source<select style={field} value={reviewSignalId} onChange={e=>setReviewSignalId(e.target.value)}>
     <option value="">Choose reviewed evidence</option>{signals.filter(s=>s.status==="REVIEWED").map(s=><option key={s.id} value={s.id}>{s.sourceTitle.slice(0,55)}</option>)}
    </select></label>
    <label style={{display:"block",marginTop:10}}>Agent<select style={field} value={skillAgent} onChange={e=>{setSkillAgent(e.target.value);setSkillKey("");}}>
     <option value="">Choose agent</option>{agents.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
    </select></label>
    <label style={{display:"block",marginTop:10}}>Existing capability<select style={field} value={skillKey} onChange={e=>setSkillKey(e.target.value)}>
     <option value="">Choose capability</option>{availableSkills.map(s=><option key={s}>{s}</option>)}
    </select></label>
    <label style={{display:"block",marginTop:10}}>Proposal rationale<textarea style={field} value={skillReason} onChange={e=>setSkillReason(e.target.value)} rows={2}/></label>
    <button style={{...button,marginTop:10}} disabled={busy||!reviewSignalId||!skillAgent||!skillKey||!skillReason.trim()}
     onClick={()=>act(async()=>{await call("learning/proposals",{signalId:reviewSignalId,agentId:skillAgent,skillKey,rationale:skillReason.trim()});setNotice("Skill proposed; activation remains prohibited.");await load();})}>Propose governed skill</button>
    <label style={{display:"block",marginTop:16}}>Skill decision<select style={field} value={selectedProposal} onChange={e=>setSelectedProposal(e.target.value)}>
     <option value="">Choose proposal</option>{proposals.filter(p=>["PROPOSED","EVALUATED"].includes(p.status)).map(p=><option value={p.id} key={p.id}>{p.agentId} · {p.skillKey} ({p.status})</option>)}
    </select></label>
    <div style={{display:"flex",gap:8,marginTop:10,flexWrap:"wrap"}}>
     <button style={button} disabled={busy||!selectedProposal||proposals.find(p=>p.id===selectedProposal)?.status!=="PROPOSED"}
      onClick={()=>act(async()=>{await call("learning/skills/evaluate",{proposalId:selectedProposal});setNotice("Safety regression recorded; human release still required.");await load();})}>Evaluate</button>
    </div>
    <label style={{display:"block",marginTop:10}}>Release decision rationale<input style={field} value={decisionReason} onChange={e=>setDecisionReason(e.target.value)}/></label>
    <div style={{display:"flex",gap:8,marginTop:10,flexWrap:"wrap"}}>
     {(["APPROVE","REJECT"] as const).map(d=><button key={d} style={{...button,background:d==="REJECT"?"#a12b2b":"#124d83"}}
      disabled={busy||!selectedProposal||decisionReason.trim().length<12||proposals.find(p=>p.id===selectedProposal)?.status!=="EVALUATED"}
      onClick={()=>act(async()=>{await call("learning/skills/decide",{proposalId:selectedProposal,decision:d,reason:decisionReason.trim()});setNotice("Skill decision recorded; deployment requires code review.");await load();})}>{d==="APPROVE"?"Approve for code release":"Reject"}</button>)}
    </div>
   </div>
   <div style={surface}>
    <h3 style={{marginTop:0}}>Authoritative Brand Master</h3>
    <p style={{fontSize:12,color:"#64748b"}}>Active master: {brand?"Version "+brand.version+" · "+brand.sourceReference:"None approved"}. Independent reviewer required.</p>
    <label>Source reference<input style={field} value={brandSource} onChange={e=>setBrandSource(e.target.value)} placeholder="internal:official-medsol-brand-guide"/></label>
    <label style={{display:"block",marginTop:10}}>Brand voice<textarea style={field} rows={2} value={brandVoice} onChange={e=>setBrandVoice(e.target.value)}/></label>
    <label style={{display:"block",marginTop:10}}>Primary color<input style={field} value={brandColor} onChange={e=>setBrandColor(e.target.value)} placeholder="#125A83"/></label>
    <label style={{display:"block",marginTop:10}}>Prohibited claims (one per line)<textarea style={field} rows={2} value={prohibited} onChange={e=>setProhibited(e.target.value)}/></label>
    <label style={{display:"block",marginTop:10}}>Required disclaimers (one per line)<textarea style={field} rows={2} value={disclaimers} onChange={e=>setDisclaimers(e.target.value)}/></label>
    <button style={{...button,marginTop:10}} disabled={busy||!brandSource.trim()||!brandVoice.trim()}
     onClick={()=>act(async()=>{await call("brand/propose",{sourceReference:brandSource.trim(),rules:{
      voice:brandVoice.trim(),primaryColor:brandColor,prohibitedClaims:claims(prohibited),requiredDisclaimers:claims(disclaimers)}});setNotice("Brand draft submitted for independent review.");await load();})}>Submit Brand Master revision</button>
    <label style={{display:"block",marginTop:16}}>Pending brand revision<select style={field} value={selectedRevision} onChange={e=>setSelectedRevision(e.target.value)}>
     <option value="">Choose draft</option>{revisions.filter(x=>x.status==="DRAFT").map(x=><option value={x.id} key={x.id}>v{x.version} · proposed by {x.proposedBy}</option>)}
    </select></label>
    <label style={{display:"block",marginTop:10}}>Independent reviewer rationale<input style={field} value={brandDecisionReason} onChange={e=>setBrandDecisionReason(e.target.value)}/></label>
    <div style={{display:"flex",gap:8,marginTop:10}}>
     {(["APPROVE","REJECT"] as const).map(decision=><button key={decision} style={{...button,background:decision==="REJECT"?"#a12b2b":"#124d83"}}
      disabled={busy||!selectedRevision||brandDecisionReason.trim().length<12}
      onClick={()=>act(async()=>{await call("brand/decide",{revisionId:selectedRevision,decision,reason:brandDecisionReason.trim()});setSelectedRevision("");setNotice("Brand review recorded; publishing remains disabled.");await load();})}>{decision==="APPROVE"?"Approve revision":"Reject"}</button>)}
    </div>
   </div>
  </div>}
  {error&&<p role="alert" style={{color:"#a11919",background:"#fff0f0",padding:12,borderRadius:8}}>{error}</p>}
  {notice&&<p role="status" style={{color:"#115e43",padding:12}}>{notice}</p>}
 </section>;
}
