"use client";
import {useEffect,useState} from "react";

type Identity={userId:string;organizationId:string;role:string};
type BusinessProfile={name:string;industry:string;offerings:string;audience:string;territories:string;differentiators:string};
const emptyProfile:BusinessProfile={name:'',industry:'',offerings:'',audience:'',territories:'',differentiators:''};
const profileFields=[['name','Business name',60],['industry','Industry',60],['offerings','Offerings',100],['audience','Audience',100],['territories','Territories',80],['differentiators','Differentiators',120]] as const;
const feedbackThemes=['PRODUCT_QUALITY','ONBOARDING','PRICE_VALUE','SUPPORT','USABILITY','TRUST','FEATURE_REQUEST','DELIVERY','OTHER'] as const;
type FeedbackCounts=Record<typeof feedbackThemes[number],number>;
const initialFeedback=Object.fromEntries(feedbackThemes.map(t=>[t,0])) as FeedbackCounts;
type Document={syntheticFeedback?:{brandId:string;cohortSize:number;themeCounts:Partial<FeedbackCounts>};feedbackReviewStatus?:string;id:string;sourceKey:string;title:string;status:string;
 accessMode:string;agentScope:string[];contentDigest:string;
 sourceUrl:string|null;reviewedBy:string|null;businessProfile?:BusinessProfile;profileReviewStatus?:string;profileAuthoritative?:false;sourceType?:string;governedSourceEvidence?:null|{rightsBasis:string;scope:string;permissionExpiresAt:string;permissionReference:string;legalRightsVerified:false}};
type Result={results:Array<{citationRef:string;snippet:string;
 sourceTitle:string;sourceUrl:string|null;score:number;independentlyVerified:false}>;
 retrievalMethod:string;independentlyVerified:false};
const field={boxSizing:"border-box" as const,width:"100%",
 border:"1px solid #cbd5e1",borderRadius:8,padding:"9px 11px"};
const button={background:"#124d83",color:"#fff",border:0,
 borderRadius:8,padding:"9px 13px",fontWeight:650,cursor:"pointer"} as const;
export default function KnowledgeFabricStudio({identity}:{identity:Identity|null}){
 const [docs,setDocs]=useState<Document[]>([]);
 const [profile,setProfile]=useState<BusinessProfile>(emptyProfile),[profileUrl,setProfileUrl]=useState(''),[profileExpiry,setProfileExpiry]=useState(''),[profileKey,setProfileKey]=useState(''),[profileAgents,setProfileAgents]=useState(false),[profileAttested,setProfileAttested]=useState(false);
 const [feedbackCounts,setFeedbackCounts]=useState<FeedbackCounts>(initialFeedback),[feedbackBrand,setFeedbackBrand]=useState(''),[feedbackKey,setFeedbackKey]=useState(''),[feedbackExpiry,setFeedbackExpiry]=useState(''),[feedbackConfirmed,setFeedbackConfirmed]=useState(false);
 const feedbackTotal=Object.values(feedbackCounts).reduce((a,b)=>a+b,0);
 const [sourceKey,setSourceKey]=useState("");
 const [title,setTitle]=useState("");
 const [content,setContent]=useState("");
 const [url,setUrl]=useState("");
 const [governed,setGoverned]=useState(false);
 const [rightsBasis,setRightsBasis]=useState("LICENSED_CONTENT");
 const [collectionScope,setCollectionScope]=useState("METADATA_ONLY");
 const [rightsRef,setRightsRef]=useState("");
 const [rightsExpiry,setRightsExpiry]=useState("");
 const [collectionPermitted,setCollectionPermitted]=useState(false);
 const [noPersonalData,setNoPersonalData]=useState(false);
 const [scope,setScope]=useState("MKT-SCI-001,MKT-STR-001");
 const [specialistExpiry,setSpecialistExpiry]=useState("");
 const specialistScope=scope.split(",").some(s=>s.trim().startsWith("MKT-SPECIALIST-"));
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
  {isAdmin&&<fieldset style={{border:'1px solid #cbd5e1',padding:12,marginBottom:15}}>
   <legend>Structured business discovery · manual source</legend>
   <p style={{fontSize:12}}>Author a compact business profile from an authorized source. A different administrator must review it. This is a knowledge snapshot, not a legal identity, verified claim or brand-policy change.</p>
   <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:10}}>
    {profileFields.map(([key,label,max])=><label key={key}>{label}<input style={field} value={profile[key]} maxLength={max} disabled={busy} onChange={e=>{setProfile(p=>({...p,[key]:e.target.value}));setProfileKey('');}}/></label>)}
    <label>Business source HTTPS URL<input style={field} value={profileUrl} disabled={busy} onChange={e=>{setProfileUrl(e.target.value);setProfileKey('');}}/></label>
    <label>Business profile expiry<input type='date' style={field} value={profileExpiry} disabled={busy} onChange={e=>{setProfileExpiry(e.target.value);setProfileKey('');}}/></label>
   </div>
   <label style={{display:'block'}}><input type='checkbox' checked={profileAttested} disabled={busy} onChange={e=>setProfileAttested(e.target.checked)}/> I confirm authorized manual business information, with no personal data.</label>
   <label style={{display:'block'}}><input type='checkbox' checked={profileAgents} disabled={busy} onChange={e=>{setProfileAgents(e.target.checked);setProfileKey('');}}/> Permit the designated brand, strategy and director agents to retrieve this source only after independent review.</label>
   <button style={button} disabled={busy||!profileAttested||!profileUrl.startsWith('https://')||!profileExpiry||profileFields.some(([key])=>profile[key].trim().length<2)} onClick={()=>void task(async()=>{
    const key=profileKey||'business-profile-'+crypto.randomUUID();setProfileKey(key);
    setLast(await call('',{sourceKey:key,businessProfile:profile,businessProfileAttested:profileAttested,sourceUrl:profileUrl,expiresAt:new Date(profileExpiry+'T23:59:59Z').toISOString(),accessMode:profileAgents?'AGENT_SCOPED':'REVIEWERS_ONLY',agentScope:profileAgents?['MKT-BRAND-001','MKT-STR-001','MKT-CMO-001']:[]}));
    await refresh();
   })}>Submit business profile to quarantine</button>
  </fieldset>}
  {isAdmin&&<fieldset style={{border:'1px solid #cbd5e1',padding:12,marginBottom:15}}>
   <legend>Customer feedback · synthetic research rehearsal</legend>
   <p>Fixture counts only. Do not enter real customer information. Small theme counts are suppressed and no agent or external channel can access this cohort.</p>
   <label>Active tenant brand ID<input style={field} value={feedbackBrand} disabled={busy} onChange={e=>{setFeedbackBrand(e.target.value);setFeedbackKey('');}}/></label>
   <label>Expiry within 90 days<input type="date" style={field} value={feedbackExpiry} disabled={busy} onChange={e=>{setFeedbackExpiry(e.target.value);setFeedbackKey('');}}/></label>
   <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:8}}>
    {feedbackThemes.map(t=><label key={t}>{t.replaceAll('_',' ')}<input type="number" min={0} max={100} step={1} style={field} value={feedbackCounts[t]} disabled={busy} onChange={e=>{setFeedbackCounts(p=>({...p,[t]:Number(e.target.value)}));setFeedbackKey('');}}/></label>)}
   </div>
   <p>Fixture cohort size: {feedbackTotal} / 100</p>
   <label><input type="checkbox" checked={feedbackConfirmed} disabled={busy} onChange={e=>setFeedbackConfirmed(e.target.checked)}/> Only synthetic fixture counts, no real survey or customer evidence.</label>
   <button style={button} disabled={busy||!feedbackConfirmed||!feedbackBrand||!feedbackExpiry||feedbackTotal<1||feedbackTotal>100||Object.values(feedbackCounts).some(n=>!Number.isInteger(n)||n<0||n>100)} onClick={()=>void task(async()=>{
    const key=feedbackKey||'synthetic-feedback-'+crypto.randomUUID();setFeedbackKey(key);
    setLast(await call('',{sourceKey:key,syntheticFeedback:{brandId:feedbackBrand,fixtureOnly:true,counts:feedbackCounts},expiresAt:new Date(feedbackExpiry+'T23:59:59Z').toISOString(),accessMode:'REVIEWERS_ONLY'}));await refresh();
   })}>Quarantine synthetic feedback cohort</button>
  </fieldset>}
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
      <option value="AGENT_SCOPED">Specified registered agents</option>
     </select></label>
   </div>
   {accessMode==="AGENT_SCOPED"&&<label style={{display:"block",
    fontSize:13,marginTop:9}}>Allowed agent IDs (comma separated)
    <input style={field} value={scope} onChange={e=>setScope(e.target.value)}/></label>}
   {accessMode==="AGENT_SCOPED"&&specialistScope&&<fieldset style={{border:"1px solid #cbd5e1",padding:10,marginTop:9}}>
    <legend>Exclusive specialist fixture</legend>
    <p>Use exactly one reviewed specialist ID, no source URL or governed import, and synthetic material only. This does not share the source with the canonical template or other agents.</p>
    <label>Specialist source expiry (within 30 days)<input type="date" style={field} value={specialistExpiry} onChange={e=>setSpecialistExpiry(e.target.value)}/></label>
   </fieldset>}
   <label style={{display:"block",fontSize:13,marginTop:9}}>Source content (plain text)
    <textarea style={{...field,minHeight:130}} value={content}
     onChange={e=>setContent(e.target.value)} spellCheck={false}/>
   </label>
   <label style={{display:"block",fontSize:13,marginTop:9}}>
    <input type="checkbox" checked={governed} onChange={e=>{setGoverned(e.target.checked);setCollectionPermitted(false);setNoPersonalData(false);}}/> Governed market source import (permission declaration required)
   </label>
   {governed&&<fieldset style={{border:"1px solid #cbd5e1",padding:10,marginTop:9}}>
    <legend>Operator-supplied source rights</legend>
    <label>Rights basis<select style={field} value={rightsBasis} onChange={e=>setRightsBasis(e.target.value)}>
     {["PUBLIC_DOMAIN","LICENSED_CONTENT","OWNER_PERMISSION"].map(x=><option key={x}>{x}</option>)}</select></label>
    <label>Collection scope<select style={field} value={collectionScope} onChange={e=>setCollectionScope(e.target.value)}>
     <option>METADATA_ONLY</option><option>TEXT_EXCERPT</option></select></label>
    <label>Internal rights evidence reference<input style={field} value={rightsRef} onChange={e=>setRightsRef(e.target.value)} placeholder="internal:source-rights/approval-record"/></label>
    <label>Permission expiry date<input type="date" style={field} value={rightsExpiry} onChange={e=>setRightsExpiry(e.target.value)}/></label>
    <label style={{display:"block"}}><input type="checkbox" checked={collectionPermitted} onChange={e=>setCollectionPermitted(e.target.checked)}/> I attest collection is permitted within this scope</label>
    <label style={{display:"block"}}><input type="checkbox" checked={noPersonalData} onChange={e=>setNoPersonalData(e.target.checked)}/> I attest no personal data is included</label>
    <small>Independent review required. No automatic retrieval, legal-rights verification or external request is made.</small>
   </fieldset>}
   <button disabled={busy||(accessMode==="AGENT_SCOPED"&&specialistScope&&(!specialistExpiry||!!url.trim()||governed))||(governed&&(!url.trim()||!rightsRef.trim()||!rightsExpiry||!collectionPermitted||!noPersonalData))} style={button} onClick={()=>void task(async()=>{
    const specialist=accessMode==="AGENT_SCOPED"&&specialistScope;
    const key=sourceKey||(specialist?"specialist-fixture-":"local-")+crypto.randomUUID();
    if(!sourceKey)setSourceKey(key);
    const payload={sourceKey:key,title,text:content,sourceUrl:url||undefined,
     accessMode,agentScope:accessMode==="AGENT_SCOPED"?
      scope.split(",").map(s=>s.trim()).filter(Boolean):[],
     ...(specialist?{expiresAt:new Date(specialistExpiry+"T00:00:00Z").toISOString()}:{}),
     ...(governed?{expiresAt:new Date(rightsExpiry+"T23:59:59Z").toISOString(),governedImport:{rightsBasis,scope:collectionScope,
      permissionReference:rightsRef,collectionPermitted,noPersonalData}}:{})};
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
      <strong>{doc.title}</strong><div>{doc.sourceKey}</div>{doc.businessProfile&&<details><summary>Business profile · {doc.profileReviewStatus} · not authoritative</summary><dl>{profileFields.map(([key,label])=><div key={key}><dt>{label}</dt><dd>{doc.businessProfile?.[key]}</dd></div>)}</dl></details>}{doc.syntheticFeedback&&<details><summary>Synthetic feedback · {doc.feedbackReviewStatus} · {doc.syntheticFeedback.cohortSize} fixtures</summary><p>Brand {doc.syntheticFeedback.brandId}; no real customer evidence.</p>{Object.entries(doc.syntheticFeedback.themeCounts).map(([theme,count])=><p key={theme}>{theme}: {count}</p>)}<small>Theme counts below five are suppressed.</small></details>}{doc.governedSourceEvidence&&<small>Declared {doc.governedSourceEvidence.rightsBasis} · {doc.governedSourceEvidence.scope} · expiry {doc.governedSourceEvidence.permissionExpiresAt} · rights reference {doc.governedSourceEvidence.permissionReference} · not legally verified</small>}</td>
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
