"use client";
type Campaign={id:string;status:string};
type Run={id:string;status:string};
export default function AlphaExecutiveDashboard({authenticated,overview,campaigns,runs,approvals,approvalUnavailable,busy,onRefresh,onNavigate}:{
 authenticated:boolean;overview:Record<string,number>|null;campaigns:Campaign[];runs:Run[];approvals:unknown;approvalUnavailable:boolean;busy:boolean;onRefresh:()=>void;onNavigate:(id:string)=>void
}){
 const count=(key:string)=>authenticated&&overview&&Number.isFinite(overview[key])?overview[key]:"—";
 const statuses=Object.entries(campaigns.reduce<Record<string,number>>((a,c)=>(a[c.status]=(a[c.status]??0)+1,a),{})).sort(([a],[b])=>a.localeCompare(b));
 return <section className="alpha-card" aria-label="Executive overview">
  <div className="alpha-status-row"><div><div className="alpha-kicker">Executive workspace</div><h2>Operations at a glance</h2></div>
   <button type="button" disabled={!authenticated||busy} onClick={onRefresh}>{busy?"Refreshing…":"Refresh overview and Brain status"}</button></div>
  <p className="alpha-subtle">Tenant-scoped operational snapshot. Simulated activity is not live delivery or financial performance.</p>
  <div className="alpha-grid">
   <div className="alpha-stat"><strong>{authenticated&&overview?campaigns.length:"—"}</strong><span>Campaigns in loaded portfolio</span></div>
   <div className="alpha-stat"><strong>{count("activeObjectives")}</strong><span>Objectives in overview</span></div>
   <div className="alpha-stat"><strong>{authenticated&&!approvalUnavailable&&Array.isArray(approvals)?approvals.length:"—"}</strong><span>Visible approval queue</span></div>
   <div className="alpha-stat"><strong>{authenticated?runs.length||"—":"—"}</strong><span>Brain runs loaded</span></div>
  </div>
  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,235px),1fr))",gap:14,marginTop:14}}>
   <div><h3>Campaign distribution</h3>{authenticated&&overview&&statuses.length?statuses.map(([status,n])=><div key={status} style={{marginBottom:9}}><div className="alpha-status-row"><span className="alpha-subtle">{status.replaceAll("_"," ")}</span><strong>{n}</strong></div><div className="alpha-meter" role="meter" aria-label={status+" campaigns"} aria-valuemin={0} aria-valuemax={campaigns.length} aria-valuenow={n}><span style={{width:(100*n/campaigns.length)+"%"}}/></div></div>):<p className="alpha-subtle">{authenticated&&overview?"No campaigns in loaded portfolio.":"Load authenticated workspace to view data."}</p>}</div>
   <div><h3>Operator actions</h3><div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{[["journey","Campaign workspace"],["approvals","Review inbox"],["agent-brain","Agent & Brain controls"],["operations","Operational incidents"],["performance","Performance evidence"]].map(([id,label])=><button key={id} disabled={!authenticated} type="button" onClick={()=>onNavigate(id)}>{label}</button>)}</div><p className="alpha-subtle">Actions open existing governed controls. No changes are performed here.</p></div>
  </div>
 </section>
}
