"use client";
import {useEffect,useState} from "react";

type Identity={userId:string;organizationId:string;email:string;role:string};
type Asset={id:string;brandId:string;title:string;version:number;status:string};
type Revision={id:string;version:number;sourceKind:string;renditionDigest:string;
 rightsExpiresAt:string;rightsReviewedAt:string|null;rightsReviewedBy:string|null};
type Detail=Asset&{revisions:Revision[]};
type Decision={approvalId:string;decision:string;scopeCurrent:boolean;
 humanDecisionValid:boolean;externallyExecutable:false};
const field={padding:"9px 11px",border:"1px solid #d1d5db",borderRadius:8,width:"100%",
 boxSizing:"border-box" as const,background:"#fff",color:"#0f172a"};
const button={padding:"10px 13px",border:0,borderRadius:8,background:"#124d83",color:"white",
 cursor:"pointer",fontWeight:650 as const};
const group={display:"grid",gap:12,gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))"};
const hidden=(s:string)=>s.trim().length===0;
function iso(v:string):string{
 const date=new Date(v);
 if(!Number.isFinite(date.getTime()))throw new Error("Choose a valid date and time");
 return date.toISOString();
}
/**
 * Internal DAM metadata/approval review console only. Publishing, media upload,
 * cryptographic content verification and customer authorization are NOT present.
 * All server actions use OIDC session, current tenant and DB policy enforcement.
 */
export default function CreativeGovernanceStudio({identity}:{identity:Identity|null}){
 const [assets,setAssets]=useState<Asset[]>([]);
 const [brands,setBrands]=useState<Array<{id:string;name:string}>>([]);
 const [brandId,setBrandId]=useState("");
 const [title,setTitle]=useState("");
 const [selectedId,setSelectedId]=useState("");
 const [detail,setDetail]=useState<Detail|null>(null);
 const [sourceKind,setSourceKind]=useState("EDITABLE_SOURCE");
 const [sourceRef,setSourceRef]=useState("internal:creative-source/");
 const [digest,setDigest]=useState("sha256:");
 const [rightsExpiry,setRightsExpiry]=useState("");
 const [rightsReason,setRightsReason]=useState("");
 const [selectedRevision,setSelectedRevision]=useState("");
 const [channel,setChannel]=useState("SOCIAL");
 const [destinationRef,setDestinationRef]=useState("internal:connected-destination/");
 const [audienceRef,setAudienceRef]=useState("internal:audience-snapshot/");
 const [policyVersion,setPolicyVersion]=useState("v1");
 const [scheduledAt,setScheduledAt]=useState("");
 const [approvalExpiry,setApprovalExpiry]=useState("");
 const [approvalId,setApprovalId]=useState("");
 const [approval,setApproval]=useState<Decision|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 async function call(path:string,body?:unknown):Promise<any>{
  const response=await fetch("/api/marketing/"+path,{
   method:body===undefined?"GET":"POST",cache:"no-store",
   headers:body===undefined?{}:{"content-type":"application/json"},
   ...(body===undefined?{}:{body:JSON.stringify(body)})
  });
  const data:unknown=await response.json();
  if(!response.ok)throw new Error(typeof data==="object"&&data!==null&&"message" in data?
    String(data.message):"Request failed ("+response.status+")");
  return data;
 }
 async function load(){
  const list=await call("assets") as Asset[];
  setAssets(list);
  if(identity&&["ADMIN","SUPER_ADMIN"].includes(identity.role.toUpperCase())){
   const bs=await call("tenancy/brands") as Array<{id:string;name:string}>;
   setBrands(bs);
  }
 }
 useEffect(()=>{
  if(!identity){setAssets([]);setBrands([]);setDetail(null);return;}
  void load().catch(e=>setError(e instanceof Error?e.message:"Cannot load assets"));
 // Identity change is the tenant boundary; never retain another user's asset data.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[identity?.organizationId,identity?.userId]);
 const run=async(fn:()=>Promise<void>)=>{
  setBusy(true);setError("");setNotice("");
  try{await fn();}catch(e){setError(e instanceof Error?e.message:"Operation unavailable");}
  finally{setBusy(false);}
 };
 const canRead=!!identity;
 const canEdit=!!identity&&["ADMIN","SUPER_ADMIN","CMO","MARKETING_DIRECTOR"].includes(identity.role.toUpperCase());
 const chosen=detail?.revisions.find(x=>x.id===selectedRevision);
 async function loadDetail(id:string){
  const next=await call("assets/"+encodeURIComponent(id)) as Detail;
  setDetail(next);setSelectedId(id);
  setSelectedRevision(next.revisions[0]?.id??"");
 }
 return <details style={{marginTop:20,background:"#fff",borderRadius:14,padding:22,
  border:"1px solid #dbe4ed"}} aria-label="Creative assets and exact approval governance">
  <summary style={{cursor:"pointer",fontSize:21,fontWeight:750,color:"#124d83"}}>
   Creative Asset & Approval Studio · R1C
  </summary>
  <p style={{color:"#64748b",fontSize:13}}>
   Metadata-only authoring and independent rights/approval review. No real file upload,
   editable source verification, social publication, email delivery or external spend.
  </p>
  {!canRead?<p>Sign in with organization SSO to access tenant-scoped creative records.</p>:<>
   <button style={button} disabled={busy} onClick={()=>void run(load)}>Refresh asset inventory</button>
   {error&&<p role="alert" style={{color:"#b91c1c"}}>{error}</p>}
   {notice&&<p role="status" style={{color:"#166534"}}>{notice}</p>}
   <fieldset style={{marginTop:18,border:"1px solid #e2e8f0",borderRadius:10,padding:16}}>
    <legend style={{fontWeight:700}}>Create tenant-owned creative record</legend>
    <div style={group}>
     <label>Brand identifier
      {brands.length?<select style={field} value={brandId} onChange={e=>setBrandId(e.target.value)}>
       <option value="">Select authorized brand</option>
       {brands.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
      </select>:<input style={field} value={brandId} onChange={e=>setBrandId(e.target.value)}
        placeholder="Existing brand ID" aria-label="Existing tenant brand ID"/>}
     </label>
     <label>Asset title
      <input style={field} maxLength={160} value={title} onChange={e=>setTitle(e.target.value)}/>
     </label>
    </div>
    <button style={{...button,marginTop:12}} disabled={busy||!canEdit||hidden(brandId)||hidden(title)}
      onClick={()=>void run(async()=>{
       const r=await call("assets",{brandId,title}) as {id:string};
       setNotice("Asset metadata created. Supply a verified internal creative source before any release.");
       await load();await loadDetail(r.id);setTitle("");
      })}>Create asset</button>
   </fieldset>
   <fieldset style={{marginTop:16,border:"1px solid #e2e8f0",borderRadius:10,padding:16}}>
    <legend style={{fontWeight:700}}>Version history and immutable source</legend>
    <label>Asset
     <select style={field} value={selectedId} onChange={e=>void run(async()=>{
      if(!e.target.value){setSelectedId("");setDetail(null);return;}
      await loadDetail(e.target.value);
     })}>
      <option value="">Choose an existing asset</option>
      {assets.map(a=><option key={a.id} value={a.id}>{a.title} · v{a.version}</option>)}
     </select>
    </label>
    {detail&&<>
     <p style={{fontSize:13}}>Current version: <strong>v{detail.version}</strong> · Brand: {detail.brandId}</p>
     <div style={group}>
      <label>Source kind<select style={field} value={sourceKind} onChange={e=>setSourceKind(e.target.value)}>
        <option value="EDITABLE_SOURCE">Editable source (declared only)</option>
        <option value="FLATTENED_EXPORT">Flattened export</option>
       </select></label>
      <label>Internal source reference<input style={field} value={sourceRef} onChange={e=>setSourceRef(e.target.value)}/></label>
      <label>SHA-256 of exact rendition<input style={field} value={digest} onChange={e=>setDigest(e.target.value)}/></label>
      <label>Rights expiry<input style={field} type="datetime-local" value={rightsExpiry}
       onChange={e=>setRightsExpiry(e.target.value)}/></label>
     </div>
     <button style={{...button,marginTop:12}} disabled={!canEdit||busy||!rightsExpiry||digest.length!==71}
       onClick={()=>void run(async()=>{
        const r=await call("assets/"+encodeURIComponent(detail.id)+"/revisions",{
         sourceKind,sourceRef,renditionDigest:digest,rightsExpiresAt:iso(rightsExpiry),
         expectedVersion:detail.version}) as {revisionId:string};
        await loadDetail(detail.id);setSelectedRevision(r.revisionId);await load();
        setNotice("Version appended; independent rights review is now required.");
       })}>Append new immutable revision</button>
     <label style={{display:"block",marginTop:15}}>Revision for rights and scope review
      <select style={field} value={selectedRevision} onChange={e=>setSelectedRevision(e.target.value)}>
       <option value="">Choose revision</option>
       {detail.revisions.map(r=><option key={r.id} value={r.id}>
        v{r.version} · {r.sourceKind} · {r.rightsReviewedAt?"Rights reviewed":"Rights pending"}
       </option>)}
      </select>
     </label>
     {chosen&&<p style={{color:"#475569",fontSize:12}}>
      Media hash {chosen.renditionDigest} · Rights expire {new Date(chosen.rightsExpiresAt).toLocaleString()}
     </p>}
     <label style={{display:"block"}}>Independent rights reviewer rationale
      <textarea style={{...field,minHeight:60}} maxLength={500} value={rightsReason}
       onChange={e=>setRightsReason(e.target.value)}/></label>
     <button style={{...button,marginTop:9}} disabled={!canEdit||busy||!selectedRevision||rightsReason.trim().length<12}
      onClick={()=>void run(async()=>{
       await call("assets/revisions/"+encodeURIComponent(selectedRevision)+"/rights-review",{reason:rightsReason.trim()});
       await loadDetail(detail.id);setRightsReason("");
       setNotice("Rights review recorded. This does not authorize distribution.");
      })}>Record independent rights review</button>
    </>}
   </fieldset>
   <fieldset style={{marginTop:16,border:"1px solid #e2e8f0",borderRadius:10,padding:16}}>
    <legend style={{fontWeight:700}}>Request exact-content human approval</legend>
    <p style={{color:"#64748b",fontSize:12}}>Requires active approved Brand Master, independently reviewed rights,
     current immutable revision and exact destination/audience refs. A subsequent edit invalidates the approval.</p>
    <div style={group}>
     <label>Channel<select style={field} value={channel} onChange={e=>setChannel(e.target.value)}>
      <option>SOCIAL</option><option>EMAIL</option><option>WEB</option>
     </select></label>
     <label>Connected destination ID<input style={field} value={destinationRef}
      onChange={e=>setDestinationRef(e.target.value)}/></label>
     <label>Audience snapshot ID<input style={field} value={audienceRef}
      onChange={e=>setAudienceRef(e.target.value)}/></label>
     <label>Approved Brand Master version<input style={field} value={policyVersion}
      onChange={e=>setPolicyVersion(e.target.value)}/></label>
     <label>Scheduled time<input type="datetime-local" style={field} value={scheduledAt}
      onChange={e=>setScheduledAt(e.target.value)}/></label>
     <label>Approval expires<input type="datetime-local" style={field} value={approvalExpiry}
      onChange={e=>setApprovalExpiry(e.target.value)}/></label>
    </div>
    <button style={{...button,marginTop:12}} disabled={!canEdit||busy||!selectedRevision||!chosen?.rightsReviewedAt||
     !scheduledAt||!approvalExpiry}
     onClick={()=>void run(async()=>{
      const r=await call("assets/revisions/"+encodeURIComponent(selectedRevision)+"/submit-approval",{
       channel,destinationRef,audienceRef,policyVersion,
       scheduledAt:iso(scheduledAt),expiresAt:iso(approvalExpiry)}) as {approvalId:string};
      setApprovalId(r.approvalId);
      setNotice("Exact-version approval submitted. Decide through the existing human Approval queue.");
     })}>Submit for human approval</button>
    <div style={{marginTop:12,display:"flex",gap:10,flexWrap:"wrap",alignItems:"end"}}>
     <label style={{flex:"1 1 230px"}}>Approval record ID<input style={field} value={approvalId}
      onChange={e=>setApprovalId(e.target.value)}/></label>
     <button style={button} disabled={busy||!approvalId}
      onClick={()=>void run(async()=>setApproval(await call("assets/approvals/"+encodeURIComponent(approvalId)) as Decision))}>
      Inspect approval validity</button>
    </div>
    {approval&&<p role="status" style={{fontSize:13}}>
     Human decision: <strong>{approval.decision}</strong> · Exact version current: <strong>{String(approval.scopeCurrent)}</strong>
     · External publishing authorized: <strong>No</strong>
    </p>}
   </fieldset>
  </>}
 </details>;
}
