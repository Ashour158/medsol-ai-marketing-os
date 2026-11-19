import {createHash} from 'node:crypto';
import {PLATFORM_CATALOG} from './platform-integration-hub.service.js';

/**
 * Deterministic R2 provider SIMULATION. No provider SDK, HTTP, OAuth, token,
 * live account or external-effect capability. The Integration Hub owns the
 * canonical provider catalog. This produces only internal simulated claims.
 */
export const SOCIAL_PROVIDER_SIMULATION_SCENARIOS=[
 'SUCCESS','POLICY_REJECTED','RATE_LIMITED','TOKEN_EXPIRED',
 'ACCOUNT_REVOKED','MEDIA_REJECTED','PROVIDER_5XX',
 'TIMEOUT_BEFORE_ACK','TIMEOUT_AFTER_ACCEPT','WEBHOOK_BEFORE_READBACK',
 'DUPLICATE_CALLBACK','READBACK_MISMATCH'
] as const;
export type SocialSimulationScenario=typeof SOCIAL_PROVIDER_SIMULATION_SCENARIOS[number];
export type SocialSimulationOutcome='SIMULATED'|'BLOCKED'|'OUTCOME_UNKNOWN';
export type SocialSimulationReadback='SYNTHETIC_MATCH'|'SYNTHETIC_MISMATCH'|
 'SYNTHETIC_DELAYED'|'NOT_AVAILABLE';
export type SocialSimulationResult={
 scenario:SocialSimulationScenario;providerKey:string;catalogProvider:true;
 outcome:SocialSimulationOutcome;
 transport:'SYNTHETIC_ACCEPTED'|'SYNTHETIC_REJECTED'|
  'SYNTHETIC_RATE_LIMIT'|'SYNTHETIC_TIMEOUT'|'SYNTHETIC_SERVER_ERROR';
 readback:SocialSimulationReadback;
 providerRequestRef:string;simulatedRemotePostRef:string|null;
 virtualCallbackCount:number;deduplicatedVirtualCallbackCount:number;
 virtualReadbackMatchesApprovedScope:boolean;
 // Even a perfect local readback is not proof that a real platform received content.
 realProviderRequests:0;verifiedRemoteReceipts:0;externalEffectsAuthorized:false;
 automaticRetryAllowed:false;
};
export type SocialSimulationInput={
 organizationId:string;publicationId:string;integrationConnectionId:string;
 providerKey:string;scopeDigest:string;scenario:SocialSimulationScenario;
 requestKey:string;
};
export function assertSocialSimulationScenario(v:unknown):SocialSimulationScenario{
 if(typeof v!=='string'||!SOCIAL_PROVIDER_SIMULATION_SCENARIOS.some(s=>s===v))
  throw new Error('Unknown simulated provider scenario');
 return v as SocialSimulationScenario;
}
export function simulateProviderTransport(input:SocialSimulationInput):SocialSimulationResult{
 if(!PLATFORM_CATALOG.some(p=>p.key===input.providerKey&&p.category==='SOCIAL'))
  throw new Error('Social provider must belong to the existing Integration Hub catalog');
 for(const val of [
  input.organizationId,input.publicationId,input.integrationConnectionId,
  input.scopeDigest,input.requestKey
 ])if(!val||val.length>200)throw new Error('Invalid source-bound simulation identifier');
 if(!/^sha256:[a-f0-9]{64}$/.test(input.scopeDigest))
  throw new Error('Exact approved scope digest required');
 const scenario=assertSocialSimulationScenario(input.scenario);
 const digest=createHash('sha256').update(JSON.stringify([
  'medsol-internal-provider-simulation-v1',input.organizationId,
  input.integrationConnectionId,input.providerKey,input.publicationId,
  input.scopeDigest,scenario,input.requestKey
 ])).digest('hex');
 const providerRequestRef='internal:simulated-provider-request/'+digest;
 const syntheticPost='internal:simulated-provider-post/'+digest;
 const accepted=scenario==='SUCCESS'||scenario==='DUPLICATE_CALLBACK'||
  scenario==='WEBHOOK_BEFORE_READBACK'||scenario==='READBACK_MISMATCH'||
  scenario==='TIMEOUT_AFTER_ACCEPT';
 const explicitlyRejected=['POLICY_REJECTED','RATE_LIMITED','TOKEN_EXPIRED',
  'ACCOUNT_REVOKED','MEDIA_REJECTED'].includes(scenario);
 const outcome:SocialSimulationOutcome=explicitlyRejected?'BLOCKED':
  ['TIMEOUT_BEFORE_ACK','TIMEOUT_AFTER_ACCEPT','PROVIDER_5XX',
   'WEBHOOK_BEFORE_READBACK','READBACK_MISMATCH'].includes(scenario)?
    'OUTCOME_UNKNOWN':'SIMULATED';
 const transport:SocialSimulationResult['transport']=
  ['TIMEOUT_BEFORE_ACK','TIMEOUT_AFTER_ACCEPT'].includes(scenario)?
   'SYNTHETIC_TIMEOUT':
  scenario==='RATE_LIMITED'?'SYNTHETIC_RATE_LIMIT':
  scenario==='PROVIDER_5XX'?'SYNTHETIC_SERVER_ERROR':
  explicitlyRejected?'SYNTHETIC_REJECTED':'SYNTHETIC_ACCEPTED';
 const readback:SocialSimulationReadback=(
  scenario==='SUCCESS'||scenario==='DUPLICATE_CALLBACK')?'SYNTHETIC_MATCH':
  scenario==='READBACK_MISMATCH'?'SYNTHETIC_MISMATCH':
  scenario==='WEBHOOK_BEFORE_READBACK'||scenario==='TIMEOUT_AFTER_ACCEPT'?
    'SYNTHETIC_DELAYED':'NOT_AVAILABLE';
 const virtualCallbackCount=scenario==='DUPLICATE_CALLBACK'?2:
  scenario==='SUCCESS'||scenario==='WEBHOOK_BEFORE_READBACK'?1:0;
 return{
  scenario,providerKey:input.providerKey,catalogProvider:true,
  outcome,transport,readback,providerRequestRef,
  simulatedRemotePostRef:accepted?syntheticPost:null,
  virtualCallbackCount,deduplicatedVirtualCallbackCount:virtualCallbackCount>0?1:0,
  virtualReadbackMatchesApprovedScope:readback==='SYNTHETIC_MATCH',
  realProviderRequests:0,verifiedRemoteReceipts:0,
  externalEffectsAuthorized:false,automaticRetryAllowed:false
 };
}
