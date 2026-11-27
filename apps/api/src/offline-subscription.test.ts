import {describe,it,expect} from 'vitest';
import {nextSubscription,subscriptionInput,subscriptionProjection,subscriptionScope,subscriptionDigest} from './offline-subscription.js';
const now=new Date('2026-11-27T10:00:00.000Z');
const end='2026-12-27T10:00:00.000Z';
const initial={revision:0,state:'NONE' as const,plan:null,termEndsAt:null,approvalId:null};
const request=(overrides:Record<string,unknown>={})=>subscriptionInput({requestKey:'fixture-test-123456',expectedRevision:0,action:'START',plan:'INTERNAL_BASIC',termEndsAt:end,fixtureOnly:true,...overrides});
describe('Commercial offline subscription policy',()=>{
 it('denies unknown plans, extra authority fields, unbounded revisions and live intent',()=>{
  for(const v of [{plan:'ENTERPRISE_LIVE'},{billingAuthorized:true},{fixtureOnly:false},{expectedRevision:100},{action:'PUBLISH'},{termEndsAt:'tomorrow'}])
   expect(()=>request(v)).toThrow();
 });
 it('requires correct revision and state, with expiry and cancellation removing all simulated entitlements',()=>{
  const active=nextSubscription(initial,request(),now);
  expect(subscriptionProjection(active,now)).toMatchObject({revision:1,effectiveState:'ACTIVE',simulatedEntitledActions:['RESEARCH_READ','CREATIVE_DRAFT'],realEntitlementsGranted:false,billingAuthorized:false,externalEffectsAuthorized:false});
  expect(subscriptionProjection(active,new Date(end))).toMatchObject({effectiveState:'EXPIRED',simulatedEntitledActions:[]});
  expect(()=>nextSubscription(active,request(),now)).toThrow();
  const suspended=nextSubscription(active,request({expectedRevision:1,action:'SUSPEND'}),now);
  expect(subscriptionProjection(suspended,now).simulatedEntitledActions).toEqual([]);
  expect(()=>nextSubscription(suspended,request({expectedRevision:2,action:'RESUME'}),new Date(end))).toThrow();
  const cancelled=nextSubscription(suspended,request({expectedRevision:2,action:'CANCEL'}),now);
  expect(subscriptionProjection(cancelled,now)).toMatchObject({effectiveState:'CANCELLED',simulatedEntitledActions:[]});
  expect(()=>nextSubscription(cancelled,request({expectedRevision:3}),now)).toThrow();
 });
 it('pins the deadline, tenant, plan and expected revision in immutable review digest',()=>{
  const scope=subscriptionScope('tenant-a','actor-a',request(),initial,now);
  expect(subscriptionDigest(scope)).not.toBe(subscriptionDigest({...scope,reviewExpiresAt:'2026-11-29T10:00:00.000Z'}));
  expect(subscriptionDigest(scope)).not.toBe(subscriptionDigest({...scope,organizationId:'tenant-b'}));
  expect(subscriptionDigest(scope)).not.toBe(subscriptionDigest(subscriptionScope('tenant-a','actor-a',request({plan:'INTERNAL_TEAM'}),initial,now)));
 });
});
