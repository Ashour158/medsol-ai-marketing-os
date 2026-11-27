"use client";
import {useEffect,useState} from "react";
import PersistentLayeredDesignStudio from "./persistent-layered-design-studio";
import SyntheticChannelPlanStudio from "./synthetic-channel-plan-studio";
import {selectedCreativeIsCurrent} from "../lib/journey-creative-current";
import {CAMPAIGN_STAGE_ORDER} from "../lib/campaign-readiness";
import {validateOfflineCreativeDownload,deriveOfflineEditableSvgDraft} from "../lib/offline-creative-export";

type Identity={organizationId:string;userId:string;email:string;role:string};
type Brand={id:string;name:string;status?:string};
type ProductChoice={id:string;name:string;code:string;lifecycle?:string};
type CampaignChoice={id:string;name:string;code:string;status:string};
type Journey={
 campaign:{id:string;name:string;brandId:string;status:string;code:string;objectiveId?:string|null;productId?:string|null};
 workflow:{id:string;status:string;currentStep:string}|null;
 campaignApprovals:Array<{id:string;decision:string;decidedBy:string|null}>;
 brainRuns:Array<{id:string;status:string;steps:Array<{stage:string;agentId:string;status:string}>}>;
 creativeAssets:Array<{assetId:string;revisionId:string;brandId:string;version:number;current:boolean;title:string;
  rightsReviewedAt:string|null;publicationLinked:boolean;renditionDigest:string;
  approvals:Array<{id:string;decision:string}>}>;
 publications:Array<{id:string;status:string;version:number;
  attempts:Array<{id:string;mode:string;outcome:string}>}>;
 emailSimulations:Array<{id:string;status:string;result:Record<string,unknown>}>;
 learningSignals:Array<{id:string;status:string;topic:string}>;
 observations:Array<{id:string;metricKey:string;value:string;status:string}>;
 stages:Record<string,boolean>;
 auditHistory:Array<{id:string;action:string;occurredAt:string;objectType:string}>;
 offlineSimulationOnly:true;externalEffectsAuthorized:false;
};
type OfflineCreative={assetId:string;revisionId:string;version:number;brandId:string;
 renditionDigest:string;offlineOnly:true;sourceKind:"FLATTENED_EXPORT"};
type Preview={revisionId:string;assetId:string;version:number;current:boolean;
 title:string;editableCopy:string;imageDataUrl:string;
 renditionDigest:string;offlineOnly:true};
type CreativeDetail={id:string;brandId:string;version:number;
 revisions:Array<{id:string;version:number;offlinePreviewAvailable:boolean;
  rightsReviewedAt:string|null}>};
type Contact={contactId:string;latestSimulatedConsent:string};
const button={padding:"10px 14px",border:0,borderRadius:8,cursor:"pointer",
 background:"#124d83",fontWeight:650 as const,color:"white"};
const secondary={...button,background:"#475569"};
const input={padding:"9px 11px",border:"1px solid #cbd5e1",borderRadius:8,
 width:"100%",boxSizing:"border-box" as const,background:"#fff"};
const section={border:"1px solid #e2e8f0",padding:16,borderRadius:10,marginTop:12};
const label={display:"block",fontSize:13,fontWeight:600 as const,margin:"7px 0"};
const uuid=()=>crypto.randomUUID();
async function api(path:string,body?:unknown):Promise<any>{
 const response=await fetch("/api/marketing/"+path,{
  method:body===undefined?"GET":"POST",cache:"no-store",
  credentials:"same-origin",
  ...(body===undefined?{}:{headers:{"content-type":"application/json"},
   body:JSON.stringify(body)})
 });
 let out:unknown;
 try{out=await response.json();}catch{throw new Error("Non-JSON response");}
 if(!response.ok){
  const error=out&&typeof out==="object"?(out as Record<string,unknown>):null;
  const detail=error?.message??error?.error;
  throw new Error(typeof detail==="string"?detail:"Request was rejected ("+response.status+")");
 }
 return out;
}
/** Visible real PNG generated in the browser, not AI art or external storage.
 * Copy is independently editable; the raster itself is a flattened export.
 */
function localPng(title:string,copy:string,color:string){
 const c=document.createElement("canvas");c.width=900;c.height=506;
 const context=c.getContext("2d");
 if(!context)throw new Error("Browser Canvas is required for offline raster preview");
 context.fillStyle="#f8fafc";context.fillRect(0,0,900,506);
 context.fillStyle=/^#[0-9a-fA-F]{6}$/.test(color)?color:"#124d83";
 context.fillRect(0,0,20,506);
 context.fillRect(55,70,78,6);
 context.font="bold 38px Arial";context.fillText(title.slice(0,42),55,150,780);
 context.font="21px Arial";context.fillStyle="#334155";
 const words=copy.split(/\s+/);let line="",y=214;
 for(const word of words){
  const trial=line?line+" "+word:word;
  if(context.measureText(trial).width>755){
   context.fillText(line,55,y,755);line=word;y+=34;
  }else line=trial;
  if(y>370)break;
 }
 if(y<=400)context.fillText(line,55,y,755);
 context.fillStyle="#64748b";context.font="bold 16px Arial";
 context.fillText("INTERNAL OFFLINE PREVIEW · NO PLATFORM DELIVERY",55,464);
 return c.toDataURL("image/png").split(",")[1]!;
}
async function shaText(value:string){
 const bytes=new TextEncoder().encode(value);
 const digest=await crypto.subtle.digest("SHA-256",bytes);
 return "sha256:"+Array.from(new Uint8Array(digest))
  .map(x=>x.toString(16).padStart(2,"0")).join("");
}
const dateAt=(days:number)=>new Date(Date.now()+days*86400_000).toISOString();

export default function OfflineCampaignJourneyStudio({identity,campaigns=[],products=[],campaignHandoff}:{identity:Identity|null;campaigns?:readonly CampaignChoice[];products?:readonly ProductChoice[];campaignHandoff?:{organizationId:string;userId:string;campaignId:string;revision:number}|null}){
 const [brands,setBrands]=useState<Brand[]>([]);
 const [brandId,setBrandId]=useState("");
 const [newBrandName,setNewBrandName]=useState("");
 const [newBrandSlug,setNewBrandSlug]=useState("");
 const [objectiveId,setObjectiveId]=useState("");
 const [productId,setProductId]=useState("");
 const [objectiveName,setObjectiveName]=useState("Offline scientific campaign objective");
 const [brief,setBrief]=useState("Present an evidence-led, compliance-conscious biotechnology innovation campaign to qualified research laboratories, with no unsupported claims.");
 const [sector,setSector]=useState("biotechnology");
 const [campaignId,setCampaignId]=useState("");
 const [lookupCampaignId,setLookupCampaignId]=useState("");
 const [workflowId,setWorkflowId]=useState("");
 const [brainRunId,setBrainRunId]=useState("");
 const [journey,setJourney]=useState<Journey|null>(null);
 const [creative,setCreative]=useState<OfflineCreative|null>(null);
 const [preview,setPreview]=useState<Preview|null>(null);
 const [versionHistory,setVersionHistory]=useState<CreativeDetail["revisions"]>([]);
 const [historyId,setHistoryId]=useState("");
 const [historicalPreview,setHistoricalPreview]=useState<Preview|null>(null);
 const [creativeTitle,setCreativeTitle]=useState("Scientific innovation · evidence first");
 const [creativeCopy,setCreativeCopy]=useState("Discover evidence-led research workflows with a scientific team. Product claims require independent source and regulatory review.");
 const [color,setColor]=useState("#124d83");
 const [rightsReason,setRightsReason]=useState("Independently checked authorship and mock rights for this offline-only raster.");
 const [destinationRef,setDestinationRef]=useState("");
 const [brandPolicyVersion,setBrandPolicyVersion]=useState("");
 const [creativeApprovalId,setCreativeApprovalId]=useState("");
 const [publicationId,setPublicationId]=useState("");
 const [syntheticContacts,setSyntheticContacts]=useState<Contact[]>([]);
 const [emailCopy,setEmailCopy]=useState("Synthetic email draft for an internal compliance journey. No recipients are real and no messages will be sent.");
 const [feedback,setFeedback]=useState("Offline workflow review: assess brand claims, independent approvals, mock delivery outcomes and tenant boundary checks before accepting lessons.");
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const admin=!!identity&&["ADMIN","SUPER_ADMIN"].includes(identity.role.toUpperCase());
 const manager=!!identity&&["ADMIN","SUPER_ADMIN","CMO","MARKETING_DIRECTOR"].includes(identity.role.toUpperCase());

 async function run(fn:()=>Promise<void>){
  setBusy(true);setError("");setNotice("");
  try{await fn()}catch(e){setError(e instanceof Error?e.message:"Operation failed")}
  finally{setBusy(false)}
 }
 async function refresh(forId=campaignId){
  if(!forId.trim())throw new Error("Select an existing campaign first");
  const r=await api("journeys/"+encodeURIComponent(forId)) as Journey;
  if(r.campaign.id!==forId||r.offlineSimulationOnly!==true||r.externalEffectsAuthorized!==false)
   throw new Error("Unexpected campaign timeline scope");
  // A typed lookup is not authoritative until the API has confirmed it.
  // Never mix the previous campaign's approval/creative with a new campaign.
  const switching=r.campaign.id!==campaignId;
  if(switching){
   setCreative(null);setPreview(null);setVersionHistory([]);
   setHistoryId("");setHistoricalPreview(null);setDestinationRef("");
   setCreativeApprovalId("");setPublicationId("");setSyntheticContacts([]);
  }
  setJourney(r);setCampaignId(r.campaign.id);setLookupCampaignId(r.campaign.id);
  setBrandId(r.campaign.brandId);
  setWorkflowId(r.workflow?.id??"");
  setBrainRunId(r.brainRuns[0]?.id??"");
  if(switching){setObjectiveId(r.campaign.objectiveId??"");setProductId(r.campaign.productId??"");}
  if(r.creativeAssets[0]&&(switching||!creative)) {
   const chosen=r.creativeAssets.find(x=>x.publicationLinked)??r.creativeAssets[0];
   // Campaign timeline is authoritative for linked metadata, but does not
   // contain a version-pinned PNG. Do NOT perform new DAM fetches while
   // refreshing unrelated journey/approval views. The editor loads the exact
   // current version only on explicit history refresh.
   setCreative({assetId:chosen.assetId,revisionId:chosen.revisionId,version:0,
    brandId:r.campaign.brandId,renditionDigest:chosen.renditionDigest,
    offlineOnly:true,sourceKind:"FLATTENED_EXPORT"});
   setPreview(null);setVersionHistory([]);
  }
 }
 async function load(){
  if(!identity)return;
  if(admin)setBrands(await api("tenancy/brands") as Brand[]);
  try{
   const master=await api("brand/active") as {version:number}|null;
   if(master?.version)setBrandPolicyVersion("v"+master.version);
  }catch{}
 }
 useEffect(()=>{
  setBrands([]);setJourney(null);setCampaignId("");setLookupCampaignId("");setWorkflowId("");
  setBrainRunId("");setCreative(null);setPreview(null);
  setVersionHistory([]);setHistoryId("");setHistoricalPreview(null);
  setDestinationRef("");
  setCreativeApprovalId("");setSyntheticContacts([]);setPublicationId("");
  setBrandPolicyVersion("");setObjectiveId("");setBrandId("");setProductId("");setNewBrandName("");setNewBrandSlug("");
  if(!identity)return;
  void load().catch(e=>setError(e instanceof Error?e.message:"Unable to load brand context"));
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[identity?.organizationId,identity?.userId]);

 // Prefill only. A selected campaign does not become the loaded campaign
 // until the existing explicit, tenant-authorized refresh succeeds.
 useEffect(()=>{
  if(!identity||!campaignHandoff||campaignHandoff.organizationId!==identity.organizationId||
   campaignHandoff.userId!==identity.userId||! /^[A-Za-z0-9_-]{1,128}$/.test(campaignHandoff.campaignId))return;
  setLookupCampaignId(campaignHandoff.campaignId);
  // Drop all prior campaign-scoped state on a different selection. Never
  // offer the previous approval or creative as part of the next campaign.
  if(campaignHandoff.campaignId!==campaignId){
   setCampaignId("");setJourney(null);setWorkflowId("");setBrainRunId("");
   setCreative(null);setPreview(null);setVersionHistory([]);setHistoryId("");
   setHistoricalPreview(null);setDestinationRef("");setCreativeApprovalId("");
   setPublicationId("");setSyntheticContacts([]);setObjectiveId("");setBrandId("");setProductId("");
  }
  setError("");setNotice("Campaign selected from workspace; load its durable timeline before acting.");
 },[identity?.organizationId,identity?.userId,campaignHandoff?.revision]);
 const activeApproval=journey?.campaignApprovals.find(a=>a.decision==="PENDING");
 const proposedCreative=journey?.creativeAssets.find(a=>a.revisionId===creative?.revisionId);
 const approvalForCreative=proposedCreative?.approvals.find(a=>a.decision==="PENDING");
  // Brand-scoped offline artwork can be rights-reviewed before a campaign
  // is loaded, provided its actual server preview was read back as current.
  // Once a journey is loaded, require its newer authoritative revision census.
  const creativeIsCurrent=journey
   ?selectedCreativeIsCurrent(journey.creativeAssets,creative)
   :!!creative&&!!preview&&preview.current===true&&
    preview.assetId===creative.assetId&&preview.revisionId===creative.revisionId;
 function downloadCreative(format:"png"|"copy"){
  if(!creative||!preview||!creativeIsCurrent||!manager){
   setError("Load the current verified offline creative version before exporting");return;
  }
  try{
   const exportable=validateOfflineCreativeDownload(creative,preview);
   const isPng=format==="png";
   const url=isPng?exportable.pngDataUrl:URL.createObjectURL(new Blob(
    [exportable.editableCopy],{type:"text/plain;charset=utf-8"}));
   const link=document.createElement("a");
   link.href=url;link.download=isPng?exportable.pngFilename:exportable.copyFilename;
   document.body.appendChild(link);link.click();link.remove();
   if(!isPng)setTimeout(()=>URL.revokeObjectURL(url),1000);
   setError("");
   setNotice("Downloaded existing current offline creative version "+exportable.version+
    ". This is a flattened preview/copy, not editable layered design source.");
  }catch(e){
   setError(e instanceof Error?e.message:"Creative export denied");
  }
 }
 async function downloadDerivedDesign(){
  if(!creative||!preview||!creativeIsCurrent||!manager){
   setError("Load the current verified offline creative version before deriving a draft");return;
  }
  await run(async()=>{
   // Fetch the canonical revision again. A changed or revoked current source
   // must not be exported under its old current-version assertion.
   const latest=await api("assets/revisions/"+encodeURIComponent(creative.revisionId)+"/offline-preview") as Preview;
   const derived=deriveOfflineEditableSvgDraft(creative,latest,color);
   const url=URL.createObjectURL(new Blob([derived.svg],{type:"image/svg+xml;charset=utf-8"}));
   const link=document.createElement("a");link.href=url;link.download=derived.filename;
   document.body.appendChild(link);link.click();link.remove();
   setTimeout(()=>URL.revokeObjectURL(url),1000);
   setNotice("Exported new editable SVG draft from revision "+derived.sourceVersion+
    ". Not the verified PNG; no inherited approval or rights, independent review required.");
  });
 }
 const blocked=!identity||busy;
 const approve=async(approvalId:string)=>{
  if(!identity)throw new Error("Sign in as a different authorized human reviewer");
  await api("approvals/decide",{
   commandId:uuid(),correlationId:uuid(),organizationId:identity.organizationId,
   approvalId,approverUserId:identity.userId,decision:"APPROVED",
   rationale:"Independently reviewed exact offline campaign or creative scope"
  });
  await refresh();
 };
 return <details style={{marginTop:20,background:"white",border:"1px solid #cbd5e1",
  borderRadius:14,padding:22}} aria-label="Complete offline campaign journey workspace">
  <summary style={{cursor:"pointer",fontWeight:800,fontSize:22,color:"#124d83"}}>
   Integrated Campaign Journey · Full Offline Lab
  </summary>
  <p style={{fontSize:13,color:"#475569"}}>
   Operate the existing canonical workflow, agents, DAM, approval, platform
   simulation, synthetic email, reporting and learning owners in one guided view.
   <strong> Real accounts, outbound posts, real email, model inference and real analytics are all disabled.</strong>
   Human reviewers must sign in using their own separate SSO identities.
  </p>
  {!identity?<p>Sign in through organization SSO and load the authenticated workspace above.</p>:<>
   {error&&<p role="alert" style={{color:"#b91c1c",fontSize:13}}>{error}</p>}
   {notice&&<p role="status" style={{color:"#166534",fontSize:13}}>{notice}</p>}
   <div style={section}>
    <h3 style={{marginTop:0}}>0 · Resume an existing campaign</h3>
    {campaigns.length>0&&<label style={label}>Choose campaign from workspace portfolio
     <select style={input} value={campaigns.some(c=>c.id===lookupCampaignId)?lookupCampaignId:""} disabled={blocked}
      onChange={e=>setLookupCampaignId(e.target.value)}>
      <option value="">Choose a campaign</option>
      {campaigns.map(c=><option key={c.id} value={c.id}>{c.name} · {c.code} · {c.status}</option>)}
     </select>
    </label>}
    <p style={{fontSize:12,color:"#475569"}}>Refresh the command center to update the portfolio, then load the selected timeline. The server checks tenant and access again.</p>
    <label style={label}>Tenant campaign ID
     <input style={input} value={lookupCampaignId} onChange={e=>setLookupCampaignId(e.target.value)}
      placeholder="Paste an approved or in-progress campaign ID"/>
    </label>
    <button style={secondary} disabled={blocked||!lookupCampaignId.trim()}
     onClick={()=>void run(async()=>{await refresh(lookupCampaignId.trim());setNotice("Canonical journey timeline refreshed")})}>
     Load durable cross-engine timeline
    </button>
    {journey&&<>
     <p style={{fontSize:13}}><strong>Loaded campaign:</strong> {journey.campaign.name} · {journey.campaign.status} · <code>{campaignId}</code></p>
     <div className="alpha-card" style={{boxShadow:"none",marginTop:12}} aria-label="Campaign milestone progress">
      <div className="alpha-status-row"><strong>Offline milestones</strong><span className="alpha-pill">{CAMPAIGN_STAGE_ORDER.filter(([key])=>journey.stages[key]===true).length}/{CAMPAIGN_STAGE_ORDER.length} evidenced</span></div>
      <progress aria-label="Evidenced offline campaign milestones" value={CAMPAIGN_STAGE_ORDER.filter(([key])=>journey.stages[key]===true).length} max={CAMPAIGN_STAGE_ORDER.length} style={{width:"100%",accentColor:"#087c83"}}/>
      <div className="alpha-grid">{CAMPAIGN_STAGE_ORDER.map(([key,title])=><div className="alpha-stat" key={key}>
       <span>{title}</span><div style={{fontSize:12,fontWeight:700,color:journey.stages[key]===true?"#166534":"#92400e"}}>{journey.stages[key]===true?"Evidenced":"Not demonstrated"}</div>
      </div>)}</div>
      <p className="alpha-subtle">Milestones describe the last loaded canonical offline journey; not live delivery, release permission or scientific validation.</p>
     </div>
     <details style={{marginTop:9}}><summary>Audited actions and simulation evidence</summary>
      <pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere",fontSize:11}}>
       {JSON.stringify(journey,null,2)}
      </pre>
     </details>
    </>}
   </div>

   <div style={section}>
    <h3 style={{marginTop:0}}>1 · Brief, objective and governed campaign</h3>
    {admin&&<fieldset style={{border:"1px solid #cbd5e1",borderRadius:8,padding:12,marginBottom:12}}>
     <legend>Register a tenant brand</legend>
     <p style={{fontSize:12}}>Use the existing tenant brand registry. Registration does not approve a Brand Master policy or authorize external publication.</p>
     <label style={label}>New brand name<input style={input} maxLength={150} disabled={blocked} value={newBrandName} onChange={e=>setNewBrandName(e.target.value)}/></label>
     <label style={label}>New brand slug<input style={input} maxLength={80} disabled={blocked} value={newBrandSlug} onChange={e=>setNewBrandSlug(e.target.value)} placeholder="research-brand"/></label>
     <button style={secondary} disabled={blocked||!newBrandName.trim()||! /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/.test(newBrandSlug.trim())} onClick={()=>void run(async()=>{
      const created=await api("tenancy/brands",{name:newBrandName.trim(),slug:newBrandSlug.trim()});
      if(created.organizationId!==identity.organizationId||created.status!=="ACTIVE"||created.externalEffectsAuthorized!==false||typeof created.id!=="string")throw Error("Unexpected brand registration scope");
      const list=await api("tenancy/brands") as Brand[];
      if(!list.some(x=>x.id===created.id&&x.status==="ACTIVE"))throw Error("Registered brand not found in tenant readback; refresh before retrying");
      setBrands(list);setNewBrandName("");setNewBrandSlug("");
      setNotice("Tenant brand registered and read back; select it for a new campaign");
     })}>Register tenant brand</button>
     <button style={{...secondary,marginLeft:8}} disabled={blocked} onClick={()=>void run(async()=>{setBrands(await api("tenancy/brands") as Brand[]);setNotice("Tenant brand registry refreshed");})}>Refresh tenant brands</button>
    </fieldset>}
    <label style={label}>Brand
     {brands.length?<select style={input} value={brandId} onChange={e=>setBrandId(e.target.value)}>
      <option value="">Choose active brand</option>
      {brands.filter(x=>!x.status||x.status==="ACTIVE").map(x=><option key={x.id} value={x.id}>{x.name}</option>)}
     </select>:<input style={input} value={brandId} onChange={e=>setBrandId(e.target.value)}
      placeholder="Existing tenant Brand ID"/>}
    </label>
    <label style={label}>Marketing objective (name)
     <input style={input} maxLength={160} value={objectiveName}
      onChange={e=>setObjectiveName(e.target.value)}/>
    </label>
    <label style={label}>Objective ID
     <input style={input} value={objectiveId} onChange={e=>setObjectiveId(e.target.value)}
      placeholder="Select an existing objective or create one"/>
    </label>
    <button style={secondary} disabled={blocked||!manager||objectiveName.trim().length<3}
     onClick={()=>void run(async()=>{
      const created=await api("objectives",{name:objectiveName,
       description:"Offline simulated journey objective: "+brief.slice(0,1000)});
      setObjectiveId(created.id);setNotice("Objective created in canonical catalogue");
     })}>Create objective</button>
    <label style={label}>Product for next campaign (optional)
     <select style={input} value={productId} disabled={blocked} onChange={e=>setProductId(e.target.value)}>
      <option value="">No catalogue product</option>
      {products.filter(p=>p.lifecycle==="ACTIVE").map(p=><option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
     </select>
    </label>
    {journey?.campaign.productId&&<p style={{fontSize:12}}>Loaded campaign product: {products.find(p=>p.id===journey.campaign.productId)?.name??journey.campaign.productId}. Agent research uses the stored campaign product, not unsaved selection changes.</p>}
    <p style={{fontSize:12}}>Catalogue identity does not establish scientific claims or regulatory approval. Review supporting knowledge separately.</p>
    <label style={label}>Campaign brief (reviewed as unverified instructions)
     <textarea style={{...input,minHeight:90}} maxLength={2000} value={brief}
      onChange={e=>setBrief(e.target.value)}/>
    </label>
    <button style={{...button,marginTop:8}} disabled={blocked||!brandId||!objectiveId||brief.trim().length<20}
     onClick={()=>void run(async()=>{
      const result=await api("workflows",{
       organizationId:identity.organizationId,requestedOutcome:brief.trim(),
       brandId,objectiveId,...(productId?{productId}:{})
      });
      setWorkflowId(result.workflowExecutionId);
      const id=result.output?.campaign?.campaignId as string|undefined;
      if(!id)throw new Error("Workflow did not return a durable campaign ID; inspect workflow");
      setCampaignId(id);await refresh(id);
      setNotice("Agent workflow created campaign and requested independent approval");
     })}>Run offline agent assessment → create campaign → request approval</button>
    {workflowId&&<p style={{fontSize:12}}>Workflow: {workflowId}</p>}
   </div>

   <div style={section}>
    <h3 style={{marginTop:0}}>2 · Evidence-aware agent research (review-only)</h3>
    <label style={label}>Sector
     <input style={input} maxLength={120} value={sector} onChange={e=>setSector(e.target.value)}/>
    </label>
    <button style={button} disabled={blocked||!campaignId}
     onClick={()=>void run(async()=>{
      const result=await api("brain/runs",{
       commandKey:"offline-brain-"+uuid(),campaignId,
       ...(journey?.campaign.objectiveId?{objectiveId:journey.campaign.objectiveId}:{}),
       ...(journey?.campaign.productId?{productId:journey.campaign.productId}:{}),
       requestedOutcome:brief,market:sector
      });
      setBrainRunId(result.id);
      const completed=await api("brain/runs/"+encodeURIComponent(result.id)+"/execute",{});
      setNotice("Governed brain result: "+completed.status+"; evidence remains review-only");
      await refresh();
     })}>Run governed 13-agent offline brain</button>
    {brainRunId&&<p style={{fontSize:12}}>Brain ledger: {brainRunId}. No provider model calls are required.</p>}
    <p style={{color:"#64748b",fontSize:12}}>
     Agent recommendations are not established scientific claims. Reviewed sources,
     licensing and brand rules are separate human-controlled authorities.
    </p>
   </div>

   <div style={section}>
    <h3 style={{marginTop:0}}>3 · Independent campaign approval</h3>
    {activeApproval?<p>Pending campaign approval: <code>{activeApproval.id}</code></p>:
     <p style={{fontSize:12,color:"#64748b"}}>Load the timeline to find a pending campaign approval.</p>}
    <button style={button} disabled={blocked||!manager||!activeApproval}
     onClick={()=>void run(async()=>{
      await approve(activeApproval!.id);setNotice("Independent campaign approval recorded");
     })}>Approve campaign as authenticated reviewer</button>
    <p style={{fontSize:12,color:"#475569"}}>
     Approvals are checked server-side; a creator cannot approve their own
     governed creative or bypass maker-checker using this workspace.
    </p>
   </div>

   <div style={section}>
    <h3 style={{marginTop:0}}>4 · Actual offline PNG creative and editable copy</h3>
    <label style={label}>Creative headline<input style={input} value={creativeTitle}
      maxLength={160} onChange={e=>setCreativeTitle(e.target.value)}/></label>
    <label style={label}>Campaign copy (editable separate from flattened raster)
     <textarea style={{...input,minHeight:100}} maxLength={4000} value={creativeCopy}
      onChange={e=>setCreativeCopy(e.target.value)}/>
    </label>
    <label style={label}>Accent color
     <input style={{...input,maxWidth:150}} value={color} maxLength={7}
      onChange={e=>setColor(e.target.value)}/>
    </label>
    <button style={button} disabled={blocked||!manager||!brandId||creativeCopy.trim().length<12}
     onClick={()=>void run(async()=>{
      const result=await api("assets/offline-raster",{
       brandId,title:creativeTitle,editableCopy:creativeCopy,
       pngBase64:localPng(creativeTitle,creativeCopy,color),
       rightsExpiresAt:dateAt(60),requestKey:uuid()
      }) as OfflineCreative;
      // A created raster is not usable until both server readback and verified
      // preview succeed. A failed readback cannot leave an approval-ready UI.
      await api("media/evidence/"+encodeURIComponent(result.revisionId)+"/verify-offline",{});
      const p=await api("assets/revisions/"+
       encodeURIComponent(result.revisionId)+"/offline-preview") as Preview;
      if(p.revisionId!==result.revisionId||!p.offlineOnly||
         p.renditionDigest!==result.renditionDigest||
         !p.imageDataUrl.startsWith("data:image/png;base64,"))
       throw new Error("Offline preview digest or origin mismatch");
      setCreative(result);setPreview(p);
      // First immutable revision is already proved by authoritative write +
      // server readback. Avoid an extra DAM read on the creation happy path.
      setVersionHistory([{id:result.revisionId,version:result.version,
       offlinePreviewAvailable:true,rightsReviewedAt:null}]);
      setHistoryId("");setHistoricalPreview(null);
      setCreativeApprovalId("");setPublicationId("");
      setNotice("Stored actual synthetic PNG with immutable version 1 and editable copy; independent rights review required.");
      if(campaignId)await refresh();
     })}>Generate and verify internal flattened raster draft</button>
    {creative&&<button style={{...secondary,marginLeft:9}}
      disabled={blocked||!manager||creativeCopy.trim().length<12||
       !Number.isSafeInteger(creative.version)||creative.version<1}
      onClick={()=>void run(async()=>{
       const asset=await api("assets/"+encodeURIComponent(creative.assetId)) as CreativeDetail;
       if(asset.brandId!==creative.brandId||asset.version!==creative.version)
        throw new Error("Creative changed since you loaded it. Refresh and review the latest version.");
       const next=await api("assets/"+encodeURIComponent(creative.assetId)+"/offline-revisions",{
        expectedVersion:creative.version,editableCopy:creativeCopy,
        pngBase64:localPng(creativeTitle,creativeCopy,color),
        rightsExpiresAt:dateAt(60),requestKey:uuid()
       }) as OfflineCreative;
       // As for the first version: never expose the new draft as usable
       // until authoritative server-side raster readback and preview succeed.
       await api("media/evidence/"+encodeURIComponent(next.revisionId)+"/verify-offline",{});
       const observed=await api("assets/revisions/"+
        encodeURIComponent(next.revisionId)+"/offline-preview") as Preview;
       if(observed.assetId!==creative.assetId||observed.version!==next.version||
          !observed.current||observed.renditionDigest!==next.renditionDigest||
          !observed.imageDataUrl.startsWith("data:image/png;base64,"))
        throw new Error("Revised offline creative readback does not match the saved version");
       setCreative(next);setPreview(observed);
       const history=await api("assets/"+encodeURIComponent(next.assetId)) as CreativeDetail;
       setVersionHistory(history.revisions.filter(x=>x.offlinePreviewAvailable));
       setHistoryId("");setHistoricalPreview(null);
       // A new immutable version invalidates earlier exact-content approval.
       setCreativeApprovalId("");setPublicationId("");
       setNotice("Saved immutable version "+next.version+
        ". Previous approval scopes are stale; new independent rights and release approval required.");
       if(campaignId)await refresh();
      })}>Save revised PNG and text as new version</button>}
    {creative&&<p style={{fontSize:12}}>Revision {creative.revisionId} · {creative.renditionDigest}</p>}
     {creative&&!creativeIsCurrent&&<p role="alert" style={{fontSize:13,color:"#b91c1c"}}>
      This selected artwork is not confirmed as the current revision in the latest campaign timeline.
      Use “Load current creative version and history” before rights review, exact approval or new publishing intent.
     </p>}
    {creative&&<button style={{...secondary,marginTop:10}} disabled={blocked||!manager}
      onClick={()=>void run(async()=>{
       const detail=await api("assets/"+encodeURIComponent(creative.assetId)) as CreativeDetail;
       if(detail.brandId!==creative.brandId)
        throw new Error("Selected creative brand mismatch");
       const current=detail.revisions.find(x=>x.version===detail.version&&
        x.offlinePreviewAvailable);
       if(!current)throw new Error("No current offline creative revision available");
       const p=await api("assets/revisions/"+
        encodeURIComponent(current.id)+"/offline-preview") as Preview;
       if(p.assetId!==creative.assetId||!p.current||
          p.version!==detail.version||p.revisionId!==current.id)
        throw new Error("Creative version changed during history read");
       setCreative({...creative,revisionId:p.revisionId,version:p.version,
        renditionDigest:p.renditionDigest});
       setPreview(p);setVersionHistory(detail.revisions.filter(x=>x.offlinePreviewAvailable));
       setHistoryId("");setHistoricalPreview(null);
       setNotice("Loaded current immutable creative v"+p.version+" and version history");
      })}>Load current creative version and history</button>}
    {creative&&versionHistory.length>0&&<div style={{marginTop:12}}>
     <label style={label}>Version history (read-only comparisons)
      <select style={input} value={historyId} onChange={e=>{
       setHistoryId(e.target.value);setHistoricalPreview(null);
      }}>
       <option value="">Select a saved revision</option>
       {versionHistory.map(rev=><option key={rev.id} value={rev.id}>
        Version {rev.version} {rev.rightsReviewedAt?"· rights reviewed":"· rights pending"}
        {rev.id===creative.revisionId?" · current":""}
       </option>)}
      </select>
     </label>
     <button style={secondary} disabled={blocked||!historyId}
      onClick={()=>void run(async()=>{
       const p=await api("assets/revisions/"+
        encodeURIComponent(historyId)+"/offline-preview") as Preview;
       if(p.assetId!==creative.assetId||!p.offlineOnly)
        throw new Error("Version does not belong to this offline creative");
       setHistoricalPreview(p);setNotice("Retrieved immutable creative version "+p.version);
      })}>Compare saved version</button>
     {historicalPreview&&<div style={{marginTop:10}}>
      <p style={{fontSize:12,fontWeight:650}}>Version {historicalPreview.version}
       {historicalPreview.current?" · current":" · historical (not current)"}</p>
      <img alt="Previously saved offline creative version" src={historicalPreview.imageDataUrl}
       style={{maxWidth:"100%",border:"1px solid #cbd5e1",borderRadius:8}}/>
      <p style={{fontSize:12,whiteSpace:"pre-wrap"}}>{historicalPreview.editableCopy}</p>
      <button style={secondary} disabled={blocked||!manager}
       onClick={()=>{setCreativeCopy(historicalPreview.editableCopy);
        setNotice("Loaded previous copy into unsaved editor; saving will append a NEW version.");}}>
       Reuse historical copy in editor</button>
     </div>}
    </div>}

    {preview&&<div style={{marginTop:12}}>
      <img alt="Generated offline campaign preview; not publishable media" src={preview.imageDataUrl}
       style={{maxWidth:"100%",border:"1px solid #cbd5e1",borderRadius:8}}/>
      <p style={{fontSize:12}}>Flattened PNG preview only. The text copy can be edited
       in a new draft; layered image source is not claimed.</p>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:10}}>
       <button type="button" style={secondary}
        disabled={blocked||!manager||!creative||!creativeIsCurrent}
        onClick={()=>downloadCreative("png")}>
        Download verified flattened PNG</button>
       <button type="button" style={secondary}
        disabled={blocked||!manager||!creative||!creativeIsCurrent}
        onClick={()=>downloadCreative("copy")}>
        Export editable draft copy (.txt)</button>
       <button type="button" style={secondary}
        disabled={blocked||!manager||!creative||!creativeIsCurrent}
        onClick={()=>void downloadDerivedDesign()}>
        Export new editable SVG draft (unapproved)</button>
      </div>
    </div>}
   </div>

   <PersistentLayeredDesignStudio key={identity.organizationId+":"+identity.userId} enabled={manager&&!busy}
    onSaved={assetId=>{
     if(creative?.assetId===assetId){setCreative(null);setPreview(null);setVersionHistory([]);setHistoryId("");
      setHistoricalPreview(null);setCreativeApprovalId("");setPublicationId("");}
    }}/>
   <div style={section}>
    <h3 style={{marginTop:0}}>5 · Independent rights review and immutable release approval</h3>
    <label style={label}>Rights review rationale
     <input style={input} value={rightsReason} onChange={e=>setRightsReason(e.target.value)}/>
    </label>
    <button style={secondary} disabled={blocked||!manager||!creative||!creativeIsCurrent}
     onClick={()=>void run(async()=>{
      await api("assets/revisions/"+encodeURIComponent(creative!.revisionId)+"/rights-review",{
       reason:rightsReason
      });
      await refresh();setNotice("Independent synthetic artwork rights review recorded");
     })}>Review offline rights as separate reviewer</button>
    <button style={{...secondary,marginLeft:8}} disabled={blocked||!admin||!brandId}
     onClick={()=>void run(async()=>{
      const response=await api("integrations",{
       brandId,providerKey:"META_GRAPH",
       destinationLabel:"Offline simulation placeholder "+uuid().slice(0,10)
      });
      setDestinationRef(response.destinationRef);
      setNotice("Registered PENDING_VERIFICATION destination metadata; no account, OAuth or provider access");
     })}>Register inert social destination metadata</button>
    <label style={label}>Pending-verification destination reference
     <input style={input} value={destinationRef} onChange={e=>setDestinationRef(e.target.value)}
      placeholder="internal:connected-destination/..."/>
    </label>
    <label style={label}>Current approved brand policy version
     <input style={input} value={brandPolicyVersion} onChange={e=>setBrandPolicyVersion(e.target.value)}
      placeholder="v1 (must be currently approved)"/>
    </label>
    <button style={button} disabled={blocked||!manager||!creative||!creativeIsCurrent||!destinationRef||!brandPolicyVersion}
     onClick={()=>void run(async()=>{
      const approval=await api("assets/revisions/"+
       encodeURIComponent(creative!.revisionId)+"/submit-approval",{
        channel:"SOCIAL",destinationRef,audienceRef:"internal:audience-snapshot/offline-journey",
        policyVersion:brandPolicyVersion,scheduledAt:dateAt(2),expiresAt:dateAt(4)
       });
      setCreativeApprovalId(approval.approvalId);await refresh();
      setNotice("Exact immutable creative release scope awaits independent reviewer");
     })}>Submit exact offline creative for approval</button>
    <p style={{fontSize:12}}>Creative approval: {creativeApprovalId||approvalForCreative?.id||"not requested"}</p>
    <button style={secondary}
     disabled={blocked||!manager||!creativeIsCurrent||!(creativeApprovalId||approvalForCreative?.id)}
     onClick={()=>void run(async()=>{
      await approve(creativeApprovalId||approvalForCreative!.id);
      setNotice("Independent exact-scope creative approval recorded");
     })}>Approve exact scope as independent reviewer</button>
   </div>

   <div style={section}>
    <h3 style={{marginTop:0}}>6 · Social sandbox — zero external publishing</h3>
    <button style={button} disabled={blocked||!manager||!campaignId||!creativeIsCurrent||
      !(creativeApprovalId||proposedCreative?.approvals.find(a=>a.decision==="APPROVED")?.id)}
     onClick={()=>void run(async()=>{
      const id=creativeApprovalId||
       proposedCreative?.approvals.find(a=>a.decision==="APPROVED")?.id;
      const result=await api("publications",{
       campaignId,approvalId:id,requestKey:uuid()
      });
      setPublicationId(result.publicationId);
      await refresh();setNotice("Canonical publication intent prepared; provider egress permanently blocked");
     })}>Prepare governed publication intent</button>
    <button style={{...secondary,marginLeft:8}} disabled={blocked||!publicationId}
     onClick={()=>void run(async()=>{
      const detail=await api("publications/"+encodeURIComponent(publicationId));
      const result=await api("publications/"+encodeURIComponent(publicationId)+"/simulate",{
       expectedVersion:detail.version,scenario:"SUCCESS",requestKey:uuid()
      });
      await refresh();
      setNotice("Social simulation "+result.status+": zero remote requests or posts");
     })}>Execute internal social transport simulation</button>
    <p style={{fontSize:12}}>Publication: {publicationId||"not prepared"}; simulated success is not provider delivery.</p>
   </div>

   <div style={section}>
    <h3 style={{marginTop:0}}>7 · Synthetic audience, consent and email journey</h3>
    <button style={button} disabled={blocked||!admin||!brandId}
     onClick={()=>void run(async()=>{
      const created=await api("audience/synthetic-contacts",{brandId}) as {contactId:string};
      await api("audience/synthetic-contacts/"+
       encodeURIComponent(created.contactId)+"/consent",{
        action:"SIMULATED_OPT_IN",requestKey:uuid()
       });
      const contacts=await api("audience/synthetic-contacts?brandId="+
       encodeURIComponent(brandId)) as Contact[];
      setSyntheticContacts(contacts);
      setNotice("Created anonymous synthetic recipient and mock consent; no legal opt-in exists");
     })}>Create synthetic recipient and mock consent</button>
    <label style={label}>Synthetic email copy
     <textarea style={{...input,minHeight:90}} value={emailCopy}
      onChange={e=>setEmailCopy(e.target.value)}/>
    </label>
    <button style={secondary} disabled={blocked||!admin||!campaignId||!syntheticContacts.length}
     onClick={()=>void run(async()=>{
      const result=await api("email/simulations",{
       brandId,campaignId,contactIds:syntheticContacts.map(x=>x.contactId),
       contentDigest:await shaText(emailCopy),requestKey:uuid(),scenario:"ACCEPTED"
      });
      await refresh();setNotice("Synthetic email "+result.status+
       "; actual messages sent: "+result.results.actualMessagesSent);
     })}>Simulate consent-gated email — no real send</button>
    <p style={{fontSize:12}}>Synthetic contacts: {syntheticContacts.length}.
     Withdrawals and complaints can be tested in the existing Email Studio.</p>
   </div>

   {campaignId&&identity&&<SyntheticChannelPlanStudio key={identity.organizationId+":"+identity.userId+":"+campaignId} campaignId={campaignId}/>}
   <div style={section}>
    <h3 style={{marginTop:0}}>8 · Reporting: keep simulations separate from real evidence</h3>
    <button style={secondary} disabled={blocked||!campaignId}
     onClick={()=>void run(async()=>{await refresh();setNotice("Evidence and timeline refreshed")})}>
     Refresh sandbox performance and audit
    </button>
    {journey&&<div style={{fontSize:13}}>
     <p>Social attempts: {journey.publications.reduce((n,p)=>n+p.attempts.filter(a=>a.mode==="SANDBOX").length,0)}
      {" "}· Synthetic email simulations: {journey.emailSimulations.length}
      {" "}· Independently reviewed source metrics: {journey.observations.filter(o=>o.status==="REVIEWED").length}</p>
     <p style={{color:"#92400e"}}>Simulated outcomes cannot prove impressions,
      actual send success, customer engagement, attribution or ROI.</p>
    </div>}
   </div>

   <div style={section}>
    <h3 style={{marginTop:0}}>9 · Governed learning feedback (quarantined)</h3>
    <label style={label}>Research sector
     <input style={input} value={sector} onChange={e=>setSector(e.target.value)}/>
    </label>
    <label style={label}>Offline test observation
     <textarea style={{...input,minHeight:85}} value={feedback}
      onChange={e=>setFeedback(e.target.value)}/>
    </label>
    <button style={button} disabled={blocked||!campaignId||feedback.trim().length<20}
     onClick={()=>void run(async()=>{
      await api("learning/signals",{
       topic:"offline simulation controls "+campaignId.slice(0,12),
       sector,sourceUrl:"https://example.invalid/offline-campaign/"+encodeURIComponent(campaignId),
       sourceTitle:"Internal synthetic campaign simulation — NOT market evidence",
       observedAt:new Date().toISOString(),evidence:{summary:feedback}
      });
      await refresh();
      setNotice("Feedback quarantined for independent review; no autonomous skill activation");
     })}>Quarantine synthetic learning observation</button>
   </div>
   <p style={{fontSize:12,color:"#92400e",marginTop:16}}>
    <strong>Release gate remains NOT CERTIFIED:</strong> No independent 500-case
    operator acceptance, production pentest/PITR proof, independent production tenant-isolation validation,
    provider entitlement, real social post or real email delivery is implied.
   </p>
  </>}
 </details>;
}
