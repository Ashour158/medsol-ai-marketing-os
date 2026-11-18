import {createHash} from 'node:crypto';
export type ExactCreativeScope={
 assetId:string;revisionId:string;revisionVersion:number;brandId:string;
 renditionDigest:string;sourceRef:string;channel:'SOCIAL'|'EMAIL'|'WEB';
 destinationRef:string;audienceRef:string;policyVersion:string;
 scheduledAt:string;expiresAt:string;
};
export function exactCreativeScopeHash(scope:ExactCreativeScope):string{
 // Fixed field order, no optional or invisible business context, no LLM output.
 const canonical={
  assetId:scope.assetId,revisionId:scope.revisionId,revisionVersion:scope.revisionVersion,
  brandId:scope.brandId,renditionDigest:scope.renditionDigest,sourceRef:scope.sourceRef,
  channel:scope.channel,destinationRef:scope.destinationRef,audienceRef:scope.audienceRef,
  policyVersion:scope.policyVersion,scheduledAt:scope.scheduledAt,expiresAt:scope.expiresAt
 };
 return 'sha256:'+createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}
export function isExactCreativeScope(raw:unknown):raw is ExactCreativeScope{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return false;
 const x=raw as Record<string,unknown>;
 const fields=['assetId','revisionId','revisionVersion','brandId','renditionDigest','sourceRef',
  'channel','destinationRef','audienceRef','policyVersion','scheduledAt','expiresAt'];
 if(Object.keys(x).length!==fields.length||fields.some(f=>!(f in x)))return false;
 if(!fields.filter(f=>f!=='revisionVersion').every(f=>typeof x[f]==='string'&&
   (x[f] as string).length>0))return false;
 if(!Number.isSafeInteger(x.revisionVersion)||(x.revisionVersion as number)<1)return false;
 if(!['SOCIAL','EMAIL','WEB'].includes(x.channel as string))return false;
 if(!/^sha256:[a-f0-9]{64}$/.test(x.renditionDigest as string))return false;
 if(!String(x.sourceRef).startsWith('internal:creative-source/'))return false;
 if(!String(x.destinationRef).startsWith('internal:connected-destination/'))return false;
 if(!String(x.audienceRef).startsWith('internal:audience-snapshot/'))return false;
 if(!/^v[0-9]{1,9}$/.test(x.policyVersion as string))return false;
 for(const key of ['scheduledAt','expiresAt']){
  if(!Number.isFinite(Date.parse(x[key] as string))||
    new Date(x[key] as string).toISOString()!==x[key])return false;
 }
 return true;
}
