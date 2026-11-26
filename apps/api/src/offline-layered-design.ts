import {createHash} from 'node:crypto';
const hash=(value:string)=>'sha256:'+createHash('sha256').update(value,'utf8').digest('hex');
const xml=(s:string)=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&apos;");
function text(value:unknown,max:number){
 if(typeof value!=='string'||!value.trim()||Array.from(value).length>max||
 /[\u0000-\u001f\u007f-\u009f\ud800-\udfff]/u.test(value))
  throw Error('Bounded plain design text required');
 return value.trim();
}
export const OFFLINE_DESIGN_LOCALES=['en-EG','en-GB','en-US','ar-EG','ar-SA','ar-AE','fr-FR','fr-MA'] as const;
export type OfflineDesignLocale=typeof OFFLINE_DESIGN_LOCALES[number];
export type OfflineLayeredSpec={format:'SQUARE'|'PORTRAIT';title:string;body:string;accent:string;locale?:OfflineDesignLocale};
export function normalizeOfflineLayeredSpec(raw:unknown):OfflineLayeredSpec{
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>!['format','title','body','accent','locale'].includes(k)))
  throw Error('Only structured offline design fields allowed');
 const r=raw as Record<string,unknown>;
 if(r.format!=='SQUARE'&&r.format!=='PORTRAIT')throw Error('Supported square or portrait layout required');
 if(typeof r.accent!=='string'||!/^#[0-9a-fA-F]{6}$/.test(r.accent))throw Error('Six-digit accent color required');
 const spec:OfflineLayeredSpec={format:r.format,title:text(r.title,90),body:text(r.body,400),accent:r.accent.toLowerCase()};
 // Unspecified locale is the original v1 rendering contract: preserve all
 // existing source and rendition digests exactly on rehydration.
 if(r.locale!==undefined){
  if(typeof r.locale!=='string'||!OFFLINE_DESIGN_LOCALES.includes(r.locale as OfflineDesignLocale))
   throw Error('Supported explicit draft locale required');
  if(/[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(spec.title+spec.body))
   throw Error('Explicit bidirectional override controls are not allowed in localized drafts');
  spec.locale=r.locale as OfflineDesignLocale;
 }
 return spec;
}
function wrap(value:string,width:number):string[]{
 const chars=Array.from(value),lines:string[]=[];
 while(chars.length){
  let end=Math.min(width,chars.length);
  if(chars.length>width){const cut=chars.slice(0,width).lastIndexOf(' ');if(cut>width/2)end=cut;}
  const line=chars.splice(0,end).join('').trim();if(line)lines.push(line);
  while(chars[0]===' ')chars.shift();
 }
 return lines;
}
/** Pure deterministic renderer. No arbitrary SVG/HTML, fonts, image URLs,
 * network, scripts, CSS or remote asset references are accepted. */
export function renderOfflineLayeredSpec(raw:unknown){
 const spec=normalizeOfflineLayeredSpec(raw),height=spec.format==='PORTRAIT'?1350:1080;
 const titleLines=wrap(spec.title,23),bodyLines=wrap(spec.body,45);
 const rtl=spec.locale?.startsWith('ar-')===true;
 const direction=spec.locale?' direction="'+(rtl?'rtl':'ltr')+'" unicode-bidi="embed" text-anchor="start"':'';
 const x=rtl?'992':'88';
 const language=spec.locale?' xml:lang="'+spec.locale+'"':'';
 const title=titleLines.map((line,i)=>'<text x="'+x+'" y="'+(220+i*70)+'"'+direction+'>'+xml(line)+'</text>').join('');
 const body=bodyLines.map((line,i)=>'<text x="'+x+'" y="'+(240+titleLines.length*70+ i*45)+'"'+direction+'>'+xml(line)+'</text>').join('');
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="'+height+'" viewBox="0 0 1080 '+height+'"'+language+'>'+ 
 '<g id="background"><rect width="1080" height="'+height+'" fill="#ffffff"/></g>'+
 '<g id="accent"><rect x="0" y="0" width="1080" height="36" fill="'+spec.accent+'"/><rect x="88" y="112" width="112" height="10" rx="5" fill="'+spec.accent+'"/></g>'+
 '<g id="headline" font-family="sans-serif" font-size="56" font-weight="700" fill="#142c47">'+title+'</g>'+
 '<g id="body-copy" font-family="sans-serif" font-size="30" fill="#334155">'+body+'</g>'+
 '<g id="draft-mark"><text x="88" y="'+(height-52)+'" font-family="sans-serif" font-size="19" fill="#64748b">Internal editable draft · not approved for release</text></g></svg>';
 // Avoid silent text loss: reject content that cannot fit the selected canvas.
 if(240+titleLines.length*70+(bodyLines.length-1)*45>height-115)
  throw Error('Design text does not fit selected canvas; use portrait or shorten the copy');
 return{spec,sourceDigest:hash(JSON.stringify(spec)),renditionDigest:hash(svg),svg};
}
