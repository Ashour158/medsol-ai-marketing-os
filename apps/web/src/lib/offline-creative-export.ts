/** Browser-only export of a previously verified, CURRENT DAM revision.
 * The DAM and exact creative approval remain the only source authorities.
 * A flattened PNG is never called an editable layered design.
 */
export type OfflineCreativeRecord={
 assetId:string;revisionId:string;version:number;brandId:string;
 renditionDigest:string;offlineOnly:true;sourceKind:'FLATTENED_EXPORT';
};
export type OfflineCreativePreview={
 assetId:string;revisionId:string;version:number;current:boolean;
 editableCopy:string;imageDataUrl:string;renditionDigest:string;
 offlineOnly:true;
};
export function validateOfflineCreativeDownload(
 creative:OfflineCreativeRecord,preview:OfflineCreativePreview){
 if(!creative||!preview||creative.offlineOnly!==true||
  preview.offlineOnly!==true||creative.sourceKind!=='FLATTENED_EXPORT'||
  creative.assetId!==preview.assetId||creative.revisionId!==preview.revisionId||
  creative.version!==preview.version||preview.current!==true||
  !/^[A-Za-z0-9_-]{8,128}$/.test(creative.revisionId)||
  !Number.isSafeInteger(creative.version)||creative.version<1||
  !/^sha256:[a-f0-9]{64}$/.test(creative.renditionDigest)||
  creative.renditionDigest!==preview.renditionDigest||
  typeof preview.editableCopy!=='string'||preview.editableCopy.length<12||
  preview.editableCopy.length>10000||
  typeof preview.imageDataUrl!=='string'||
  preview.imageDataUrl.length>12_000_000||
  !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(preview.imageDataUrl))
  throw Error('Creative export requires verified current offline raster and exact digest');
 return{pngFilename:'medsol-offline-creative-'+creative.revisionId+'.png',
  copyFilename:'medsol-offline-creative-'+creative.revisionId+'.txt',
  pngDataUrl:preview.imageDataUrl,
  editableCopy:preview.editableCopy,
  version:creative.version,
  layeredEditableDesign:false as const,externalEffectsAuthorized:false as const};
}


/** Create a NEW, editable native SVG design draft from a verified current copy.
 * This is deliberately not a reconstruction of the verified PNG, not a DAM
 * revision, and never inherits approval or rights. Only inert SVG shapes and
 * escaped text are emitted; no raw XML, links, images, scripts or CSS input.
 */
export function deriveOfflineEditableSvgDraft(
 creative:OfflineCreativeRecord,preview:OfflineCreativePreview&{title:string},
 accent:string){
 const verified=validateOfflineCreativeDownload(creative,preview);
 if(typeof preview.title!=='string'||!preview.title.trim()||preview.title.length>200||
  !/^#[0-9a-fA-F]{6}$/.test(accent))
  throw Error('Bounded title and six-digit accent color required');
 const clean=(s:string)=>s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g,' ');
 const xml=(s:string)=>clean(s).replaceAll('&','&amp;').replaceAll('<','&lt;')
  .replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
 // Wrap Unicode code points without discarding content. Each line stays
 // separately editable in SVG tools; page height expands rather than clipping.
 const wrap=(s:string,max:number)=>{
  const lines:string[]=[];
  for(const paragraph of clean(s).split(/\r?\n/)){
   let line='';
   for(const token of paragraph.split(/\s+/).filter(Boolean)){
    const chars=Array.from(token);
    if(chars.length>max){
     if(line){lines.push(line);line='';}
     for(let i=0;i<chars.length;i+=max)lines.push(chars.slice(i,i+max).join(''));
    }else if(Array.from(line+(line?' ':'')+token).length>max){
     lines.push(line);line=token;
    }else line+=(line?' ':'')+token;
   }
   if(line)lines.push(line);
   else if(!paragraph.trim())lines.push('');
  }
  return lines;
 };
 const headings=wrap(preview.title,34),body=wrap(verified.editableCopy,55);
 const bodyY=120+headings.length*52+38;
 const footerY=bodyY+body.length*34+32;
 const height=Math.max(506,footerY+70);
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="900" height="'+height+
  '" viewBox="0 0 900 '+height+'">'+
  '<title>Unapproved derived offline design</title>'+
  '<desc>New editable draft from current verified copy. Not the verified PNG. Independent review required.</desc>'+
  '<g id="background"><rect width="900" height="'+height+'" fill="#f8fafc"/></g>'+
  '<g id="accent"><rect width="20" height="'+height+'" fill="'+accent+
  '"/><rect x="55" y="70" width="78" height="6" fill="'+accent+'"/></g>'+
  '<g id="heading" font-family="Arial, sans-serif" font-size="38" font-weight="bold" fill="'+accent+'">'+
  headings.map((line,i)=>'<text x="55" y="'+(120+i*52)+'">'+xml(line)+'</text>').join('')+'</g>'+
  '<g id="body-copy" font-family="Arial, sans-serif" font-size="21" fill="#334155">'+
  body.map((line,i)=>'<text x="55" y="'+(bodyY+i*34)+'">'+xml(line)+'</text>').join('')+'</g>'+
  '<g id="review-notice" font-family="Arial, sans-serif" font-size="16" fill="#64748b">'+
  '<text x="55" y="'+footerY+'">UNAPPROVED DERIVED DRAFT · NO DELIVERY AUTHORITY</text></g></svg>';
 if(svg.length>120_000||height>100_000)throw Error('Editable draft exceeds safe export bounds');
 return{filename:'medsol-derived-unapproved-'+creative.revisionId+'.svg',svg,
  sourceRevisionId:creative.revisionId,sourceVersion:creative.version,
  derivedEditableDraft:true as const,verifiedRendition:false as const,
  inheritsApproval:false as const,rightsVerified:false as const,
  externalEffectsAuthorized:false as const};
}
