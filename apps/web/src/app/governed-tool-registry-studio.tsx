"use client";
import {useState} from "react";

type Identity={userId:string;organizationId:string;email:string;role:string}|null;
type ToolRow={id:string;kind:string;serverKey:string;name:string;
 trustTier:string;status:string;version:number;manifestDigest:string;
 signatureTrusted:boolean;createdBy?:string;approvedBy:string|null;
 manifest:{toolKeys:string[];declaredScopes:string[];endpointOrigin:string|null};
 remoteExecutionAuthorized:false;actualToolCalls:0};
const sample=JSON.stringify({
 kind:"MCP",serverKey:"offline_research",name:"Offline Research Catalog",
 endpointOrigin:null,toolKeys:["search_citations"],declaredScopes:["read_internal"],
 trustTier:"T0",dataClass:"INTERNAL",supportsWrites:false,
 maxResponseBytes:20000,timeoutMs:3000
},null,2);
const field={width:"100%",boxSizing:"border-box" as const,
 padding:10,border:"1px solid #cbd5e1",borderRadius:8,marginTop:6};
const button={padding:"9px 13px",background:"#124d83",color:"white",
 border:0,borderRadius:8,cursor:"pointer"};
export default function GovernedToolRegistryStudio({identity}:{identity:Identity}){
 const [rows,setRows]=useState<ToolRow[]>([]);
 const [manifest,setManifest]=useState(sample);
 const [signature,setSignature]=useState("");
 const [signerKeyId,setSignerKeyId]=useState("");
 const [reason,setReason]=useState("");
 const [inspection,setInspection]=useState<unknown>(null);
 const [error,setError]=useState("");
 const [busy,setBusy]=useState(false);
 const admin=identity&&["ADMIN","SUPER_ADMIN"].includes(identity.role.toUpperCase());
 async function call(path:string,body?:unknown){
  const response=await fetch("/api/marketing/tools/"+path,{
   method:body===undefined?"GET":"POST",
   headers:body===undefined?{}:{"content-type":"application/json"},
   ...(body===undefined?{}:{body:JSON.stringify(body)}),cache:"no-store"
  });
  const result=await response.json();
  if(!response.ok)throw new Error(result.message??"Tool registry request denied");
  return result;
 }
 async function perform(action:()=>Promise<void>){
  setBusy(true);setError("");
  try{await action();}catch(e){setError(e instanceof Error?e.message:"Request failed");}
  finally{setBusy(false);}
 }
 async function refresh(){setRows(await call("registrations") as ToolRow[]);}
 if(!admin)return null;
 return <section style={{background:"white",padding:24,borderRadius:14,marginTop:24}}>
  <h2 style={{marginTop:0}}>MCP & A2A Governance Studio</h2>
  <p style={{color:"#64748b",fontSize:13}}>
   Signed tool metadata, independent human approval and permanent revocation.
   <strong> No tool or peer can be called from this studio.</strong>
   Real network execution is locked, even for approved registrations.
  </p>
  <button style={button} disabled={busy} onClick={()=>perform(refresh)}>
   Refresh tenant tool registry</button>
  <details style={{marginTop:14}}>
   <summary>Register a signed manifest (quarantined only)</summary>
   <label style={{display:"block",marginTop:12}}>Exact manifest JSON
    <textarea style={{...field,minHeight:210,fontFamily:"monospace"}}
     value={manifest} onChange={e=>setManifest(e.target.value)}/>
   </label>
   <label style={{display:"block",marginTop:12}}>Trusted signer key ID
    <input style={field} value={signerKeyId}
     onChange={e=>setSignerKeyId(e.target.value)}
     placeholder="Server-configured signer key ID"/>
   </label>
   <label style={{display:"block",marginTop:12}}>Ed25519 detached signature (base64url)
    <textarea style={{...field,minHeight:68}} value={signature}
     onChange={e=>setSignature(e.target.value)}/>
   </label>
   <button style={{...button,marginTop:12}} disabled={busy||!signature||!signerKeyId}
    onClick={()=>perform(async()=>{
     await call("registrations",{manifest:JSON.parse(manifest),signature,signerKeyId});
     await refresh();
    })}>Quarantine signed manifest</button>
  </details>
  {rows.length===0?<p style={{fontSize:13,color:"#64748b"}}>
   No registrations loaded. A trusted Ed25519 signer must be configured by the platform operator
   before independent approval can succeed.</p>:rows.map(row=>
   <div key={row.id} style={{border:"1px solid #dbe4ed",padding:16,
    borderRadius:10,marginTop:12}}>
    <strong>{row.name}</strong> · {row.kind} · {row.trustTier}
    <p style={{fontSize:13}}>Status: <strong>{row.status}</strong> ·
     Trusted signature: {row.signatureTrusted?"verified":"unverified"} ·
     Version {row.version}</p>
    <p style={{fontSize:12,overflowWrap:"anywhere"}}>
     Manifest: {row.manifestDigest}</p>
    <p style={{fontSize:12}}>Declared tools: {row.manifest.toolKeys.join(", ")} ·
     scopes: {row.manifest.declaredScopes.join(", ")}</p>
    <p style={{fontSize:12}}>Actual calls: {row.actualToolCalls} ·
     remote execution: disabled</p>
    <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
     {row.status==="QUARANTINED"&&
      <button style={button} disabled={busy||!row.signatureTrusted}
       onClick={()=>perform(async()=>{
        await call("registrations/"+encodeURIComponent(row.id)+"/approve",
         {expectedVersion:row.version});
        await refresh();
       })}>Independent approval</button>}
     {row.status!=="REVOKED"&&
      <button style={{...button,background:"#9f3030"}} disabled={busy||reason.trim().length<12}
       onClick={()=>perform(async()=>{
        if(!window.confirm("Permanently revoke this tool manifest?"))return;
        await call("registrations/"+encodeURIComponent(row.id)+"/revoke",
         {expectedVersion:row.version,reason});
        await refresh();setReason("");
       })}>Permanently revoke</button>}
     <button style={button} disabled={busy} onClick={()=>perform(async()=>{
      setInspection(await call("registrations/"+encodeURIComponent(row.id)+"/inspect",{
       toolKey:row.manifest.toolKeys[0],requestedScope:row.manifest.declaredScopes[0]
      }));
     })}>Inspect no-egress policy</button>
    </div>
   </div>
  )}
  <label style={{display:"block",marginTop:12}}>Revocation rationale (12+ characters)
   <input style={field} value={reason} onChange={e=>setReason(e.target.value)}/>
  </label>
  {inspection!==null&&<details open style={{marginTop:12}}>
   <summary>Tool policy inspection — zero calls</summary>
   <pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>
    {JSON.stringify(inspection,null,2)}</pre>
  </details>}
  {error&&<p role="alert" style={{color:"#9f3030"}}>{error}</p>}
 </section>;
}
