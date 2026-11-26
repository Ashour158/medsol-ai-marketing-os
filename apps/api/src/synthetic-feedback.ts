import {reviewVoiceOfCustomer} from '@medsol/agent-runtime';
import {createHash} from 'node:crypto';
export const FEEDBACK_PREFIX='synthetic-feedback-';
export const FEEDBACK_THEMES=['PRODUCT_QUALITY','ONBOARDING','PRICE_VALUE','SUPPORT','USABILITY','TRUST','FEATURE_REQUEST','DELIVERY','OTHER'] as const;
type Theme=typeof FEEDBACK_THEMES[number];
const fixtureBrand=(x:unknown):x is string=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x);
const exact=(x:unknown,keys:readonly string[]):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.prototype.hasOwnProperty.call(x,k));
export function buildSyntheticFeedback(org:string,raw:unknown,now=new Date()){
 if(!exact(raw,['brandId','fixtureOnly','counts'])||raw.fixtureOnly!==true||!fixtureBrand(raw.brandId)||!exact(raw.counts,FEEDBACK_THEMES))
  throw Error('Exact synthetic-only feedback cohort required');
 const brandId=raw.brandId,counts=raw.counts;
 let total=0;
 for(const theme of FEEDBACK_THEMES){
  const n=counts[theme];
  if(typeof n!=='number'||!Number.isSafeInteger(n)||n<0||n>100)throw Error('Invalid synthetic feedback count');
  total+=n;
 }
 if(total<1||total>100)throw Error('Synthetic feedback cohort must contain 1–100 fixtures');
 const signals=FEEDBACK_THEMES.flatMap(theme=>Array.from({length:counts[theme] as number},(_,i)=>({
  organizationId:org,sourceId:theme+'-'+i,sourceReference:'internal:synthetic-feedback-fixture',observedAt:now.toISOString(),
  sourceType:'FIRST_PARTY_SURVEY',theme,purposeAllowed:true,sourceReviewed:true
 })));
 const review=reviewVoiceOfCustomer(org,{organizationId:org,brandId,signals},now);
 // Only the suppressed output and an immutable fixture fingerprint survive.
 // No person, raw record, real rights assertion or external evidence is stored.
 return{schema:'medsol.synthetic-feedback.v1' as const,brandId,fixtureOnly:true as const,
  inputDigest:'sha256:'+createHash('sha256').update(JSON.stringify([org,brandId,FEEDBACK_THEMES.map(t=>counts[t])])).digest('hex'),
  cohortSize:review.eligibleCount,publishableCohort:review.publishableCohort,themeCounts:review.themeCounts,
  externalEffectsAuthorized:false as const,realCustomerData:false as const};
}
export type SyntheticFeedback=ReturnType<typeof buildSyntheticFeedback>;
export function encodeSyntheticFeedback(value:SyntheticFeedback){return JSON.stringify(value);}
export function decodeSyntheticFeedback(text:string):SyntheticFeedback|null{
 try{
  const x=JSON.parse(text);
  if(!exact(x,['schema','brandId','fixtureOnly','inputDigest','cohortSize','publishableCohort','themeCounts','externalEffectsAuthorized','realCustomerData'])||
   x.schema!=='medsol.synthetic-feedback.v1'||!fixtureBrand(x.brandId)||x.fixtureOnly!==true||
   typeof x.inputDigest!=='string'||!/^sha256:[a-f0-9]{64}$/.test(x.inputDigest)||
   typeof x.cohortSize!=='number'||!Number.isSafeInteger(x.cohortSize)||x.cohortSize<1||x.cohortSize>100||
   x.publishableCohort!==(x.cohortSize>=5)||x.externalEffectsAuthorized!==false||x.realCustomerData!==false||
   !x.themeCounts||typeof x.themeCounts!=='object'||Array.isArray(x.themeCounts))return null;
  const themes=Object.entries(x.themeCounts);let included=0;
  for(const [theme,n] of themes){
   if(!FEEDBACK_THEMES.includes(theme as Theme)||typeof n!=='number'||!Number.isSafeInteger(n)||n<5||n>100)return null;
   included+=n;
  }
  if(included>x.cohortSize||(!x.publishableCohort&&included>0))return null;
  return x as SyntheticFeedback;
 }catch{return null;}
}
