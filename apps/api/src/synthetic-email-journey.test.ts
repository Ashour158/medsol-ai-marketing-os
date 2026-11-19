import {describe,expect,it} from 'vitest';
import {parseSyntheticJourney,syntheticJourneyDigest,
 simulateSyntheticJourney} from './synthetic-email-journey.js';
const definition=()=>({timeZone:'Europe/Berlin',
 startAt:'2026-11-19T22:30:00Z',
 quietHours:{start:'21:00',end:'08:00'},
 dailyCap:1,rolling7DayCap:3,
 steps:[
  {key:'welcome',delayMinutes:0,scenario:'ACCEPTED'},
  {key:'follow_up',delayMinutes:0,scenario:'TIMEOUT_AFTER_ACCEPT'},
  {key:'check_in',delayMinutes:0,scenario:'COMPLAINT'}
 ]});
const input=()=>({organizationId:'tenant-a',brandId:'brand-a',
 campaignId:'campaign-a',contentDigest:'sha256:'+'a'.repeat(64),
 audienceDigest:'sha256:'+'b'.repeat(64),eligibleAtSnapshot:3,
 definition:parseSyntheticJourney(definition())});
describe('R2-J deterministic consent-aware virtual email journey',()=>{
 it('honors overnight quiet hours, daily cap and uncertain no-retry outcomes',()=>{
  const plan=simulateSyntheticJourney(input());
  expect(plan).toMatchObject({syntheticOnly:true,actualMessagesSent:0,
   realProviderRequests:0,verifiedProviderReceipts:0,
   requiresFreshConsentAtExecution:true,
   automaticRetryAllowed:false,externalEffectsAuthorized:false,
   eligibleAtSnapshot:3});
  expect(plan.steps).toHaveLength(3);
  expect(plan.steps.map(x=>x.scheduledAt)).toEqual([
   '2026-11-20T07:00:00.000Z',
   '2026-11-21T07:00:00.000Z',
   '2026-11-22T07:00:00.000Z'
  ]);
  expect(plan.steps[1]).toMatchObject({virtualOutcomeUnknown:3,
   actualMessagesSent:0,automaticRetryAllowed:false});
  expect(new Set(plan.steps.map(x=>x.virtualRequestRef)).size).toBe(3);
  expect(simulateSyntheticJourney(input())).toEqual(plan);
 });
 it('respects DST transition and local quiet-hour boundary',()=>{
  const value=input();
  value.definition=parseSyntheticJourney({...definition(),
   startAt:'2026-03-29T01:30:00Z',steps:[definition().steps[0]]});
  const result=simulateSyntheticJourney(value);
  expect(result.steps[0]?.scheduledAt).toBe('2026-03-29T06:00:00.000Z');
  expect(result.steps[0]?.localDay).toBe('2026-03-29');
 });
 it('enforces rolling 7-day frequency cap, not only daily cap',()=>{
  const value=input();
  value.definition=parseSyntheticJourney({...definition(),rolling7DayCap:1});
  const result=simulateSyntheticJourney(value);
  expect(Date.parse(result.steps[1]!.scheduledAt)-
   Date.parse(result.steps[0]!.scheduledAt)).toBeGreaterThanOrEqual(7*86400000);
  expect(Date.parse(result.steps[2]!.scheduledAt)-
   Date.parse(result.steps[1]!.scheduledAt)).toBeGreaterThanOrEqual(7*86400000);
 });
 it('never promotes virtual schedule to consent proof when audience is empty',()=>{
  const value=input();value.eligibleAtSnapshot=0;
  const result=simulateSyntheticJourney(value);
  expect(result.steps.every(x=>x.virtualAccepted===0)).toBe(true);
  expect(result.requiresFreshConsentAtExecution).toBe(true);
 });
 it('rejects invalid zone, unbounded schedules, duplicate steps and hidden fields',()=>{
  const cases=[
   {...definition(),timeZone:'Not/A_Zone'},
   {...definition(),dailyCap:100},
   {...definition(),rolling7DayCap:0},
   {...definition(),quietHours:{start:'25:00',end:'08:00'}},
   {...definition(),quietHours:{start:'08:00',end:'08:00'}},
   {...definition(),steps:[...definition().steps,definition().steps[0]]},
   {...definition(),steps:[{key:'welcome',delayMinutes:10081,scenario:'ACCEPTED'}]},
   {...definition(),steps:[{key:'welcome',delayMinutes:0,scenario:'REAL_SEND'}]},
   {...definition(),remoteEndpoint:'https://example.com'},
   {...definition(),startAt:'not-a-date'}
  ];
  for(const candidate of cases)
   expect(()=>parseSyntheticJourney(candidate)).toThrow();
  expect(syntheticJourneyDigest(input().definition))
   .toMatch(/^sha256:[a-f0-9]{64}$/);
 });
});
