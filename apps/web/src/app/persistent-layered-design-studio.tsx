"use client";
import {useState} from "react";
import {formatTime,secondsToFrame,frameToSeconds} from "../lib/openmotion-time";
type Revision={id:string;version:number;offlinePreviewAvailable:boolean;layeredPreviewAvailable:boolean};
type Asset={id:string;title:string;version:number;brandId:string;revisions:Revision[]};
const locales=["en-EG","en-GB","en-US","ar-EG","ar-SA","ar-AE","fr-FR","fr-MA"] as const;
type Locale=typeof locales[number];
type Scene={title:string;body:string;seconds:number};
type Spec={format:"SQUARE"|"PORTRAIT";title:string;body:string;accent:string;locale?:Locale;motion?:{openingSeconds:number;scenes:Scene[]}};
type Quality={status:'POLICY_UNAVAILABLE'|'REVIEW_FINDINGS'|'NO_LITERAL_FINDINGS';policyScope:'TENANT_MASTER_ONLY';
 policyVersion:number|null;sourceDigest:string;renditionDigest:string;advisoryOnly:true;prohibitedPhraseMatches:number|null;missingDisclaimers:number|null;
 accentMatchesTenantPrimary:boolean|null;factualAccuracyVerified:false;accessibilityCertified:false;translationVerified:false;rightsVerified:false;releaseAuthorized:false;externalEffectsAuthorized:false};
type Preview={quality?:Quality;assetId:string;revisionId:string;version:number;current:boolean;parentRevisionId:string;spec:Spec;
 sourceDigest:string;renditionDigest:string;svgDataUrl:string;motionFrames?:{seconds:number;digest:string;svgDataUrl:string}[];motionDurationSeconds?:number;offlineOnly:true;releaseAuthorized:false;externalEffectsAuthorized:false};
const button={background:"#124d83",color:"#fff",padding:"9px 12px",border:0,borderRadius:7,cursor:"pointer"};
const field={display:"block",width:"100%",padding:8,border:"1px solid #cbd5e1",borderRadius:6,boxSizing:"border-box" as const};
export default function PersistentLayeredDesignStudio({enabled,onSaved}:{enabled:boolean;onSaved:(assetId:string)=>void}){
 const [assetId,setAssetId]=useState(""),[asset,setAsset]=useState<Asset|null>(null);
 const [spec,setSpec]=useState<Spec>({format:"SQUARE",title:"Evidence-led innovation",body:"Internal editable design for scientific review.",accent:"#124d83"});
 const [preview,setPreview]=useState<Preview|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [key,setKey]=useState("");
 const [expiry,setExpiry]=useState("");
 const [playMotion,setPlayMotion]=useState(false),[frameIndex,setFrameIndex]=useState(0);
 const parent=asset?.revisions.find(x=>x.version===asset.version);
 const previewFps=30;
 const selectedSceneStart=preview?.motionFrames?.slice(0,frameIndex).reduce((sum,f)=>sum+f.seconds,0)??0;
 const selectedStartFrame=secondsToFrame(selectedSceneStart,previewFps);
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
  const q=v.quality;
  if(q&&(q.sourceDigest!==v.sourceDigest||q.renditionDigest!==v.renditionDigest||q.policyScope!=='TENANT_MASTER_ONLY'||q.advisoryOnly!==true||
   q.factualAccuracyVerified!==false||q.accessibilityCertified!==false||q.translationVerified!==false||q.rightsVerified!==false||q.releaseAuthorized!==false||q.externalEffectsAuthorized!==false))
   throw Error('Unexpected draft quality scope or authority');
  if(v.motionFrames&&(!v.spec.motion||v.motionFrames.length!==v.spec.motion.scenes.length+1||v.motionFrames.some(f=>!/^data:image\/svg\+xml;base64,[A-Za-z0-9+/]+=*$/.test(f.svgDataUrl)||!/^sha256:[a-f0-9]{64}$/.test(f.digest)||!Number.isInteger(f.seconds)||f.seconds<2||f.seconds>8)))throw Error("Invalid motion frame manifest");
  setPreview(v);setPlayMotion(false);setFrameIndex(0);return v;
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
   <label><input type="checkbox" checked={!!spec.motion} disabled={!enabled||busy} onChange={e=>{if(e.target.checked)edit({motion:{openingSeconds:3,scenes:[{title:"Second scene",body:"Internal motion draft",seconds:3}]}});else {setSpec(s=>{const {motion,...rest}=s;return rest;});setKey("");setExpiry("");}}}/> Create timed motion storyboard</label>
   {spec.motion&&<div style={{border:"1px solid #cbd5e1",padding:10}}>
    <p>Opening uses the title and body above. 2–4 scenes, 2–8 seconds each, maximum 24 seconds; no audio or remote media.</p>
    <label>Opening seconds<input type="number" min={2} max={8} style={field} value={spec.motion.openingSeconds} disabled={busy} onChange={e=>edit({motion:{...spec.motion!,openingSeconds:Number(e.target.value)}})}/></label>
    {spec.motion.scenes.map((scene,i)=><fieldset key={i} style={{marginTop:8}}><legend>Scene {i+2}</legend>
     {(["title","body","seconds"] as const).map(k=><label key={k}>{k==="seconds"?"Seconds":k}<input type={k==="seconds"?"number":"text"} min={k==="seconds"?2:undefined} max={k==="seconds"?8:undefined} maxLength={k==="title"?90:k==="body"?180:undefined} style={field} value={scene[k]} disabled={busy} onChange={e=>edit({motion:{...spec.motion!,scenes:spec.motion!.scenes.map((s,j)=>j===i?{...s,[k]:k==="seconds"?Number(e.target.value):e.target.value}:s)}})}/></label>)}
     <button type="button" disabled={busy||spec.motion!.scenes.length<=1} onClick={()=>edit({motion:{...spec.motion!,scenes:spec.motion!.scenes.filter((_,j)=>j!==i)}})}>Remove scene</button>
    </fieldset>)}
    <button type="button" disabled={busy||spec.motion.scenes.length>=3} onClick={()=>edit({motion:{...spec.motion!,scenes:[...spec.motion!.scenes,{title:"Next scene",body:"Internal draft",seconds:3}]}})}>Add scene</button>
   </div>}
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
   <img src={preview.motionFrames&&!playMotion?(preview.motionFrames[frameIndex]?.svgDataUrl??preview.motionFrames[0]!.svgDataUrl):preview.svgDataUrl} alt="Stored deterministic editable design preview; unapproved" style={{maxWidth:"100%",width:300,border:"1px solid #cbd5e1"}}/>
   {preview.motionFrames&&<div><p>Motion draft · {preview.motionDurationSeconds} seconds · {preview.motionFrames.length} scenes</p>
    <p aria-label="Selected scene timecode">Scene starts at {formatTime(frameToSeconds(selectedStartFrame,previewFps))} · frame {selectedStartFrame} (30 FPS planning only)</p>
    <button type="button" onClick={()=>setPlayMotion(v=>!v)}>{playMotion?"Stop animation":"Play animated preview"}</button>{" "}
    <label>Inspect still scene<select value={frameIndex} onChange={e=>{setFrameIndex(Number(e.target.value));setPlayMotion(false);}}>{preview.motionFrames.map((f,i)=><option key={i} value={i}>Scene {i+1} · {f.seconds}s</option>)}</select></label>
    <p>Motion SVG export is a watermarked local draft. Any browser-encoded video would be a separate unverified output, not an approved DAM rendition.</p></div>}
   <p>Version {preview.version} · parent {preview.parentRevisionId} · locale {preview.spec.locale??"unspecified"} · source {preview.sourceDigest}</p>
   <aside aria-label="Stored draft content quality advisory" style={{padding:8,border:'1px solid #cbd5e1',marginBottom:8}}>
    <strong>Tenant-master content quality advisory · stored revision only</strong>
    {preview.quality&&preview.quality.status!=='POLICY_UNAVAILABLE'?<p>Policy v{preview.quality.policyVersion} · {preview.quality.status.replaceAll('_',' ')} · prohibited phrase matches: {preview.quality.prohibitedPhraseMatches} · missing disclaimer phrases: {preview.quality.missingDisclaimers} · tenant accent: {preview.quality.accentMatchesTenantPrimary?'matches':'differs'}</p>:<p>Approved tenant policy unavailable; no quality conclusion.</p>}
    <p>Literal checks only, not brand-specific, factual, translation, accessibility or rights validation. No release authority.</p>
   </aside>
   <button type="button" style={button} disabled={busy||!preview.current} onClick={()=>void run(async()=>{
    const fresh=await loadPreview(preview.revisionId);
    if(!fresh.current||fresh.renditionDigest!==preview.renditionDigest)throw Error("Design changed; refresh before export");
    const anchor=document.createElement("a");anchor.href=fresh.svgDataUrl;anchor.download="medsol-layered-unapproved-"+fresh.revisionId+".svg";
    document.body.appendChild(anchor);anchor.click();anchor.remove();
   })}>{preview.motionFrames?"Download stored animated SVG draft":"Download stored editable SVG"}</button>
   {preview.motionFrames&&<button type="button" style={{...button,marginLeft:8}} disabled={!enabled||busy||!preview.current} onClick={()=>void run(async()=>{
    const fresh=await loadPreview(preview.revisionId);if(!fresh.current||fresh.renditionDigest!==preview.renditionDigest||!fresh.motionFrames)throw Error("Motion revision changed");
    if(typeof MediaRecorder==="undefined"||!MediaRecorder.isTypeSupported("video/webm"))throw Error("This browser does not support local WebM encoding; use animated SVG instead.");
    const images=await Promise.all(fresh.motionFrames.map(async f=>{const image=new Image();await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(Error("Motion scene could not render"));image.src=f.svgDataUrl;});return image;}));
    const canvas=document.createElement("canvas");canvas.width=540;canvas.height=fresh.spec.format==="PORTRAIT"?675:540;
    const ctx=canvas.getContext("2d");if(!ctx||!canvas.captureStream)throw Error("Browser canvas capture unavailable");
    const stream=canvas.captureStream(15),chunks:Blob[]=[];let recorder:MediaRecorder|undefined;
    try{
     recorder=new MediaRecorder(stream,{mimeType:"video/webm",videoBitsPerSecond:600000});
     const done=new Promise<Blob>((resolve,reject)=>{recorder!.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder!.onstop=()=>resolve(new Blob(chunks,{type:"video/webm"}));recorder!.onerror=()=>reject(Error("Local video encoding failed"));});
     ctx.drawImage(images[0]!,0,0,canvas.width,canvas.height);recorder.start(250);
     for(let i=0;i<images.length;i++){
      const until=performance.now()+fresh.motionFrames[i]!.seconds*1000;
      while(performance.now()<until){ctx.drawImage(images[i]!,0,0,canvas.width,canvas.height);await new Promise<void>(r=>setTimeout(r,100));if(recorder.state!=="recording")throw Error("Local recorder stopped unexpectedly");}
     }
     recorder.stop();const blob=await done;if(!blob.size)throw Error("No video produced");
     const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="medsol-unverified-motion-"+fresh.revisionId+".webm";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
     setNotice("Local silent WebM draft exported; not stored, byte-verified, independently reviewed or approved for release.");
    }finally{if(recorder&&recorder.state!=="inactive")recorder.stop();stream.getTracks().forEach(t=>t.stop());}
   })}>Export local unverified silent WebM</button>}
   {!preview.motionFrames&&<button type="button" style={{...button,marginLeft:8}} disabled={!enabled||busy||!preview.current} onClick={()=>void run(async()=>{
    const fresh=await loadPreview(preview.revisionId);
    if(!fresh.current||fresh.sourceDigest!==preview.sourceDigest||fresh.renditionDigest!==preview.renditionDigest)throw Error("Stored design changed");
    const image=new Image();await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(Error("Cannot render stored SVG"));image.src=fresh.svgDataUrl;});
    const canvas=document.createElement("canvas");canvas.width=1080;canvas.height=fresh.spec.format==="PORTRAIT"?1350:1080;
    const context=canvas.getContext("2d");if(!context)throw Error("Canvas unavailable");context.drawImage(image,0,0,canvas.width,canvas.height);
    const pngBase64=canvas.toDataURL("image/png").split(",")[1];
    const r=await call("assets/"+encodeURIComponent(fresh.assetId)+"/offline-revisions",{expectedVersion:fresh.version,layeredParentRevisionId:fresh.revisionId,layeredSourceDigest:fresh.sourceDigest,editableCopy:fresh.spec.title+"\n"+fresh.spec.body,pngBase64,requestKey:crypto.randomUUID(),rightsExpiresAt:new Date(Date.now()+60*86400000).toISOString()});
    if(r.offlineOnly!==true||r.externalEffectsAuthorized!==false||r.visualFidelityVerified!==false)throw Error("Unexpected rendition authority");
    onSaved(fresh.assetId);await load();setNotice("Offline PNG candidate saved. Independent visual comparison, byte readback and exact approval remain required.");
   })}>Render offline PNG candidate</button>}
  </div>}
  {notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error}</p>}
 </section>;
}
