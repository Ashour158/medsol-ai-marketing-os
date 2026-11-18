"use client";
import {useEffect,useState} from "react";

type Identity={userId:string;organizationId:string;email:string;role:string};
type Campaign={id:string;code:string;name:string;status:string;brandId:string|null};
type Publication={id:string;campaignId:string;approvalId:string;status:string;
 version:number;creativeAssetRevisionId?:string};
type Gate={internalReady:boolean;externalReady:false;reasons:string[];
 integrationEvidence?:{destinationRegistered:boolean;destinationStatus:string|null;providerKey:string|null;
 mediaBytesReadbackVerified:boolean;mediaObjectVersion:string|null;
 providerCredentialsVerified:false;providerPublishingCapabilityVerified:false;verifiedExternalDestination:false};
 limitations:string[];externalEffectsAuthorized:false};
type Detail=Publication&{scopeDigest:string;preflight:Gate;attempts:Array<{
 id:string;mode:string;outcome:string;evidenceRef:string;recordedAt:string}>};
type ReleaseReadiness={publicationId:string;releaseBlocked:true;
  externalReady:false;externalEffectsAuthorized:false;outgoingProviderCallsMade:0;
  releasePrerequisitesMet:boolean;commercialPolicyEligible:boolean;
  candidateEncryptedTokenPresent:boolean;trustedAccountObservationFresh:boolean;
  mediaReadbackClean:boolean;mediaObjectVersionVerified:boolean;
  checks:Record<string,boolean>;blockers:string[]};
type Reconciliation={correlationState:string;publicationStatus:string;
 signedWebhookObservations:number;signedPostAddCandidates:number;
 postClaimsMatchingObservedAccount:number;authorizedRemoteAttempts:number;
 verifiedRemoteReceipts:number;providerReceiptVerified:false;
 externallyPublished:false;externalEffectsAuthorized:false;
 reasons:string[];lastSignedWebhookAt:string|null};
const btn={padding:"10px 14px",background:"#124d83",color:"white",fontWeight:650 as const,
 border:0,borderRadius:8,cursor:"pointer"};
const field={width:"100%",padding:10,boxSizing:"border-box" as const,
 border:"1px solid #cbd5e1",borderRadius:8,background:"#fff",marginTop:5};
/** No platform publish/send/spend. Simulations are *only* internal evidence. */
export default function CampaignPublicationStudio({identity}:{identity:Identity|null}){
 const [campaigns,setCampaigns]=useState<Campaign[]>([]);
 const [publications,setPublications]=useState<Publication[]>([]);
 const [campaignId,setCampaignId]=useState("");
 const [approvalId,setApprovalId]=useState("");
 const [selectedId,setSelectedId]=useState("");
 const [detail,setDetail]=useState<Detail|null>(null);
 const [report,setReport]=useState<unknown>(null);
 const [reconciliation,setReconciliation]=useState<Reconciliation|null>(null);
 const [release,setRelease]=useState<ReleaseReadiness|null>(null);
 const [holdReason,setHoldReason]=useState("");
 const [holdKey,setHoldKey]=useState("");
 const [error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false);
 async function call(path:string,body?:unknown):Promise<any>{
  const response=await fetch("/api/marketing/"+path,{method:body===undefined?"GET":"POST",
   cache:"no-store",headers:body===undefined?{}:{"content-type":"application/json"},
   ...(body===undefined?{}:{body:JSON.stringify(body)})});
  const result:unknown=await response.json();
  if(!response.ok)throw new Error(typeof result==="object"&&result!==null&&"message" in result?
   String(result.message):"Request failed ("+response.status+")");
  return result;
 }
 async function inventory(){
  const [c,p]=await Promise.all([call("campaigns"),call("publications")]);
  setCampaigns(c as Campaign[]);setPublications(p as Publication[]);
 }
 async function detailFor(id:string){
  const [d,recon,releaseGate]=await Promise.all([
   call("publications/"+encodeURIComponent(id)) as Promise<Detail>,
   call("publications/"+encodeURIComponent(id)+"/reconciliation") as Promise<Reconciliation>,
   call("publications/"+encodeURIComponent(id)+"/release-readiness") as Promise<ReleaseReadiness>
  ]);
  if(selectedId!==id){setHoldReason("");setHoldKey("");}
  setSelectedId(id);setDetail(d);setReconciliation(recon);setRelease(releaseGate);setReport(null);
 }
 async function run(fn:()=>Promise<void>){
  setBusy(true);setError("");setNotice("");
  try{await fn();}catch(e){setError(e instanceof Error?e.message:"Request failed");}
  finally{setBusy(false);}
 }
 useEffect(()=>{
  setCampaigns([]);setPublications([]);setSelectedId("");setDetail(null);setReport(null);setReconciliation(null);setRelease(null);setHoldReason("");setHoldKey("");
  if(!identity)return;
  void inventory().catch(e=>setError(e instanceof Error?e.message:"Unable to load publications"));
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[identity?.organizationId,identity?.userId]);
 const canPlan=!!identity&&["ADMIN","SUPER_ADMIN","CMO","MARKETING_DIRECTOR"].includes(identity.role.toUpperCase());
 const canHold=!!identity&&["ADMIN","SUPER_ADMIN"].includes(identity.role.toUpperCase());
 const canSimulate=!!identity&&["ADMIN","SUPER_ADMIN","CMO","MARKETING_DIRECTOR",
  "MARKETING_MANAGER","MARKETING_SPECIALIST"].includes(identity.role.toUpperCase());
 return <details style={{marginTop:20,background:"white",border:"1px solid #dbe4ed",
  borderRadius:14,padding:22}} aria-label="R2 publication sandbox and reconciliation">
  <summary style={{cursor:"pointer",color:"#124d83",fontWeight:750,fontSize:21}}>
   R2 · Campaign-to-Publication Sandbox
  </summary>
  <p style={{color:"#475569",fontSize:13}}>
   Connect a human-approved campaign to a human-approved creative revision and
   simulate an exact publication request. <strong>No real platform delivery occurs.</strong>
   Source-confirmed performance remains separate from sandbox receipts.
  </p>
  {!identity?<p>Sign in with organization SSO to inspect your tenant&apos;s publication evidence.</p>:<>
   {error&&<p role="alert" style={{color:"#b91c1c"}}>{error}</p>}
   {notice&&<p role="status" style={{color:"#166534"}}>{notice}</p>}
   <button style={btn} disabled={busy} onClick={()=>void run(inventory)}>Refresh workflow</button>
   <section style={{marginTop:16,padding:14,border:"1px solid #e2e8f0",borderRadius:10}}>
    <h3 style={{marginTop:0}}>1. Link approved campaign and creative</h3>
    <p style={{color:"#64748b",fontSize:12}}>
     First use the existing Brain-led campaign workflow with an active Brand ID,
     obtain independent campaign approval, then create and approve the exact
     asset through Creative Governance Studio. The two approval records stay authoritative.
    </p>
    <div style={{display:"grid",gap:12,gridTemplateColumns:"repeat(auto-fit,minmax(235px,1fr))"}}>
     <label>Approved, brand-bound campaign
      <select style={field} value={campaignId} onChange={e=>setCampaignId(e.target.value)}>
       <option value="">Choose approved campaign</option>
       {campaigns.filter(c=>c.status==="APPROVED"&&c.brandId).map(c=>
        <option value={c.id} key={c.id}>{c.code} · {c.name}</option>)}
      </select>
     </label>
     <label>Exact creative approval ID
      <input style={field} value={approvalId} onChange={e=>setApprovalId(e.target.value)}
       placeholder="Approval ID from creative rights and scope workflow"/>
     </label>
    </div>
    <button style={{...btn,marginTop:12}} disabled={!canPlan||busy||!campaignId||!approvalId.trim()}
     onClick={()=>void run(async()=>{
      const output=await call("publications",{campaignId,approvalId:approvalId.trim(),
       requestKey:crypto.randomUUID()}) as {publicationId:string};
      await inventory();await detailFor(output.publicationId);
      setNotice("Immutable publication intent prepared. External delivery remains disabled.");
     })}>Prepare internal publication intent</button>
   </section>
   <section style={{marginTop:16,padding:14,border:"1px solid #e2e8f0",borderRadius:10}}>
    <h3 style={{marginTop:0}}>2. Inspect controls and dry-run</h3>
    <label>Publication plan
     <select style={field} value={selectedId} onChange={e=>void run(async()=>{
      if(!e.target.value){setSelectedId("");setDetail(null);setReconciliation(null);setRelease(null);return;}
      await detailFor(e.target.value);
     })}>
      <option value="">Select existing publication intent</option>
      {publications.map(p=><option key={p.id} value={p.id}>
       {p.id.slice(0,12)} · {p.status} · v{p.version}</option>)}
     </select>
    </label>
    {detail&&<>
     <p><strong>{detail.status}</strong> · Version {detail.version} · Campaign {detail.campaignId}</p>
     <p style={{color:"#64748b",fontSize:12}}>Immutable SHA-256 scope: {detail.scopeDigest}</p>
     <p style={{fontSize:13}}>Internal simulation gate:
      <strong>{detail.preflight.internalReady?" PASS":" BLOCKED"}</strong> ·
      External publication gate: <strong>BLOCKED</strong>
     </p>
     {detail.preflight.reasons.length>0&&<p style={{color:"#a11919",fontSize:13}}>
      {detail.preflight.reasons.join(" · ")}</p>}
     <p style={{color:"#475569",fontSize:13}}>Registered destination: <strong>{detail.preflight.integrationEvidence?.destinationRegistered?"Yes (unverified)":"No"}</strong> · Verified stored media bytes: <strong>{detail.preflight.integrationEvidence?.mediaBytesReadbackVerified?"Readback digest matched":"Not yet"}</strong> · Provider credentials: <strong>Not connected</strong></p>
     <details><summary>Unmet conditions for live platforms</summary>
      <ul>{detail.preflight.limitations.map(r=><li key={r}>{r.replaceAll("_"," ")}</li>)}</ul>
     </details>
     <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:12}}>
      <button style={btn} disabled={busy} onClick={()=>void run(()=>detailFor(detail.id))}>
       Revalidate exact scope</button>
      <button style={btn} disabled={busy||!canSimulate||detail.status!=="PREPARED"||
       !detail.preflight.internalReady}
       onClick={()=>void run(async()=>{
        const r=await call("publications/"+encodeURIComponent(detail.id)+"/simulate",{
         expectedVersion:detail.version}) as {receiptRef?:string;status:string};
        await detailFor(detail.id);await inventory();
        setNotice(r.status==="SIMULATED"?"Local sandbox receipt recorded; no platform action occurred.":"No simulation completed.");
       })}>Execute local sandbox (no publish)</button>
      <button style={{...btn,background:"#92400e"}} disabled={busy||!canPlan||detail.status!=="PREPARED"}
       onClick={()=>void run(async()=>{
        const reason=window.prompt("Reason to cancel this internal publication plan (12+ characters):");
        if(!reason||reason.trim().length<12)return;
        await call("publications/"+encodeURIComponent(detail.id)+"/cancel",{
         expectedVersion:detail.version,reason:reason.trim()});
        await detailFor(detail.id);await inventory();setNotice("Publication plan cancelled.");
       })}>Cancel pending intent</button>
     </div>
     <section aria-label="Source-reconciled provider delivery evidence" style={{marginTop:16,padding:14,
      border:"1px solid #cbd5e1",borderRadius:8,background:"#f8fafc"}}>
      <h4 style={{marginTop:0}}>R2E-C · Remote delivery correlation</h4>
      <p style={{fontSize:13}}>Delivery state: <strong>{reconciliation?.correlationState??"Unavailable"}</strong>.
       Verified remote receipts: <strong>{reconciliation?.verifiedRemoteReceipts??0}</strong>.
       External publishing: <strong>Disabled</strong>.</p>
      <p style={{fontSize:12,color:"#475569"}}>
       Signed provider notifications: {reconciliation?.signedWebhookObservations??0} ·
       Unlinked post-add claims: {reconciliation?.signedPostAddCandidates??0} ·
       Claims consistent with a recently observed provider account:
       {" "}{reconciliation?.postClaimsMatchingObservedAccount??0}
      </p>
      <p style={{fontSize:12,color:"#475569"}}>
       These are provider-claimed event references, not proof of an authorized outbound post.
       A sandbox receipt never confirms delivery.
      </p>
      {reconciliation?.reasons.length?
       <p style={{color:"#92400e",fontSize:12}}>
        {reconciliation.reasons.join(" · ").replaceAll("_"," ")}</p>:null}
      <button style={{...btn,background:"#475569"}} disabled={busy}
       onClick={()=>void run(()=>detailFor(detail.id))}>
       Recheck source correlation</button>
     </section>
     <section aria-label="R2F official social release decision" style={{marginTop:16,padding:14,
      border:"1px solid #cbd5e1",borderRadius:8,background:"#f8fafc"}}>
      <h4 style={{marginTop:0}}>R2F · Governed live-release assessment</h4>
      <p style={{fontSize:13}}>Publishing state: <strong>DISABLED</strong> ·
       External API calls made: <strong>{release?.outgoingProviderCallsMade??0}</strong> ·
       Operator egress: <strong>LOCKED</strong>.</p>
      <p style={{color:"#475569",fontSize:12}}>
       This report compares the active campaign and independent creative approval,
       tenant and provider authority, media integrity and operational safety controls.
       No result here permits publishing.</p>
      <details><summary>Required release evidence ({release?.blockers.length??0} blockers)</summary>
       <ul>{(release?.blockers??[]).map(reason=>
        <li key={reason}>{reason.replaceAll("_"," ")}</li>)}</ul>
      </details>
      <button style={{...btn,background:"#475569",marginTop:10}} disabled={busy}
       onClick={()=>void run(()=>detailFor(detail.id))}>Refresh governed-release evidence</button>
     </section>
     <section aria-label="Operator permanent dispatch hold" style={{marginTop:16,padding:14,
      border:"1px solid #cbd5e1",borderRadius:8}}>
      <h4 style={{marginTop:0}}>R2F-C · One-use dispatch hold</h4>
      <p style={{fontSize:12,color:"#475569"}}>
       An authorized tenant administrator may permanently block a prepared publication,
       creating a single immutable release-fence record. This does not schedule
       or authorize any external provider call. A new creative approval and
       publication are required to replace a blocked intent.
      </p>
      <textarea aria-label="Reason for permanent dispatch hold"
       style={{...field,minHeight:60}} disabled={busy||!canHold||detail.status!=="PREPARED"}
       value={holdReason} onChange={e=>setHoldReason(e.target.value)}
       placeholder="Specific security or release hold rationale (12–500 characters)" />
      <button style={{...btn,marginTop:10,background:"#7f1d1d"}}
       disabled={busy||!canHold||detail.status!=="PREPARED"||
        holdReason.trim().length<12||holdReason.trim().length>500}
       onClick={()=>void run(async()=>{
        const key=holdKey||crypto.randomUUID();
        if(!holdKey)setHoldKey(key);
        await call("publications/"+encodeURIComponent(detail.id)+"/dispatch-hold",{
         expectedVersion:detail.version,requestKey:key,reason:holdReason
        });
        setNotice("Immutable dispatch hold recorded. No external post was sent.");
        await Promise.all([inventory(),detailFor(detail.id)]);
       })}>Permanently hold publication · No send</button>
     </section>
     <h4>Sandbox attempt evidence</h4>
     {detail.attempts.length===0?<p>No simulation attempt recorded.</p>:
      <ul>{detail.attempts.map(a=><li key={a.id}>
       {a.outcome} · {a.evidenceRef} · {new Date(a.recordedAt).toLocaleString()}
      </li>)}</ul>}
    </>}
   </section>
   <section style={{marginTop:16,padding:14,border:"1px solid #e2e8f0",borderRadius:10}}>
    <h3 style={{marginTop:0}}>3. Verify campaign performance evidence</h3>
    <button style={btn} disabled={busy||!detail} onClick={()=>void run(async()=>{
     setReport(await call("publications/"+encodeURIComponent(detail!.id)+"/performance"));
    })}>Load independently reviewed metric observations</button>
    <p style={{color:"#64748b",fontSize:12}}>Sandbox simulations generate zero impressions, clicks,
     leads or revenue. Only separately ingested and independently reviewed source observations
     can appear in this report.</p>
    {report!==null&&<pre style={{padding:13,background:"#f1f5f9",overflowWrap:"anywhere",
     whiteSpace:"pre-wrap",fontSize:12}}>{JSON.stringify(report,null,2)}</pre>}
   </section>
  </>}
 </details>;
}
