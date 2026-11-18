"use client";
import {useEffect,useState} from "react";
type Identity={userId:string;organizationId:string;role:string};
type Provider={key:string;label:string;connectionLive:false};
type Connection={id:string;brandId:string;providerKey:string;destinationLabel:string;
 destinationRef:string;status:string;version:number;providerVerified:false;
 credentialsConnected:false;externalEffectsAuthorized:false};
type Proof={id:string;creativeAssetRevisionId:string;sha256Digest:string;
 detectedMime:string;objectVersion:string;sizeBytes:number;status:string};
const field={width:"100%",boxSizing:"border-box" as const,padding:"9px 11px",
 border:"1px solid #cbd5e1",borderRadius:8,background:"white",color:"#0f172a"};
const button={background:"#145287",color:"white",border:0,borderRadius:8,
 padding:"10px 14px",fontWeight:650 as const,cursor:"pointer"};
const adminRoles=new Set(["ADMIN","SUPER_ADMIN"]);
/** Registration UI only; intentionally contains no token, OAuth or publish input. */
export default function IntegrationGovernanceStudio({identity}:{identity:Identity|null}){
 const [providers,setProviders]=useState<Provider[]>([]);
 const [connections,setConnections]=useState<Connection[]>([]);
 const [proofs,setProofs]=useState<Proof[]>([]);
 const [brandId,setBrandId]=useState("");
 const [providerKey,setProviderKey]=useState("");
 const [destinationLabel,setDestinationLabel]=useState("");
 const [reason,setReason]=useState("");
 const [selectedId,setSelectedId]=useState("");
 const [connectionHealth,setConnectionHealth]=useState<{tokenReceived:boolean;tokenStatus:string;
  connectionStatus:string;accountOwnershipVerified:false;providerCapabilityVerified:false;
  externalEffectsAuthorized:false}|null>(null);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [busy,setBusy]=useState(false);
 const authorized=!!identity&&adminRoles.has(identity.role.toUpperCase());
 async function call(path:string,body?:unknown):Promise<any>{
  const res=await fetch("/api/marketing/"+path,{method:body===undefined?"GET":"POST",
   cache:"no-store",headers:body===undefined?{}:{"content-type":"application/json"},
   ...(body===undefined?{}:{body:JSON.stringify(body)})});
  const result:unknown=await res.json();
  if(!res.ok)throw new Error(typeof result==="object"&&result!==null&&"message" in result?
   String(result.message):"Request failed ("+res.status+")");
  return result;
 }
 async function load(){
  const [c,p,m]=await Promise.all([
   call("integrations"),call("integrations/catalog"),call("media/evidence")
  ]);
  setConnections(c as Connection[]);setProviders(p as Provider[]);setProofs(m as Proof[]);
 }
 useEffect(()=>{
  setConnections([]);setProofs([]);setProviders([]);setSelectedId("");setConnectionHealth(null);setNotice("");
  if(!authorized)return;
  void load().catch(e=>setError(e instanceof Error?e.message:"Cannot load integration metadata"));
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[identity?.organizationId,identity?.userId,identity?.role]);
 const run=async(fn:()=>Promise<void>)=>{
  setBusy(true);setNotice("");setError("");
  try{await fn();}catch(e){setError(e instanceof Error?e.message:"Operation failed");}
  finally{setBusy(false);}
 };
 const chosen=connections.find(x=>x.id===selectedId);
 return <details style={{marginTop:20,padding:22,borderRadius:14,
  background:"#fff",border:"1px solid #dbe4ed"}} aria-label="Provider integration governance">
  <summary style={{fontSize:21,fontWeight:750,color:"#145287",cursor:"pointer"}}>
   R2B · Integration Hub & Verified Media Evidence
  </summary>
  <p style={{color:"#64748b",fontSize:13}}>
   Register intended social destinations by tenant and brand, inspect server-verified
   media evidence, or permanently revoke access metadata. No live OAuth tokens,
   active provider scopes, outbound publishing or email delivery are available.
  </p>
  {!authorized?<p>Verified tenant-admin OIDC access is required to view integration registrations.</p>:<>
   {error&&<p role="alert" style={{color:"#b91c1c"}}>{error}</p>}
   {notice&&<p role="status" style={{color:"#166534"}}>{notice}</p>}
   <button style={button} disabled={busy} onClick={()=>void run(load)}>Refresh integration evidence</button>
   <fieldset style={{marginTop:15,padding:16,border:"1px solid #e2e8f0",borderRadius:10}}>
    <legend style={{fontWeight:700}}>Register intended brand destination</legend>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:12}}>
     <label>Existing tenant Brand ID
      <input style={field} value={brandId} onChange={e=>setBrandId(e.target.value)}
       placeholder="Authorized Brand ID"/></label>
     <label>Declared social provider
      <select style={field} value={providerKey} onChange={e=>setProviderKey(e.target.value)}>
       <option value="">Select provider</option>
       {providers.map(p=><option key={p.key} value={p.key}>{p.label} (not connected)</option>)}
      </select></label>
     <label>Destination label (not an account connection)
      <input style={field} value={destinationLabel} onChange={e=>setDestinationLabel(e.target.value)}
       maxLength={90} placeholder="Campaign page placeholder"/></label>
    </div>
    <button style={{...button,marginTop:12}} disabled={busy||!brandId.trim()||!providerKey||
      destinationLabel.trim().length<3}
     onClick={()=>void run(async()=>{
      const created=await call("integrations",{brandId,providerKey,destinationLabel}) as Connection;
      await load();setSelectedId(created.id);setDestinationLabel("");
      setNotice("Destination metadata registered. Provider credentials and permissions remain UNVERIFIED.");
     })}>Register destination metadata</button>
   </fieldset>
   <fieldset style={{marginTop:16,padding:16,border:"1px solid #e2e8f0",borderRadius:10}}>
    <legend style={{fontWeight:700}}>Govern connection lifecycle</legend>
    <label>Registered destination
     <select style={field} value={selectedId} onChange={e=>{setSelectedId(e.target.value);setConnectionHealth(null);}}>
      <option value="">Select destination</option>
      {connections.map(x=><option key={x.id} value={x.id}>
       {x.destinationLabel} · {x.providerKey} · {x.status}
      </option>)}
     </select>
    </label>
    {chosen&&<>
     <p style={{fontSize:13,overflowWrap:"anywhere"}}>
      Use this immutable reference in a future creative approval:
      <code>{chosen.destinationRef}</code>
     </p>
     <button style={{...button,marginTop:8}} disabled={busy} onClick={()=>void run(async()=>{
      setConnectionHealth(await call("integrations/"+encodeURIComponent(chosen.id)+"/health"));
     })}>Inspect OAuth readiness (read-only)</button>
     {connectionHealth&&<p role="status" style={{fontSize:13}}>
      Encrypted token: <strong>{connectionHealth.tokenStatus}</strong> ·
      Provider account ownership verified: <strong>No</strong> ·
      Provider publishing capabilities verified: <strong>No</strong> ·
      External delivery: <strong>Disabled</strong>
     </p>}
     <p style={{fontSize:13}}>Status: <strong>{chosen.status}</strong> ·
      Credential verification: <strong>NOT CONNECTED</strong> ·
      External delivery authorized: <strong>NO</strong>
     </p>
     <label>Human governance reason
      <textarea style={{...field,minHeight:55}} value={reason} maxLength={500}
       onChange={e=>setReason(e.target.value)}/></label>
     <div style={{marginTop:10,display:"flex",gap:10,flexWrap:"wrap"}}>
      {(["SUSPEND","REVOKE"] as const).map(action=>
       <button key={action} style={{...button,background:action==="REVOKE"?"#a11b30":"#92400e"}}
        disabled={busy||reason.trim().length<12||chosen.status==="REVOKED"||
         (action==="SUSPEND"&&chosen.status!=="PENDING_VERIFICATION")}
        onClick={()=>void run(async()=>{
         await call("integrations/"+encodeURIComponent(chosen.id)+"/"+action.toLowerCase(),{
          expectedVersion:chosen.version,reason:reason.trim()});
         await load();setReason("");
         setNotice(action==="REVOKE"?"Connection registration revoked permanently.":"Registration suspended.");
        })}>{action==="REVOKE"?"Revoke permanently":"Suspend registration"}</button>
      )}
     </div>
    </>}
   </fieldset>
   <fieldset style={{marginTop:16,padding:16,border:"1px solid #e2e8f0",borderRadius:10}}>
    <legend style={{fontWeight:700}}>Verified media readback evidence</legend>
    <p style={{fontSize:12,color:"#64748b"}}>
     Only a trusted backend object reader can create a verified media record after
     reading actual immutable object-version bytes and checking SHA-256. The UI
     cannot assert a hash or submit arbitrary URLs as verification.
    </p>
    {proofs.length===0?<p>No verified byte-readback records.</p>:<ul>
     {proofs.map(p=><li key={p.id} style={{marginBottom:8}}>
      Revision {p.creativeAssetRevisionId} · {p.status} · {p.detectedMime} ·
      {p.sizeBytes} bytes · object version {p.objectVersion}
      <code style={{display:"block",overflowWrap:"anywhere"}}>{p.sha256Digest}</code>
      {p.status!=="REVOKED"&&<button style={{...button,background:"#a11b30",marginTop:6}}
       disabled={busy||reason.trim().length<12}
       onClick={()=>void run(async()=>{
        await call("media/evidence/"+encodeURIComponent(p.creativeAssetRevisionId)+"/revoke",{
         reason:reason.trim()});
        await load();setReason("");
        setNotice("Media evidence revoked; proof cannot be silently restored.");
       })}>Revoke media evidence</button>}
     </li>)}
    </ul>}
   </fieldset>
  </>}
 </details>;
}
