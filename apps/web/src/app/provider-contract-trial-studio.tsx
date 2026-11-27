"use client";
import {useRef,useState} from "react";
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
 protocolSteps?:Array<{method:string;host:string;path:string;
 headerNames:string[];bodyKeys:string[];wireDigest:string}>;
 actualProviderRequests:0;actualEmailsSent:0;actualPostsPublished:0;
 actualModelCalls:0;actualMcpCalls:0;actualA2aCalls:0;
 verifiedRemoteReceipts:0;automaticRetryAllowed:false;
 externalEffectsAuthorized:false;limitation:string};
type EvidenceRow={trialRef:string;provider:string;scenario:string;contractOutcome:string;observedAt:string;fixtureOnly:true;externalEffectsAuthorized:false;verifiedRemoteReceipts:0;automaticRetryAllowed:false};
type History={organizationId:string;entries:EvidenceRow[];windowCapped:boolean;limit:number;fixtureOnly:true;actualProviderRequests:0;realAccountsConnected:0;externalEffectsAuthorized:false;productionCertified:false};
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
 const [history,setHistory]=useState<History|null>(null);
 const [matrix,setMatrix]=useState<TrialResult[]>([]);
 const [matrixTotal,setMatrixTotal]=useState(0);
 const [matrixComplete,setMatrixComplete]=useState(false);
 const running=useRef(false);
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
  if(running.current)return;running.current=true;setBusy(true);setError("");
  try{await fn();}catch(e){setError(e instanceof Error?e.message:"Trial failed");}
  finally{running.current=false;setBusy(false);}
 }
 async function refreshHistory(){
  const h=await call("history") as History;
  if(!identity||h.organizationId!==identity.organizationId||h.fixtureOnly!==true||h.productionCertified!==false||h.externalEffectsAuthorized!==false||h.actualProviderRequests!==0||h.realAccountsConnected!==0||h.limit!==100||!Array.isArray(h.entries)||h.entries.length>100||h.entries.some(e=>e.fixtureOnly!==true||e.externalEffectsAuthorized!==false||e.verifiedRemoteReceipts!==0||e.automaticRetryAllowed!==false))
   throw Error("Invalid offline receipt history; do not use as acceptance evidence");
  setHistory(h);
 }
 async function rehearseMatrix(){
  if(!catalog||catalog.mockOnly!==true||catalog.realNetworkCalls!==0||catalog.realAccountsConnected!==0||catalog.externalEffectsAuthorized!==false||!Array.isArray(catalog.providers)||catalog.providers.length<1||catalog.providers.length>20||new Set(catalog.providers).size!==catalog.providers.length)
   throw Error("Invalid fixture catalog");
  // One explicit, bounded sequence. Every entry calls the canonical receipt
  // owner; never retry, send real requests or infer provider authorization.
  const providers=[...catalog.providers],selectedScenario=scenario;
  setMatrix([]);setMatrixTotal(providers.length);setMatrixComplete(false);setHistory(null);
  const rows:TrialResult[]=[];
  for(const p of providers){
   const observed=await call("run",{provider:p,scenario:selectedScenario,requestKey:"matrix-"+crypto.randomUUID()}) as TrialResult;
   if(observed.provider!==p||observed.scenario!==selectedScenario||observed.fixtureOnly!==true||
    observed.externalEffectsAuthorized!==false||observed.automaticRetryAllowed!==false||
    [observed.actualProviderRequests,observed.actualEmailsSent,observed.actualPostsPublished,observed.actualModelCalls,observed.actualMcpCalls,observed.actualA2aCalls,observed.verifiedRemoteReceipts].some(n=>n!==0)||
    !["FIXTURE_MATCH","HTTP_ACCEPTED_UNVERIFIED","BLOCKED","OUTCOME_UNKNOWN","CONTRACT_REJECTED"].includes(observed.contractOutcome)||
    (selectedScenario==="AUTH_REJECTED"&&observed.contractOutcome!=="BLOCKED")||
    (selectedScenario==="TIMEOUT_AFTER_ACCEPT"&&observed.contractOutcome!=="OUTCOME_UNKNOWN"))
    throw Error("Unexpected fixture evidence; matrix stopped without automatic retry");
   rows.push(observed);setMatrix([...rows]);
  }
  await refreshHistory();setMatrixComplete(true);
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
    <select style={field} disabled={busy} value={provider} onChange={e=>{
     setProvider(e.target.value);setResult(null);setRequestKey("");
    }}>{catalog.providers.map(p=><option key={p}>{p}</option>)}</select>
   </label>
   <label style={{fontSize:13}}>Failure/success scenario
    <select style={field} disabled={busy} value={scenario} onChange={e=>{
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
  {catalog&&<div className="alpha-card" style={{marginTop:16}}>
   <h3>Cross-provider rehearsal matrix</h3>
   <p className="alpha-subtle">Run the selected scenario once across every catalog provider. Blocked and ambiguous outcomes are recorded as such; fixture matches are not real connection approval.</p>
   <button type="button" disabled={busy} onClick={()=>void perform(rehearseMatrix)}>Run selected scenario across catalog</button>
   {matrixTotal>0&&<p role="status">{matrix.length}/{matrixTotal} observed · {matrixComplete?"Matrix evidence recorded":busy?"Rehearsing fixtures":"Incomplete — inspect evidence before starting another run"}</p>}
   {matrix.length>0&&<div style={{overflowX:"auto"}}><table aria-label="Cross-provider rehearsal results"><thead><tr><th>Provider</th><th>Scenario</th><th>Fixture outcome</th><th>Remote receipts</th></tr></thead><tbody>{matrix.map(row=><tr key={row.trialRef}><td>{row.provider}</td><td>{row.scenario}</td><td>{row.contractOutcome}</td><td>{row.verifiedRemoteReceipts}</td></tr>)}</tbody></table></div>}
  </div>}
  <div className="alpha-card" style={{marginTop:16}}>
   <h3>Durable rehearsal history</h3>
   <button type="button" disabled={busy} onClick={()=>void perform(async()=>{setHistory(null);await refreshHistory();})}>Refresh stored trial evidence</button>
   {history&&<><p role="status">{history.entries.length} stored fixture receipts{history.windowCapped?" · latest 100 only":""} · zero real accounts connected.</p><div style={{overflowX:"auto"}}><table aria-label="Stored provider trial evidence"><thead><tr><th>Observed</th><th>Provider</th><th>Scenario</th><th>Fixture outcome</th></tr></thead><tbody>{history.entries.map(row=><tr key={row.trialRef}><td>{row.observedAt}</td><td>{row.provider}</td><td>{row.scenario}</td><td>{row.contractOutcome}</td></tr>)}</tbody></table></div></>}
   <p className="alpha-subtle">Historical tenant-admin inspection only; not an independent certification or a remote receipt.</p>
  </div>
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
   {!!result.protocolSteps?.length&&<details open style={{marginTop:12}}>
    <summary>Rehearsed protocol steps ({result.protocolSteps.length}) — no network</summary>
    <ol style={{fontSize:12,paddingLeft:20}}>
     {result.protocolSteps.map((step,i)=><li key={step.wireDigest+"-"+i}
      style={{marginTop:8,overflowWrap:"anywhere"}}>
      <strong>{step.method}</strong> {step.host}{step.path}
      <div>Body fields: {step.bodyKeys.join(", ")||"none"} ·
       header names: {step.headerNames.join(", ")}</div>
     </li>)}
    </ol>
   </details>}
   <p style={{fontSize:12,color:"#9f3030"}}>{result.limitation}</p>
   <p style={{fontSize:11,overflowWrap:"anywhere"}}>Internal trial reference: {result.trialRef}</p>
  </div>}
  {error&&<p role="alert" style={{color:"#9f3030"}}>{error}</p>}
 </section>;
}
