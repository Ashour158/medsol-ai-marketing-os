import {describe,it,expect} from 'vitest';
import {rehearseSyntheticCrmProtocol as rehearse,CRM_FIXTURE_SCENARIOS,parseCrmFixtureScenario} from './synthetic-crm-protocol.js';
const scope={organizationId:'org',brandId:'brand',campaignId:'campaign',formId:'form',contactId:'fixture-contact',
 consentEventId:'fixture-consent',payloadDigest:'sha256:'+'a'.repeat(64)};
describe('Anonymous CRM protocol',()=>{
 it('reconciles exact mock receipt and deduplicates callbacks without real requests',()=>{
  const r=rehearse({...scope,scenario:'DUPLICATE_CALLBACK'});
  expect(r).toMatchObject({outcome:'MOCK_ACCEPTED',fixtureReadback:'MATCH',mockAcknowledgementStatus:201,
   mockCallbacks:2,uniqueMockCallbacks:1,actualCrmRequests:0,actualLeadsCreated:0,verifiedRemoteReceipts:0,automaticRetryAuthorized:false});
  expect(r).toEqual(rehearse({...scope,scenario:'DUPLICATE_CALLBACK'}));
  expect(r.requestDigest).not.toBe(rehearse({...scope,organizationId:'other',scenario:'DUPLICATE_CALLBACK'}).requestDigest);
  expect(r.requestDigest).not.toBe(rehearse({...scope,consentEventId:'other-consent',scenario:'DUPLICATE_CALLBACK'}).requestDigest);
  expect(JSON.stringify(r)).not.toContain('fixture-contact');
 });
 it('does not trust acceptance without matching readback or allow blind retries',()=>{
  for(const scenario of CRM_FIXTURE_SCENARIOS){
   const r=rehearse({...scope,scenario});
   expect(r.actualCrmRequests).toBe(0);expect(r.automaticRetryAuthorized).toBe(false);expect(r.externalEffectsAuthorized).toBe(false);
   expect(r.outcome).toBe(['ACCEPTED','DUPLICATE_CALLBACK'].includes(scenario)?'MOCK_ACCEPTED':
    ['REJECTED','RATE_LIMITED','CONTACT_SCOPE_MISMATCH'].includes(scenario)?'MOCK_REJECTED':'OUTCOME_UNKNOWN');
   if(r.outcome!=='MOCK_ACCEPTED')expect(r.mockRecordRef).toBeNull();
  }
  expect(()=>parseCrmFixtureScenario('LIVE_SEND')).toThrow();expect(()=>rehearse({...scope,payloadDigest:'bad',scenario:'ACCEPTED'})).toThrow();
 });
});
