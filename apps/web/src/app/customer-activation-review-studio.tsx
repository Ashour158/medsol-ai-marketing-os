"use client";
import {useState} from "react";
type TargetKey="offlineGates"|"reviewedObservations"|"syntheticEmailRuns"|"virtualSocialRuns";
type Review={approvalId:string;decision:string;expired:boolean;input:{campaignId:string;brandId:string};value:Record<TargetKey,{target:number;observed:number;met:boolean}>;assessment:{reasons?:string[];readyForCustomerPilot:false};customerActivationAuthorized:false;productionCertified:false};
const targetsInitial={offlineGates:10,reviewedObservations:1,syntheticEmailRuns:1,virtualSocialRuns:1};
const labels:Record<TargetKey,string>={offlineGates:"Offline campaign gates",reviewedObservations:"Reviewed source observations",syntheticEmailRuns:"Synthetic email runs",virtualSocialRuns:"Virtual social runs"};
const field={width:"100%",boxSizing:"border-box" as const,border:"1px solid #cbd5e1",borderRadius:6,padding:8};
const button={background:"#124d83",color:"#fff",border:0,borderRadius:6,padding:9};
export default function CustomerActivationReviewStudio({campaignId,brandId}:{campaignId:string;brandId:string}){
 const [profile,setProfile]=useState(""),[expiry,setExpiry]=useState(""),[key,setKey]=useState(""),[confirmed,setConfirmed]=useState(false);
 const [targets,setTargets]=useState(targetsInitial),[reviews,setReviews]=useState<Review[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState("");
 async function call(body?:unknown){const r=await fetch("/api/marketing/tenancy/activation-reviews",{method:body===undefined?"GET":"POST",cache:"no-store",credentials:"same-origin",...(body===undefined?{}:{headers:{"content-type":"application/json"},body:JSON.stringify(body)})});const x=await r.json();if(!r.ok)throw Error(String(x.message??x.error??"Activation evidence request denied"));return x;}
 async function task(fn:()=>Promise<void>){setBusy(true);setError("");try{await fn();}catch(e){setError(e instanceof Error?e.message:"Request failed");}finally{setBusy(false);}}
 async function reload(){const x=await call();setReviews((x.reviews as Review[]).filter(a=>a.input.campaignId===campaignId&&a.input.brandId===brandId));}
 return <section aria-label="Customer onboarding and value review" style={{border:"1px solid #cbd5e1",borderRadius:10,padding:12,marginTop:12}}>
 <h3>Customer onboarding and value evidence — offline</h3>
 <p>Bind a reviewed business profile, existing brand and campaign. Targets are internal rehearsal milestones, not customer revenue or production acceptance. A separate reviewer decides the evidence snapshot in the existing approval queue.</p>
 <label>Reviewed business-profile document ID<input style={field} value={profile} disabled={busy} onChange={e=>{setProfile(e.target.value);setKey("");}}/></label>
 <label>Review expires within 30 days<input type="date" style={field} value={expiry} disabled={busy} onChange={e=>{setExpiry(e.target.value);setKey("");}}/></label>
 {Object.entries(labels).map(([k,label])=><label key={k}>{label}<input type="number" min={1} max={k==="offlineGates"?10:k==="reviewedObservations"?100:20} style={field} disabled={busy} value={targets[k as TargetKey]} onChange={e=>{setTargets(t=>({...t,[k]:Number(e.target.value)}));setKey("");}}/></label>)}
 <label><input type="checkbox" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/> Synthetic internal review only; no actual activation, billing or production access.</label>
 <p><button style={button} disabled={busy||!confirmed||!profile||!expiry} onClick={()=>void task(async()=>{const requestKey=key||"fixture-"+crypto.randomUUID();setKey(requestKey);await call({requestKey,brandId,campaignId,profileDocumentId:profile,expiresAt:new Date(expiry+"T23:59:59Z").toISOString(),fixtureOnly:true,targets});await reload();})}>Request independent onboarding evidence review</button>{" "}<button style={button} disabled={busy} onClick={()=>void task(reload)}>Load historical value reviews</button></p>
 {reviews.map(a=><article key={a.approvalId} style={{borderTop:"1px solid #cbd5e1",padding:9}}><strong>{a.decision}{a.expired?" · expired":""} · historical evidence only</strong><ul>{Object.entries(a.value).map(([k,v])=><li key={k}>{labels[k as TargetKey]}: {v.observed}/{v.target} · {v.met?"target met":"gap"}</li>)}</ul><p>Production not certified; no customer activation or billing authorized.</p><small>{a.approvalId}</small></article>)}
 {error&&<p role="alert">{error}</p>}
 </section>;
}
