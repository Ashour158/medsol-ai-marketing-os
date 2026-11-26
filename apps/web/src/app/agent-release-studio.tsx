"use client";
import {useState} from "react";
import {releasePermissions} from "../lib/agent-release-ui";

type Identity={userId:string;organizationId:string;email:string;role:string}|null;
type Agent={id:string;name:string;mission:string;capabilities:string[]};
type ManifestRow={id:string;agentId:string;revision:number;status:string;
 digest:string;signatureTrusted:boolean;createdBy:string;approvedBy:string|null;
 manifest:{name:string;mission:string;capabilities:string[];skillKeys:string[];knowledgeKeys:string[]};
 externalEffectsAuthorized:false};
type Preview={manifest:Record<string,unknown>;digest:string;signaturePayload:string;
 signatureAlgorithm:"Ed25519";requiresIndependentReview:true;externalEffectsAuthorized:false};
type Baseline={manifest:Record<string,unknown>;activeVersion:number;installed:boolean;
 agentStatus:string;signatureRequired:true;externalEffectsAuthorized:false};
const field={display:"block",boxSizing:"border-box" as const,width:"100%",
 padding:10,border:"1px solid #ccd8e5",borderRadius:8,marginTop:6};
const button={padding:"9px 13px",borderRadius:8,border:0,
 background:"#124d83",color:"#fff",cursor:"pointer",fontWeight:700 as const};

export default function AgentReleaseStudio({identity}:{identity:Identity}){
 const [roster,setRoster]=useState<Agent[]>([]);
 const [rows,setRows]=useState<ManifestRow[]>([]);
 const [agentId,setAgentId]=useState("");
 const [baseline,setBaseline]=useState<Baseline|null>(null);
 const [draft,setDraft]=useState("");
 const [preview,setPreview]=useState<Preview|null>(null);
 const [previewDraft,setPreviewDraft]=useState("");
 const [signature,setSignature]=useState("");
 const [signerKeyId,setSignerKeyId]=useState("");
 const [reason,setReason]=useState("");
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [busy,setBusy]=useState(false);
 const admin=!!identity&&["ADMIN","SUPER_ADMIN"].includes(identity.role.toUpperCase());
 async function api(path:string,body?:unknown):Promise<any>{
  const response=await fetch("/api/marketing/agents/"+path,{
   method:body===undefined?"GET":"POST",
   headers:body===undefined?{}:{"content-type":"application/json"},
   ...(body===undefined?{}:{body:JSON.stringify(body)}),cache:"no-store"
  });
  const result=await response.json();
  if(!response.ok)throw Error(typeof result.message==="string"?result.message:
   "Agent release request denied ("+response.status+")");
  return result;
 }
 async function act(action:()=>Promise<void>){
  setBusy(true);setError("");setNotice("");
  try{await action();}catch(err){setError(err instanceof Error?err.message:"Unable to complete action");}
  finally{setBusy(false);}
 }
 async function refresh(){
  const [all,history]=await Promise.all([api(""),api("manifests")]);
  setRoster(all as Agent[]);setRows(history as ManifestRow[]);
 }
 async function selectAgent(id:string){
  setPreview(null);setPreviewDraft("");setSignature("");
  if(!id){setAgentId("");setBaseline(null);setDraft("");return;}
  const details=await api("manifests/baseline/"+encodeURIComponent(id)) as Baseline;
  setAgentId(id);setBaseline(details);setDraft(JSON.stringify(details.manifest,null,2));
 }
 if(!admin)return null;
 return <section id="agent-release-studio" style={{
  background:"#fff",borderRadius:14,padding:24,marginTop:20}}>
  <h2 style={{margin:"0 0 6px"}}>Agent Studio — signed release governance</h2>
  <p style={{fontSize:13,color:"#64748b"}}>
   Configure only existing canonical agents. Every proposed release requires an
   externally trusted Ed25519 signature and approval by a different human.
   Activation changes the tenant's offline agent configuration,
   <strong> not model, MCP, social or email permissions.</strong>
  </p>
  <button style={button} disabled={busy} onClick={()=>act(refresh)}>Load canonical agents and releases</button>
  {roster.length>0&&<div style={{marginTop:16}}>
   <label>Canonical agent
    <select style={field} value={agentId} disabled={busy}
     onChange={e=>void act(()=>selectAgent(e.target.value))}>
     <option value="">Choose agent to inspect</option>
     {roster.map(a=><option key={a.id} value={a.id}>{a.name} · {a.id}</option>)}
    </select>
   </label>
  </div>}
  {agentId&&baseline&&<div style={{marginTop:14,padding:15,border:"1px solid #dbe4ed",
   borderRadius:10,background:"#f8fafc"}}>
   <strong>Active tenant release: v{baseline.activeVersion}</strong>
   <span style={{fontSize:12,color:"#64748b"}}> · {baseline.agentStatus} ·
    {baseline.installed?" installed":" baseline not yet installed"}</span>
   <p style={{fontSize:12,color:"#64748b"}}>
    The canonical identity, risk, permissions and safety boundaries cannot be expanded.
    Edit only allowed restriction fields, then sign the canonical digest externally.
   </p>
   <div className="alpha-grid" style={{marginBottom:12}} aria-label="Agent release policy overview">
    {([["modelPolicy","Model policy"],["memoryPolicy","Memory policy"],["defaultRisk","Risk class"],["maxInputBytes","Input budget (bytes)"],["maxOutputTokens","Output budget (tokens)"]] as const).map(([key,label])=><div key={key} className="alpha-stat"><span>{label}</span><div style={{fontWeight:700,overflowWrap:"anywhere"}}>{typeof baseline.manifest[key]==="string"||typeof baseline.manifest[key]==="number"?String(baseline.manifest[key]):"Not supplied"}</div></div>)}
   </div>
   <div className="alpha-grid" style={{marginBottom:12}}>
    {([["capabilities","Canonical capabilities"],["knowledgeKeys","Knowledge scopes"],["skillKeys","Skill scopes"],["toolKeys","Allowed tool keys"]] as const).map(([key,label])=>{const v=baseline.manifest[key];const values=Array.isArray(v)?v.filter(x=>typeof x==="string") as string[]:[];return <div key={key} className="alpha-stage"><strong>{label}</strong>{values.length?<ul>{values.map(x=><li key={x}>{x}</li>)}</ul>:<p className="alpha-subtle">None in baseline</p>}</div>})}
   </div>
   <p className="alpha-subtle">Policy cards describe the canonical baseline, not the unsigned draft or installed release configuration. Signed revisions below remain authoritative.</p>
   <label>Proposed signed manifest (strict JSON)
    <textarea style={{...field,minHeight:210,fontFamily:"monospace",fontSize:12}}
     value={draft} onChange={e=>{
      setDraft(e.target.value);setPreview(null);setPreviewDraft("");setSignature("");
     }}/>
   </label>
   <button style={{...button,marginTop:12}} disabled={busy||!draft.trim()}
    onClick={()=>act(async()=>{
     const source=draft;
     const verified=await api("manifests/preview",{manifest:JSON.parse(source)}) as Preview;
     setPreview(verified);setPreviewDraft(source);setSignature("");
     setNotice("Server canonicalized this draft. Sign the exact bytes below with your trusted offline key.");
    })}>Validate draft and prepare offline signing packet</button>
   {preview&&previewDraft===draft&&<div style={{marginTop:12,padding:12,
    border:"1px solid #b8d4e8",borderRadius:8}}>
    <strong>Validated canonical SHA-256 digest</strong>
    <p style={{overflowWrap:"anywhere",fontSize:12}}>{preview.digest}</p>
    <label>Exact UTF-8 Ed25519 signing payload (read-only)
     <textarea readOnly style={{...field,minHeight:75,fontFamily:"monospace",fontSize:12}}
      value={preview.signaturePayload}/>
    </label>
    <p style={{fontSize:12,color:"#475569"}}>Sign these bytes outside the application; paste only the detached
     base64url signature and configured signer key ID. Never paste or upload a private key.
     A different administrator must still approve the signed release.</p>
   </div>}
   <div style={{display:"grid",gap:12,gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",marginTop:10}}>
    <label>Trusted signer key ID
     <input style={field} value={signerKeyId} onChange={e=>setSignerKeyId(e.target.value)}
      placeholder="Configured operator key ID"/>
    </label>
    <label>Ed25519 detached signature (base64url)
     <input style={field} value={signature} disabled={!preview||previewDraft!==draft}
      onChange={e=>setSignature(e.target.value)}
      placeholder="Signed digest, not private key"/>
    </label>
   </div>
   <button style={{...button,marginTop:12}} disabled={busy||!preview||previewDraft!==draft||!signature.trim()||!signerKeyId.trim()}
    onClick={()=>act(async()=>{
     if(!preview||previewDraft!==draft)throw Error("Validate the latest draft before signing");
     await api("manifests",{manifest:preview.manifest,signature:signature.trim(),signerKeyId:signerKeyId.trim()});
     setSignature("");setNotice("Signed release proposed. Independent approval is still mandatory.");
     await refresh();
    })}>Propose signed offline agent release</button>
  </div>}
  <h3 style={{margin:"20px 0 10px"}}>Tenant release history ({rows.length})</h3>
  {rows.length===0&&<p style={{color:"#64748b",fontSize:13}}>
   No releases loaded. Select a canonical agent or refresh the registry.
  </p>}
  {rows.map(row=>{
   const controls=releasePermissions(row,identity);
   const matching=agentId===row.agentId&&baseline;
   return <article key={row.id} style={{border:"1px solid #dbe4ed",
    borderRadius:10,padding:15,marginTop:10}}>
    <strong>{row.manifest.name}</strong> · v{row.revision} · {row.status}
    <div style={{fontSize:12,color:"#475569",marginTop:5}}>
     Signature: {row.signatureTrusted?"verified":"untrusted"} ·
     Created by {row.createdBy===identity?.userId?"you":"another administrator"} ·
     External effects: disabled
    </div>
    <div style={{fontSize:12,overflowWrap:"anywhere",marginTop:5}}>Digest: {row.digest}</div>
    <details style={{margin:"9px 0"}}><summary>Mission, tools, knowledge and capabilities</summary>
     <p style={{fontSize:13}}>{row.manifest.mission}</p>
     <p style={{fontSize:12}}>Capabilities: {row.manifest.capabilities.join(", ")}</p>
     <p style={{fontSize:12}}>Skills: {row.manifest.skillKeys.join(", ")||"none"} ·
      Knowledge: {row.manifest.knowledgeKeys.join(", ")||"none"}</p>
    </details>
    <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
     {controls.approve&&<button style={button} disabled={busy}
      onClick={()=>act(async()=>{
       await api("manifests/"+encodeURIComponent(row.id)+"/approve",
        {expectedRevision:row.revision});
       setNotice("Independent human release approval recorded; activation remains separate.");
       await refresh();
      })}>Independently approve</button>}
     {controls.activate&&<button style={button} disabled={busy||!matching}
      title={!matching?"Choose this agent first to verify the current version":undefined}
      onClick={()=>act(async()=>{
       await api("manifests/"+encodeURIComponent(row.id)+"/activate",
        {expectedAgentVersion:baseline!.activeVersion});
       await selectAgent(row.agentId);await refresh();
       setNotice("Activated signed offline release; no external permissions granted.");
      })}>Activate reviewed release</button>}
     {controls.revoke&&<button style={{...button,background:"#9b2525"}}
      disabled={busy||reason.trim().length<12}
      onClick={()=>act(async()=>{
       if(!window.confirm("Revoke this signed agent revision and roll back if active?"))return;
       await api("manifests/"+encodeURIComponent(row.id)+"/revoke",{reason:reason.trim()});
       if(agentId===row.agentId)await selectAgent(row.agentId);
       await refresh();setReason("");setNotice("Revision revoked.");
      })}>Revoke revision</button>}
    </div>
   </article>;
  })}
  {baseline&&baseline.activeVersion>1&&<div style={{marginTop:12,
   border:"1px solid #f2c6c6",padding:14,borderRadius:10}}>
   <strong>Emergency agent rollback</strong>
   <p style={{fontSize:12}}>Returns the selected canonical agent to baseline version 1.
    This does not erase audit history.</p>
   <button style={{...button,background:"#9b2525"}} disabled={busy||reason.trim().length<12}
    onClick={()=>act(async()=>{
     if(!window.confirm("Roll back "+agentId+" to signed baseline version 1?"))return;
     await api("manifests/"+encodeURIComponent(agentId)+"/rollback",
      {expectedAgentVersion:baseline.activeVersion,reason:reason.trim()});
     await selectAgent(agentId);await refresh();setReason("");
     setNotice("Offline agent configuration rolled back to baseline.");
    })}>Roll back selected agent</button>
  </div>}
  {rows.length>0&&<label style={{display:"block",marginTop:16}}>Revocation / rollback rationale (at least 12 characters)
   <textarea style={{...field,minHeight:70}} value={reason}
    onChange={e=>setReason(e.target.value)}/>
  </label>}
  {error&&<p role="alert" style={{background:"#fff1f1",color:"#9f3030",padding:12}}>{error}</p>}
  {notice&&<p role="status" style={{background:"#eff8f4",padding:12,color:"#126b4b"}}>{notice}</p>}
 </section>;
}
