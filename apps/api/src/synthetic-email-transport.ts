import {createHash} from 'node:crypto';

/**
 * R2-I: pure, NO-NETWORK transport contract rehearsal for the existing R2H
 * SyntheticAudienceEmailService. No ESP SDK, addresses, real contact, tokens,
 * provider receipt or external delivery authority. Never an email sender.
 */
export const SYNTHETIC_EMAIL_SCENARIOS=[
 'ACCEPTED','BOUNCED','COMPLAINT','RATE_LIMITED','ESP_5XX',
 'TIMEOUT_AFTER_ACCEPT','DUPLICATE_CALLBACK','UNSUBSCRIBE_BEFORE_SEND',
 'DELAYED_WEBHOOK','TEMPLATE_REJECTED','TOKEN_EXPIRED','READBACK_MISMATCH'
] as const;
export type SyntheticEmailScenario=typeof SYNTHETIC_EMAIL_SCENARIOS[number];
export type SyntheticEmailTransport={
 scenario:SyntheticEmailScenario;simulatedEligible:number;
 virtualAccepted:number;virtualBounced:number;virtualComplaints:number;
 virtualSuppressed:number;virtualRejected:number;virtualOutcomeUnknown:number;
 virtualCallbackCount:number;virtualDeduplicatedCallbacks:number;
 syntheticReadback:'MATCH'|'MISMATCH'|'DELAYED'|'UNAVAILABLE';
 virtualRequestRef:string;
 realProviderRequests:0;actualMessagesSent:0;verifiedProviderReceipts:0;
 externalEffectsAuthorized:false;automaticRetryAllowed:false;
};
export function assertSyntheticEmailScenario(raw:unknown):SyntheticEmailScenario{
 if(typeof raw!=='string'||!SYNTHETIC_EMAIL_SCENARIOS.some(s=>s===raw))
  throw new Error('Unknown synthetic email provider scenario');
 return raw as SyntheticEmailScenario;
}
export function simulateSyntheticEmailTransport(input:{
 organizationId:string;campaignId:string;brandId:string;
 contentDigest:string;audienceDigest:string;eligibleCount:number;
 scenario:SyntheticEmailScenario
}):SyntheticEmailTransport{
 for(const field of [input.organizationId,input.campaignId,input.brandId]){
  if(!field||field.length>200)throw new Error('Invalid synthetic transport identity');
 }
 for(const digest of [input.contentDigest,input.audienceDigest]){
  if(!/^sha256:[a-f0-9]{64}$/.test(digest))
   throw new Error('Synthetic transport requires immutable audience and creative');
 }
 if(!Number.isSafeInteger(input.eligibleCount)||input.eligibleCount<0||
    input.eligibleCount>100)
  throw new Error('Synthetic recipient count out of bounds');
 const scenario=assertSyntheticEmailScenario(input.scenario);
 const n=input.eligibleCount;
 const accepted=['ACCEPTED','DUPLICATE_CALLBACK','DELAYED_WEBHOOK',
  'READBACK_MISMATCH','TIMEOUT_AFTER_ACCEPT'].includes(scenario);
 const virtualAccepted=accepted?n:0;
 const virtualBounced=scenario==='BOUNCED'?n:0;
 const virtualComplaints=scenario==='COMPLAINT'?n:0;
 const virtualSuppressed=scenario==='UNSUBSCRIBE_BEFORE_SEND'?n:0;
 const virtualRejected=['RATE_LIMITED','ESP_5XX','TEMPLATE_REJECTED',
  'TOKEN_EXPIRED'].includes(scenario)?n:0;
 const virtualOutcomeUnknown=['TIMEOUT_AFTER_ACCEPT','DELAYED_WEBHOOK',
  'READBACK_MISMATCH'].includes(scenario)?n:0;
 const virtualCallbackCount=n===0?0:scenario==='DUPLICATE_CALLBACK'?2:
  ['ACCEPTED','BOUNCED','COMPLAINT','READBACK_MISMATCH'].includes(scenario)?1:0;
 const syntheticReadback:SyntheticEmailTransport['syntheticReadback']=
  ['ACCEPTED','DUPLICATE_CALLBACK'].includes(scenario)?'MATCH':
  scenario==='READBACK_MISMATCH'?'MISMATCH':
  ['DELAYED_WEBHOOK','TIMEOUT_AFTER_ACCEPT'].includes(scenario)?'DELAYED':
  'UNAVAILABLE';
 const fingerprint=createHash('sha256').update(JSON.stringify([
  'medsol-r2-i-synthetic-esp-v1',input.organizationId,input.brandId,
  input.campaignId,input.contentDigest,input.audienceDigest,scenario
 ])).digest('hex');
 return{scenario,simulatedEligible:n,virtualAccepted,virtualBounced,
  virtualComplaints,virtualSuppressed,virtualRejected,virtualOutcomeUnknown,
  virtualCallbackCount,
  virtualDeduplicatedCallbacks:virtualCallbackCount>0?1:0,
  syntheticReadback,
  virtualRequestRef:'internal:synthetic-esp/'+fingerprint,
  realProviderRequests:0,actualMessagesSent:0,verifiedProviderReceipts:0,
  externalEffectsAuthorized:false,automaticRetryAllowed:false};
}
