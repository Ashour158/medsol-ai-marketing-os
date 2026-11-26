import {createHash} from 'node:crypto';
/** Provider-neutral internal wire protocol rehearsal. No HTTP, provider SDK,
 * credentials, real lead data, platform entitlement or actual CRM requests. */
export const CRM_FIXTURE_SCENARIOS=['ACCEPTED','REJECTED','OUTCOME_UNKNOWN','RATE_LIMITED',
 'TIMEOUT_BEFORE_ACK','TIMEOUT_AFTER_ACCEPT','READBACK_MISMATCH','DUPLICATE_CALLBACK',
 'MALFORMED_RESPONSE','CONTACT_SCOPE_MISMATCH'] as const;
export type CrmFixtureScenario=typeof CRM_FIXTURE_SCENARIOS[number];
export function parseCrmFixtureScenario(raw:unknown):CrmFixtureScenario{
 if(typeof raw!=='string'||!CRM_FIXTURE_SCENARIOS.some(s=>s===raw))throw Error('Unknown mock CRM transport');
 return raw as CrmFixtureScenario;
}
const digest=(value:unknown)=>'sha256:'+createHash('sha256').update(JSON.stringify(value)).digest('hex');
type Input={organizationId:string;brandId:string;campaignId:string;formId:string;contactId:string;consentEventId:string;
 payloadDigest:string;scenario:CrmFixtureScenario};
/** Build exact scoped anonymous request; parse fixed in-process response and
 * reconcile exact readback. Any possible write with uncertain identity or
 * response remains unknown and cannot be automatically retried. */
export function rehearseSyntheticCrmProtocol(input:Input){
 for(const v of [input.organizationId,input.brandId,input.campaignId,input.formId,input.contactId,input.consentEventId]){
  if(typeof v!=='string'||!/^[A-Za-z0-9_-]{1,200}$/.test(v))throw Error('Invalid CRM fixture scope');
 }
 if(!/^sha256:[a-f0-9]{64}$/.test(input.payloadDigest))throw Error('Exact submission fingerprint required');
 const scenario=parseCrmFixtureScenario(input.scenario);
 const scope=digest(['medsol-crm-scope-v1',input.organizationId,input.brandId,input.campaignId,
  input.formId,input.contactId,input.consentEventId,input.payloadDigest]);
 const request={schema:'medsol.synthetic-crm.upsert.v1',scope,syntheticOnly:true,purpose:'MOCK_CRM_HANDOFF',externalEffectsAuthorized:false};
 const requestDigest=digest(request),expectedRef='internal:mock-crm/'+digest(['fixture-crm-record',scope]).slice(7);
 const ack=scenario==='RATE_LIMITED'?429:scenario==='REJECTED'?422:
  scenario==='CONTACT_SCOPE_MISMATCH'?403:scenario==='MALFORMED_RESPONSE'?200:
  ['OUTCOME_UNKNOWN','TIMEOUT_BEFORE_ACK','TIMEOUT_AFTER_ACCEPT'].includes(scenario)?null:201;
 let readback:'MATCH'|'MISMATCH'|'UNAVAILABLE'='UNAVAILABLE';
 let outcome:'MOCK_ACCEPTED'|'MOCK_REJECTED'|'OUTCOME_UNKNOWN'='OUTCOME_UNKNOWN';
 let callbacks=0,uniqueCallbacks=0;
 if(ack===429||ack===422||ack===403)outcome='MOCK_REJECTED';
 else if(ack===201){
  // Inject a mismatched receipt for the relevant scenario; compare identity,
  // request fingerprint and mock record reference rather than trusting 201.
  const response={schema:'medsol.synthetic-crm.receipt.v1',scope,requestDigest,ref:expectedRef};
  const record=scenario==='READBACK_MISMATCH'?{...response,scope:digest(['wrong-scope',scope])}:response;
  readback=record.scope===scope&&record.requestDigest===requestDigest&&record.ref===expectedRef?'MATCH':'MISMATCH';
  if(readback==='MATCH')outcome='MOCK_ACCEPTED';
  const fixtureCallback={eventId:digest(['mock-event',requestDigest]),scope,requestDigest};
  const events=scenario==='DUPLICATE_CALLBACK'?[fixtureCallback,fixtureCallback]:[fixtureCallback];
  callbacks=events.length;uniqueCallbacks=new Set(events.filter(e=>e.scope===scope&&e.requestDigest===requestDigest).map(e=>e.eventId)).size;
 }
 return{schema:'medsol.synthetic-crm.protocol.v1' as const,scenario,requestDigest,outcome,
  mockAcknowledgementStatus:ack,fixtureReadback:readback,mockCallbacks:callbacks,uniqueMockCallbacks:uniqueCallbacks,
  mockRecordRef:outcome==='MOCK_ACCEPTED'?expectedRef:null,fixtureOnly:true as const,
  actualCrmRequests:0 as const,actualLeadsCreated:0 as const,verifiedRemoteReceipts:0 as const,
  automaticRetryAuthorized:false as const,externalEffectsAuthorized:false as const};
}
