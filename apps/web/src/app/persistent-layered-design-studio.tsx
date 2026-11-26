"use client";
import {useState} from "react";
type Revision={id:string;version:number;offlinePreviewAvailable:boolean;layeredPreviewAvailable:boolean};
type Asset={id:string;title:string;version:number;brandId:string;revisions:Revision[]};
const locales=["en-EG","en-GB","en-US","ar-EG","ar-SA","ar-AE","fr-FR","fr-MA"] as const;
type Locale=typeof locales[number];
type Spec={format:"SQUARE"|"PORTRAIT";title:string;body:string;accent:string;locale?:Locale};
type Preview={assetId:string;revisionId:string;version:number;current:boolean;parentRevisionId:string;spec:Spec;
 sourceDigest:string;renditionDigest:string;svgDataUrl:string;offlineOnly:true;releaseAuthorized:false;externalEffectsAuthorized:false};
const button={background:"#124d83",color:"#fff",padding:"9px 12px",border:0,borderRadius:7,cursor:"pointer"};
const field={display:"block",width:"100%",padding:8,border:"1px solid #cbd5e1",borderRadius:6,boxSizing:"border-box" as const};
export default function PersistentLayeredDesignStudio({enabled,onSaved}:{enabled:boolean;onSaved:(assetId:string)=>void}){
 const [assetId,setAssetId]=useState(""),[asset,setAsset]=useState<Asset|null>(null);
 const [spec,setSpec]=useState<Spec>({format:"SQUARE",title:"Evidence-led innovation",body:"Internal editable design for scientific review.",accent:"#124d83"});
 const [preview,setPreview]=useState<Preview|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [key,setKey]=useState("");
 const [expiry,setExpiry]=useState("");
 const parent=asset?.revisions.find(x=>x.version===asset.version);
 async function call(path:string,body?:unknown){
  const r=await fetch("/api/marketing/"+path,{method:body===undefined?"GET":"POST",credentials:"same-origin",cache:"no-store",
   ...(body===undefined?{}:{headers:{"content-type":"application/json"},body:JSON.stringify(body)})});
  const data=await r.json();if(!r.ok)throw Error(typeof data.message==="string"?data.message:"Design request denied");return data;
 }
 async function loadPreview(id:string){
  const v=await call("assets/revisions/"+encodeURIComponent(id)+"/layered-preview") as Preview;
  if(v.offlineOnly!==true||v.releaseAuthorized!==false||v.externalEffectsAuthorized!==false||
    !/^data:image\/svg\+xml;base64,[A-Za-z0-9+/]+=*$/.test(v.svgDataUrl)||v.revisionId!==id)
   throw Error("Unexpected layered preview provenance");
  setPreview(v);return v;
 }
 async function load(){
  const a=await call("assets/"+encodeURIComponent(assetId)) as Asset;
  if(a.id!==assetId||!Array.isArray(a.revisions))throw Error("Unexpected DAM scope");
  setAsset(a);setPreview(null);setKey("");setExpiry("");
  const current=a.revisions.find(x=>x.version===a.version);
  if(current?.layeredPreviewAvailable){const v=await loadPreview(current.id);setSpec(v.spec);}
 }
 async function run(task:()=>Promise<void>){
  setBusy(true);setError("");setNotice("");
  try{await task();}catch(e){setError(e instanceof Error?e.message:"Design request failed");}
  finally{setBusy(false);}
 }
 const edit=(patch:Partial<Spec>)=>{setSpec(s=>({...s,...patch}));setKey("");setExpiry("");};
 return <section aria-label="Persistent editable design source" style={{border:"1px solid #cbd5e1",borderRadius:8,padding:14,marginTop:16}}>
  <h4 style={{marginTop:0}}>Persistent editable design · new immutable revision</h4>
  <p style={{fontSize:12}}>Load an existing offline DAM asset. Save a new layered title/body/accent design as the next revision. The previous approval will no longer be current. The SVG is a deterministic new draft, not a reconstruction of the previous PNG; no release or rights inherit.</p>
  <label>Layered design asset ID<input style={field} value={assetId} disabled={!enabled||busy} onChange={e=>{setAssetId(e.target.value);setAsset(null);setPreview(null);setKey("");setExpiry("");}}/></label>
  <button type="button" style={button} disabled={!enabled||busy||!assetId} onClick={()=>void run(load)}>Load editable design asset</button>
  {asset&&<p>{asset.title} · current revision {asset.version}</p>}
  {asset&&parent&&(parent.offlinePreviewAvailable||parent.layeredPreviewAvailable)&&<>
   <label>Draft locale<select style={field} value={spec.locale??""} disabled={!enabled||busy} onChange={e=>{
    const locale=e.target.value as Locale|"";
    setSpec(s=>{const {locale:previous,...rest}=s;return locale?{...rest,locale}:rest;});setKey("");setExpiry("");
   }}><option value="">Unspecified · original layout</option>{locales.map(locale=><option key={locale}>{locale}</option>)}</select></label>
   <p style={{fontSize:12}}>Provide the translated text yourself. The selected locale controls draft text direction; translation accuracy and typography require independent review.</p>
   <label>Layered design headline<input style={field} value={spec.title} lang={spec.locale} dir={spec.locale?.startsWith("ar-")?"rtl":"ltr"} maxLength={90} onChange={e=>edit({title:e.target.value})} disabled={!enabled||busy}/></label>
   <label>Layered body copy<textarea style={field} value={spec.body} lang={spec.locale} dir={spec.locale?.startsWith("ar-")?"rtl":"ltr"} maxLength={400} onChange={e=>edit({body:e.target.value})} disabled={!enabled||busy}/></label>
   <label>Layered accent<input style={field} value={spec.accent} maxLength={7} onChange={e=>edit({accent:e.target.value})} disabled={!enabled||busy}/></label>
   <label>Layered canvas<select style={field} value={spec.format} onChange={e=>edit({format:e.target.value as Spec["format"]})} disabled={!enabled||busy}>
    <option value="SQUARE">Square</option><option value="PORTRAIT">Portrait</option>
   </select></label>
   <button type="button" style={{...button,marginTop:8}} disabled={!enabled||busy||!spec.title.trim()||!spec.body.trim()} onClick={()=>void run(async()=>{
    const k=key||crypto.randomUUID(),end=expiry||new Date(Date.now()+60*86400000).toISOString();
    if(!key)setKey(k);if(!expiry)setExpiry(end);
    const r=await call("assets/"+encodeURIComponent(asset.id)+"/offline-layered-revisions",{parentRevisionId:parent.id,
     expectedVersion:asset.version,requestKey:k,spec,rightsExpiresAt:end});
    if(r.releaseAuthorized!==false||r.approvalInherited!==false)throw Error("Unexpected release assertion");
    onSaved(asset.id);await load();setNotice("Saved immutable editable design revision "+r.version);
   })}>Save layered design as new unapproved version</button>
  </>}
  {preview&&<div style={{marginTop:10,fontSize:12}}>
   <img src={preview.svgDataUrl} alt="Stored deterministic editable design preview; unapproved" style={{maxWidth:"100%",width:300,border:"1px solid #cbd5e1"}}/>
   <p>Version {preview.version} · parent {preview.parentRevisionId} · locale {preview.spec.locale??"unspecified"} · source {preview.sourceDigest}</p>
   <button type="button" style={button} disabled={busy||!preview.current} onClick={()=>void run(async()=>{
    const fresh=await loadPreview(preview.revisionId);
    if(!fresh.current||fresh.renditionDigest!==preview.renditionDigest)throw Error("Design changed; refresh before export");
    const anchor=document.createElement("a");anchor.href=fresh.svgDataUrl;anchor.download="medsol-layered-unapproved-"+fresh.revisionId+".svg";
    document.body.appendChild(anchor);anchor.click();anchor.remove();
   })}>Download stored editable SVG</button>
  </div>}
  {notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error}</p>}
 </section>;
}
