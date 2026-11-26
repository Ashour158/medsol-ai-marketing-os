import {isIP} from 'node:net';
/** Governance for operator-supplied source metadata/excerpts. This validates
 * explicit declarations, never establishes rights or contacts a URL. */
export function governedSourceImport(raw:unknown,sourceUrl:string|null,expiresAt:Date|null,text:unknown,now=new Date()){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).sort().join(',')!==
  'collectionPermitted,noPersonalData,permissionReference,rightsBasis,scope')
  throw Error('Explicit bounded source rights declaration required');
 const r=raw as Record<string,unknown>;
 if(r.collectionPermitted!==true||r.noPersonalData!==true||
  !['PUBLIC_DOMAIN','LICENSED_CONTENT','OWNER_PERMISSION'].includes(String(r.rightsBasis))||
  !['METADATA_ONLY','TEXT_EXCERPT'].includes(String(r.scope))||
  typeof r.permissionReference!=='string'||!/^internal:source-rights\/[A-Za-z0-9_/-]{8,180}$/.test(r.permissionReference))
  throw Error('Explicit permitted collection, no personal data and internal source-rights reference required');
 if(!sourceUrl||!expiresAt||expiresAt<=now||expiresAt.getTime()>now.getTime()+366*86400000)
  throw Error('Public source reference and bounded permission expiry required');
 let url:URL;try{url=new URL(sourceUrl);}catch{throw Error('Invalid source reference');}
 const host=url.hostname.toLowerCase().replace(/\.$/,'');
 if(url.protocol!=='https:'||url.username||url.password||url.port||url.search||url.hash||
  isIP(host.replace(/^\[|\]$/g,''))!==0||!host.includes('.')||
  ['.localhost','.local','.internal','.invalid','.test','.onion'].some(s=>host.endsWith(s)))
  throw Error('Plain public HTTPS provenance URL required; no credentials or private host references');
 const max=r.scope==='METADATA_ONLY'?1000:3000;
 if(typeof text!=='string'||!text.trim()||text.length>max)throw Error('Source exceeds declared collection scope');
 return{rightsBasis:r.rightsBasis as string,scope:r.scope as string,permissionReference:r.permissionReference,
  collectionPermitted:true as const,noPersonalData:true as const,permissionExpiresAt:expiresAt.toISOString(),
  sourceHost:host,operatorSupplied:true as const,actualNetworkRequests:0 as const,legalRightsVerified:false as const,
  independentlyVerified:false as const,externalEffectsAuthorized:false as const};
}
