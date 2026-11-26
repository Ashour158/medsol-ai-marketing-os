import {parseRules} from './brand-master.service.js';
import type {OfflineLayeredSpec} from './offline-layered-design.js';

type Policy = {id:string;version:number;rules:unknown;proposedBy:string;approvedBy:string|null;approvedAt:Date|null};
const normalized=(s:string)=>s.normalize('NFKC').toLowerCase().replace(/\s+/gu,' ').trim();
const luminance=(hex:string)=>{
 const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4);
 return .2126*rgb[0]!+.7152*rgb[1]!+.0722*rgb[2]!;
};
/** Exact immutable draft inspection, not an approval, claim verification or accessibility certification.
 * The existing approved tenant master is not a per-brand authority. */
export function inspectLayeredDraftQuality(spec:OfflineLayeredSpec,sourceDigest:string,renditionDigest:string,policy:Policy|null){
 const base={sourceDigest,renditionDigest,policyScope:'TENANT_MASTER_ONLY' as const,advisoryOnly:true as const,
  factualAccuracyVerified:false as const,accessibilityCertified:false as const,translationVerified:false as const,
  rightsVerified:false as const,releaseAuthorized:false as const,externalEffectsAuthorized:false as const,
  fixedTextContrast:{headlineOnWhite:Math.floor(100*1.05/(luminance('#142c47')+.05))/100,
   bodyOnWhite:Math.floor(100*1.05/(luminance('#334155')+.05))/100}};
 if(!policy||!policy.approvedAt||!policy.approvedBy||policy.proposedBy===policy.approvedBy)
  return {...base,status:'POLICY_UNAVAILABLE' as const,policyRevisionId:null,policyVersion:null,
   prohibitedPhraseMatches:null,missingDisclaimers:null,accentMatchesTenantPrimary:null};
 let rules:ReturnType<typeof parseRules>;
 try{rules=parseRules(policy.rules);}catch{
  return {...base,status:'POLICY_UNAVAILABLE' as const,policyRevisionId:null,policyVersion:null,
   prohibitedPhraseMatches:null,missingDisclaimers:null,accentMatchesTenantPrimary:null};
 }
 const copies=[spec,...(spec.motion?.scenes??[])].map(s=>[normalized(s.title),normalized(s.body)]);
 const contains=(copy:string[],phrase:string)=>copy.some(c=>c.includes(normalized(phrase)));
 const prohibitedPhraseMatches=rules.prohibitedClaims.filter(p=>copies.some(c=>contains(c,p))).length;
 // A required disclaimer must appear on every visible scene.
 const missingDisclaimers=rules.requiredDisclaimers.filter(p=>copies.some(c=>!contains(c,p))).length;
 const accentMatchesTenantPrimary=spec.accent.toLowerCase()===rules.primaryColor.toLowerCase();
 return {...base,status:prohibitedPhraseMatches||missingDisclaimers||!accentMatchesTenantPrimary?'REVIEW_FINDINGS' as const:'NO_LITERAL_FINDINGS' as const,
  policyRevisionId:policy.id,policyVersion:policy.version,prohibitedPhraseMatches,missingDisclaimers,accentMatchesTenantPrimary};
}
