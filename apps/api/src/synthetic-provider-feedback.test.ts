import {describe,it,expect} from 'vitest';
import {normalizeSyntheticProviderFeedback as normalize} from './synthetic-provider-feedback.js';
const base={provider:'SENDGRID',fixtureEventId:'fixture-email-test-001',event:'bounce',bounceType:'HARD'};
describe('MIT Dittofeed event mapping, offline only',()=>{
 it('maps explicitly hard bounce and complaint to the canonical suppression actions',()=>{
  expect(normalize(base)).toMatchObject({action:'SIMULATED_HARD_BOUNCE'});
  expect(normalize({provider:'SENDGRID',fixtureEventId:base.fixtureEventId,event:'spamreport'}).action)
   .toBe('SIMULATED_COMPLAINT');
  expect(normalize({provider:'SENDGRID',fixtureEventId:base.fixtureEventId,event:'unsubscribe'}).action)
   .toBe('SIMULATED_WITHDRAWAL');
  expect(normalize({provider:'MAILCHIMP_TRANSACTIONAL',fixtureEventId:base.fixtureEventId,event:'hard_bounce'}).action)
   .toBe('SIMULATED_HARD_BOUNCE');
  expect(normalize({provider:'MAILCHIMP_TRANSACTIONAL',fixtureEventId:base.fixtureEventId,event:'spam'}).action)
   .toBe('SIMULATED_COMPLAINT');
 });
 it('never infers permanent bounce or accepts live provider payloads or engagement as consent',()=>{
  for(const variant of [
   {...base,bounceType:'SOFT'},{...base,bounceType:undefined},
   {...base,event:'open'},{...base,event:'delivered'},{...base,event:'opt_in'},
   {...base,provider:'UNKNOWN'},{...base,fixtureEventId:'real-provider-id'},
   {...base,email:'person@example.invalid'},{...base,workspaceId:'foreign-tenant'},
   {...base,verifiedProviderReceipt:true},{...base,event:'spamreport'}
  ])expect(()=>normalize(variant)).toThrow();
 });
});
