"use client";
import {useState} from "react";
type Identity={userId:string;organizationId:string;email:string;role:string}|null;
type Catalog={providers:string[];scenarios:string[];
 protocolModes:Record<string,string>;mockOnly:true;realNetworkCalls:0;
 realAccountsConnected:0;externalEffectsAuthorized:false};
type TrialResult={provider:string;scenario:string;trialRef:string;
 contractOutcome:string;replayed:boolean;fixtureOnly:true;
 fixtureReadbackMatches:boolean;mockHttpExchanges:number;
 mockCallbacks:number;mockDeduplicatedCallbacks:number;
 wire:{method:string;host:string;path:string;headerNames:string[];
 bodyKeys:string[];wireDigest:string}|null;
 actualProviderRequests:0;actualEmailsSent:0;actualPostsPublished:0;
 actualModelCalls:0;actualMcpCalls:0;actualA2aCalls:0;
 verifiedRemoteReceipts:0;automaticRetryAllowed:false;
 externalEffectsAuthorized:false;limitation:string};
const button={background:"#124d83",color:"white",border:0,
 borderRadius:8,padding:"10px 14px",cursor:"pointer"};
const field={padding:10,border:"1px solid #cbd5e1",borderRadius:8,
 width:"100%",boxSizing:"border-box" as const,marginTop:5};
export default function ProviderContractTrialStudio({identity}:{identity:Identity}){
 const [catalog,setCatalog]=useState<Catalog|null>(null);
 const [provider,setProvider]=useState("META_GRAPH");
 const [scenario,setScenario]=useState("SUCCESS");
 const [requestKey,setRequestKey]=useState("");
 const [result,setResult]=useState<TrialResult|null>(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const admin=identity&&["ADMIN","SUPER_ADMIN"].includes(identity.role.toUpperCase());
 async function call(path:string,body?:unknown){
  const response=await fetch("/api/marketing/integrations/trials/"+path,{
   method:body===undefined?"GET":"POST",
   headers:body===undefined?{}:{"content-type":"application/json"},
   ...(body===undefined?{}:{body:JSON.stringify(body)}),
   cache:"no-store"});
  const data=await response.json();
  if(!response.ok)throw new Error(data.message??"Trial request denied");
  return data;
 }
 async function perform(fn:()=>Promise<void>){
  setBusy(true);setError("");
  try{await fn();}catch(e){setError(e instanceof Error?e.message:"Trial failed");}
  finally{setBusy(false);}
 }
 if(!admin)return null;
 return <section style={{background:"white",borderRadius:14,padding:24,marginTop:24}}>
  <h2 style={{marginTop:0}}>Official Provider Connection Trial Lab</h2>
  <p style={{color:"#475569",fontSize:13}}>
   Tests real provider API request/response formats using only local in-process
   fixtures. No real account, OAuth authorization, network request, email,
   social post, AI inference or MCP/A2A execution occurs.
  </p>
  <button style={button} disabled={busy} onClick={()=>perform(async()=>{
   setCatalog(await call("catalog") as Catalog);
  })}>Load trial provider catalog</button>
  {catalog&&<div style={{display:"grid",gridTemplateColumns:
   "repeat(auto-fit,minmax(210px,1fr))",gap:12,marginTop:14}}>
   <label style={{fontSize:13}}>Provider
    <select style={field} value={provider} onChange={e=>{
     setProvider(e.target.value);setResult(null);setRequestKey("");
    }}>{catalog.providers.map(p=><option key={p}>{p}</option>)}</select>
   </label>
   <label style={{fontSize:13}}>Failure/success scenario
    <select style={field} value={scenario} onChange={e=>{
     setScenario(e.target.value);setResult(null);setRequestKey("");
    }}>{catalog.scenarios.map(s=><option key={s}>{s}</option>)}</select>
   </label>
   <div style={{gridColumn:"1/-1",fontSize:13,color:"#475569"}}>
    {catalog.protocolModes[provider]}
   </div>
   <button style={button} disabled={busy} onClick={()=>perform(async()=>{
    const key=requestKey||"trial-"+crypto.randomUUID();
    setRequestKey(key);
    setResult(await call("run",{provider,scenario,requestKey:key}) as TrialResult);
   })}>Run in-process provider contract</button>
   <button style={{...button,background:"#64748b"}} disabled={busy}
    onClick={()=>{setRequestKey("");setResult(null);}}>
    New trial key</button>
  </div>}
  {result&&<div style={{marginTop:16,border:"1px solid #cbd5e1",
   borderRadius:10,padding:16}}>
   <p><strong>{result.provider}</strong> — {result.contractOutcome}
    {result.replayed?" · Idempotent replay":""}</p>
   <p style={{fontSize:13}}>Fixture HTTP exchanges: {result.mockHttpExchanges} ·
    fixture readback matched: {String(result.fixtureReadbackMatches)} ·
    callbacks: {result.mockCallbacks} (deduplicated: {result.mockDeduplicatedCallbacks})</p>
   <p style={{fontSize:13}}>Actual network requests: {result.actualProviderRequests} ·
    posts: {result.actualPostsPublished} · emails: {result.actualEmailsSent} ·
    AI calls: {result.actualModelCalls} · MCP/A2A: {result.actualMcpCalls+result.actualA2aCalls} ·
    verified remote receipts: {result.verifiedRemoteReceipts}</p>
   {result.wire&&<p style={{fontSize:13,overflowWrap:"anywhere"}}>
    Rehearsed HTTP: <code>{result.wire.method} {result.wire.host}{result.wire.path}</code>
    <br/>Body fields: {result.wire.bodyKeys.join(", ")||"none"} ·
    Header names only: {result.wire.headerNames.join(", ")}</p>}
   <p style={{fontSize:12,color:"#9f3030"}}>{result.limitation}</p>
   <p style={{fontSize:11,overflowWrap:"anywhere"}}>Internal trial reference: {result.trialRef}</p>
  </div>}
  {error&&<p role="alert" style={{color:"#9f3030"}}>{error}</p>}
 </section>;
}
