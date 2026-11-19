import {describe,it,expect} from 'vitest';
import {assertSyntheticEmailScenario,simulateSyntheticEmailTransport,
 SYNTHETIC_EMAIL_SCENARIOS} from './synthetic-email-transport.js';

const input={organizationId:'tenant-a',brandId:'brand-a',campaignId:'campaign-a',
 contentDigest:'sha256:'+'a'.repeat(64),audienceDigest:'sha256:'+'b'.repeat(64),
 eligibleCount:3,scenario:'ACCEPTED' as const};
describe('R2-I synthetic-only email transport and receipt contracts',()=>{
 it('runs every scenario with zero real provider calls, receipts, retries or sends',()=>{
  expect(SYNTHETIC_EMAIL_SCENARIOS).toHaveLength(12);
  for(const scenario of SYNTHETIC_EMAIL_SCENARIOS){
   const result=simulateSyntheticEmailTransport({...input,scenario});
   expect(result).toMatchObject({scenario,realProviderRequests:0,
    actualMessagesSent:0,verifiedProviderReceipts:0,
    externalEffectsAuthorized:false,automaticRetryAllowed:false});
   expect(result.virtualRequestRef).toMatch(/^internal:synthetic-esp\/[a-f0-9]{64}$/);
   expect(simulateSyntheticEmailTransport({...input,scenario})).toEqual(result);
   expect(result.virtualDeduplicatedCallbacks).toBeLessThanOrEqual(1);
  }
 });
 it('preserves uncertainty after simulated ambiguous send and mismatched readback',()=>{
  for(const scenario of ['TIMEOUT_AFTER_ACCEPT','READBACK_MISMATCH',
   'DELAYED_WEBHOOK'] as const){
   const result=simulateSyntheticEmailTransport({...input,scenario});
   expect(result.virtualOutcomeUnknown).toBe(3);
   expect(result.automaticRetryAllowed).toBe(false);
   expect(result.verifiedProviderReceipts).toBe(0);
  }
 });
 it('does not confuse virtual complaint, unsubscribe or bounce with consent evidence',()=>{
  const c=simulateSyntheticEmailTransport({...input,scenario:'COMPLAINT'});
  const u=simulateSyntheticEmailTransport({...input,scenario:'UNSUBSCRIBE_BEFORE_SEND'});
  const b=simulateSyntheticEmailTransport({...input,scenario:'BOUNCED'});
  expect(c.virtualComplaints).toBe(3);
  expect(u.virtualSuppressed).toBe(3);
  expect(b.virtualBounced).toBe(3);
  for(const result of [c,u,b])expect(result.actualMessagesSent).toBe(0);
 });
 it('rejects unknown scenarios, non-hashed source and out-of-bounds audience',()=>{
  expect(()=>assertSyntheticEmailScenario('LIVE_SEND')).toThrow();
  expect(()=>simulateSyntheticEmailTransport({...input,contentDigest:'raw'})).toThrow();
  expect(()=>simulateSyntheticEmailTransport({...input,eligibleCount:101})).toThrow();
  expect(()=>simulateSyntheticEmailTransport({...input,organizationId:''})).toThrow();
 });
 it('does not invent delivery when all recipients are suppressed',()=>{
  const result=simulateSyntheticEmailTransport({...input,eligibleCount:0});
  expect(result.virtualAccepted).toBe(0);
  expect(result.virtualCallbackCount).toBe(0);
  expect(result.realProviderRequests).toBe(0);
 });
});
