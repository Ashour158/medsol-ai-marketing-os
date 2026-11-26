"use client";
import {useState} from "react";
type Product={id:string;code:string;name:string;lifecycle:string};
type Proposal={approvalId:string;decision:string;historicalOnly:boolean;expired:boolean;input:{productId:string;currency:string;kind:string;quantity:number};arithmetic:{priceChangeBasisPoints:string;proposedScenarioGrossProfitMicros:string;proposedGrossMarginBasisPoints:string}};
export default function SyntheticPricingStudio({enabled}:{enabled:boolean}){
 const [products,setProducts]=useState<Product[]>([]),[proposals,setProposals]=useState<Proposal[]>([]);
 const [productId,setProductId]=useState(""),[kind,setKind]=useState("PROMOTION"),[currency,setCurrency]=useState("EGP");
 const [base,setBase]=useState(""),[proposed,setProposed]=useState(""),[cost,setCost]=useState(""),[quantity,setQuantity]=useState("10"),[expiry,setExpiry]=useState(""),[key,setKey]=useState(""),[confirmed,setConfirmed]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const field={padding:9,width:"100%",boxSizing:"border-box" as const,border:"1px solid #cbd5e1",borderRadius:6};
 const button={background:"#124d83",color:"#fff",border:0,borderRadius:7,padding:9};
 const call=async(path:string,body?:unknown)=>{const res=await fetch("/api/marketing/products"+path,{credentials:"same-origin",cache:"no-store",method:body===undefined?"GET":"POST",...(body===undefined?{}:{headers:{"content-type":"application/json"},body:JSON.stringify(body)})});const x=await res.json();if(!res.ok)throw Error(typeof x?.message==="string"?x.message:"Pricing operation denied");return x;};
 async function refresh(){const [p,list]=await Promise.all([call(""),call("/synthetic-price-proposals")]);setProducts((p as Product[]).filter(x=>x.lifecycle==="ACTIVE"));setProposals(list.proposals);}
 async function act(fn:()=>Promise<void>){setBusy(true);setError("");setNotice("");try{await fn();}catch(e){setError(e instanceof Error?e.message:"Pricing operation failed");}finally{setBusy(false);}}
 const change=(fn:(v:string)=>void,v:string)=>{fn(v);setKey("");};
 const valid=[base,proposed,cost].every(v=>/^(0|[1-9][0-9]{0,11})$/.test(v))&&/^\d+$/.test(quantity)&&Number(quantity)>=1&&Number(quantity)<=100000&&/^[A-Z]{3}$/.test(currency);
 if(!enabled)return null;
 return <section aria-label="Synthetic price and promotion scenarios" style={{background:"#fff",border:"1px solid #dbe4ed",borderRadius:9,padding:14,marginTop:14}}>
  <h4>Price and promotion scenarios — offline only</h4><p>Use hypothetical unit amounts in millionths of the selected currency. No actual pricing, catalog mutation, finance approval or distribution is authorized.</p>
  <button style={button} disabled={busy} onClick={()=>void act(refresh)}>Load active products and prior proposals</button>
  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:10,marginTop:10}}>
   <label>Product<select style={field} disabled={busy} value={productId} onChange={e=>change(setProductId,e.target.value)}><option value="">Select product</option>{products.map(p=><option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}</select></label>
   <label>Proposal type<select style={field} disabled={busy} value={kind} onChange={e=>change(setKind,e.target.value)}><option>PROMOTION</option><option>PRICE_CHANGE</option></select></label>
   {([["Currency",currency,setCurrency],["Assumed base unit price (micros)",base,setBase],["Proposed unit price (micros)",proposed,setProposed],["Assumed unit cost (micros)",cost,setCost],["Scenario quantity",quantity,setQuantity]] as const).map(([label,value,setter])=><label key={label}>{label}<input style={field} disabled={busy} value={value} onChange={e=>change(setter,e.target.value)}/></label>)}
   <label>Proposal expiry<input type="date" style={field} disabled={busy} value={expiry} onChange={e=>change(setExpiry,e.target.value)}/></label>
  </div>
  <label><input type="checkbox" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/> I confirm these are hypothetical assumptions only.</label>
  <p><button style={button} disabled={busy||!confirmed||!valid||!productId||!expiry} onClick={()=>void act(async()=>{const proposalKey=key||"fixture-"+crypto.randomUUID();setKey(proposalKey);const p=await call("/synthetic-price-proposals",{proposalKey,productId,kind,currency,basePriceMicros:base,proposedPriceMicros:proposed,assumedUnitCostMicros:cost,quantity:Number(quantity),expiresAt:new Date(expiry+"T23:59:59Z").toISOString(),scenarioOnly:true});setNotice("Internal review request "+p.approvalId+" · use the existing approval queue. No actual price changed.");await refresh();})}>Request independent scenario review</button></p>
  <div>{proposals.map(p=><article key={p.approvalId} style={{borderTop:"1px solid #dbe4ed",padding:"8px 0"}}><strong>{p.input.kind} · {p.decision}{p.expired?" · expired":""}</strong><p>{p.input.currency} · {p.input.quantity} assumed units · price change {p.arithmetic.priceChangeBasisPoints} basis points · gross profit {p.arithmetic.proposedScenarioGrossProfitMicros} micros · margin {p.arithmetic.proposedGrossMarginBasisPoints} basis points</p><small>{p.approvalId} · historical scenario, not finance approval</small></article>)}</div>
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
 </section>;
}
