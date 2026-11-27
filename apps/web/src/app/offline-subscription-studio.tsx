"use client";
import {useRef,useState} from "react";
type Identity={organizationId:string;userId:string;role:string};
type State={organizationId:string;revision:number;state:string;effectiveState:string;plan:string|null;termEndsAt:string|null;simulatedEntitledActions:string[];fixtureOnly:true;billingAuthorized:false;realEntitlementsGranted:false;externalEffectsAuthorized:false;productionCertified:false;reviews:Array<{approvalId:string;decision:string;revision:number;input:{action:string;plan:string;termEndsAt:string};reviewExpiresAt:string}>;historyCapped:boolean};
export default function OfflineSubscriptionStudio({identity}:{identity:Identity}){
 if(!["ADMIN","SUPER_ADMIN"].includes(identity.role.toUpperCase()))return null;
 return <SubscriptionPanel key={identity.organizationId+":"+identity.userId} identity={identity}/>;
}
function SubscriptionPanel({identity}:{identity:Identity}){
 const [current,setCurrent]=useState<State|null>(null);
 const [action,setAction]=useState("START");
 const [plan,setPlan]=useState("INTERNAL_BASIC");
 const [term,setTerm]=useState("");
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState("");
 const [error,setError]=useState("");
 const pending=useRef(false);
 const commandKey=useRef("");
 async function call(body?:unknown){
  const res=await fetch("/api/marketing/tenancy/offline-subscription",{method:body===undefined?"GET":"POST",cache:"no-store",credentials:"same-origin",...(body===undefined?{}:{headers:{"content-type":"application/json"},body:JSON.stringify(body)})});
  const data=await res.json();if(!res.ok)throw Error(typeof data.message==="string"?data.message:"Subscription request denied");return data;
 }
 async function refresh(){
  const data=await call() as State;
  if(data.organizationId!==identity.organizationId||data.fixtureOnly!==true||data.billingAuthorized!==false||data.realEntitlementsGranted!==false||data.externalEffectsAuthorized!==false||data.productionCertified!==false||!Array.isArray(data.reviews)||!Array.isArray(data.simulatedEntitledActions))throw Error("Invalid offline subscription projection");
  setCurrent(data);setAction(data.state==="NONE"?"START":data.state==="SUSPENDED"?"RESUME":"CHANGE");
  setPlan(data.plan??"INTERNAL_BASIC");setTerm(data.termEndsAt?.slice(0,10)??new Date(Date.now()+30*86400000).toISOString().slice(0,10));commandKey.current="";
 }
 async function run(fn:()=>Promise<void>){
  if(pending.current)return;pending.current=true;setBusy(true);setError("");setNotice("");
  try{await fn();}catch(e){setError(e instanceof Error?e.message:"Subscription operation failed");}finally{pending.current=false;setBusy(false);}
 }
 const actions=current?.state==="NONE"?["START"]:current?.state==="SUSPENDED"?["RESUME","CANCEL"]:current?.state==="ACTIVE"?["CHANGE","RENEW","SUSPEND","CANCEL"]:[];
 const usesExistingTerm=!["START","RENEW"].includes(action);
 const usesExistingPlan=!["START","CHANGE"].includes(action);
 return <section className="alpha-card" aria-label="Offline subscription governance" style={{marginTop:16}}>
  <h3>Offline subscription governance</h3>
  <p>Rehearse plan lifecycle using independent approval. No payment, real entitlement, customer activation or provider permission is created.</p>
  <button type="button" disabled={busy} onClick={()=>void run(refresh)}>Load subscription state</button>
  {current&&<><p><strong>{current.effectiveState}</strong> · revision {current.revision} · {current.plan??"No plan"}</p>
   <p>Term ends: {current.termEndsAt??"Not set"}</p>
   <p>Simulated entitlements: {current.simulatedEntitledActions.join(", ")||"None"}</p>
   {actions.length>0&&<div className="alpha-grid"><label>Lifecycle action<select value={action} disabled={busy} onChange={e=>{setAction(e.target.value);commandKey.current="";}}>{actions.map(a=><option key={a}>{a}</option>)}</select></label>
   <label>Offline plan<select value={usesExistingPlan?current.plan??plan:plan} disabled={busy||usesExistingPlan} onChange={e=>{setPlan(e.target.value);commandKey.current="";}}><option>INTERNAL_BASIC</option><option>INTERNAL_TEAM</option></select></label>
   <label>Term ends (UTC date)<input type="date" disabled={busy||usesExistingTerm} value={usesExistingTerm?current.termEndsAt?.slice(0,10)??"":term} onChange={e=>{setTerm(e.target.value);commandKey.current="";}}/></label>
   <button type="button" disabled={busy||!term||!actions.includes(action)} onClick={()=>void run(async()=>{
    const key=commandKey.current||"fixture-"+crypto.randomUUID();commandKey.current=key;
    const result=await call({requestKey:key,expectedRevision:current.revision,action,plan:usesExistingPlan?current.plan:plan,termEndsAt:usesExistingTerm?current.termEndsAt:new Date(term+"T00:00:00.000Z").toISOString(),fixtureOnly:true});
    if(result.fixtureOnly!==true||result.realEntitlementsGranted!==false||result.billingAuthorized!==false||result.externalEffectsAuthorized!==false)throw Error("Unexpected subscription review evidence");
    await refresh();setNotice("Review "+result.approvalId+" · "+result.decision+". A different tenant admin must decide in the existing Approval inbox.");
   })}>Request independent subscription review</button></div>}
   {current.historyCapped&&<p>Showing latest 100 reviews only.</p>}
   <div style={{overflowX:"auto"}}><table aria-label="Offline subscription reviews"><thead><tr><th>Revision</th><th>Action</th><th>Plan</th><th>Decision</th><th>Review deadline (UTC)</th><th>Approval reference</th></tr></thead><tbody>{current.reviews.map(row=><tr key={row.approvalId}><td>{row.revision}</td><td>{row.input.action}</td><td>{row.input.plan}</td><td>{row.decision}</td><td>{row.reviewExpiresAt}</td><td style={{overflowWrap:"anywhere"}}>{row.approvalId}</td></tr>)}</tbody></table></div>
  </>}
  {notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error}</p>}
 </section>;
}
