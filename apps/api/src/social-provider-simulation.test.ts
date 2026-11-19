import {describe,expect,it} from 'vitest';
import {
 SOCIAL_PROVIDER_SIMULATION_SCENARIOS,assertSocialSimulationScenario,
 simulateProviderTransport,type SocialSimulationInput
} from './social-provider-simulation.js';
import {PLATFORM_CATALOG} from './platform-integration-hub.service.js';

const base:SocialSimulationInput={
 organizationId:'tenant-1',publicationId:'publication-1',
 integrationConnectionId:'connection-1',providerKey:'META_GRAPH',
 scopeDigest:'sha256:'+'a'.repeat(64),scenario:'SUCCESS',
 requestKey:'operator-key-1234'
};
describe('R2 official catalog-backed, NO-NETWORK provider simulation matrix',()=>{
 it('covers every registered SOCIAL provider without duplicating provider catalog',()=>{
  for(const provider of PLATFORM_CATALOG.filter(p=>p.category==='SOCIAL')){
   const r=simulateProviderTransport({...base,providerKey:provider.key});
   expect(r.providerKey).toBe(provider.key);
   expect(r.catalogProvider).toBe(true);
   expect(r.realProviderRequests).toBe(0);
   expect(r.verifiedRemoteReceipts).toBe(0);
   expect(r.externalEffectsAuthorized).toBe(false);
  }
 });
 it('runs all failure/ambiguity scenarios without any real provider receipt',()=>{
  for(const scenario of SOCIAL_PROVIDER_SIMULATION_SCENARIOS){
   const r=simulateProviderTransport({...base,scenario});
   expect(r.scenario).toBe(scenario);
   expect(r.providerRequestRef).toMatch(/^internal:simulated-provider-request\/[a-f0-9]{64}$/);
   expect(r.automaticRetryAllowed).toBe(false);
   expect(r.externalEffectsAuthorized).toBe(false);
   expect(r.verifiedRemoteReceipts).toBe(0);
   if(scenario==='SUCCESS'||scenario==='DUPLICATE_CALLBACK'){
    expect(r.outcome).toBe('SIMULATED');
    expect(r.readback).toBe('SYNTHETIC_MATCH');
    expect(r.virtualReadbackMatchesApprovedScope).toBe(true);
   }else if(['POLICY_REJECTED','RATE_LIMITED','TOKEN_EXPIRED',
    'ACCOUNT_REVOKED','MEDIA_REJECTED'].includes(scenario)){
    expect(r.outcome).toBe('BLOCKED');
    expect(r.simulatedRemotePostRef).toBeNull();
   }else{
    expect(r.outcome).toBe('OUTCOME_UNKNOWN');
   }
  }
 });
 it('deduplicates virtual callbacks and does not confuse webhook with readback',()=>{
  const dup=simulateProviderTransport({...base,scenario:'DUPLICATE_CALLBACK'});
  expect(dup.virtualCallbackCount).toBe(2);
  expect(dup.deduplicatedVirtualCallbackCount).toBe(1);
  const early=simulateProviderTransport({...base,scenario:'WEBHOOK_BEFORE_READBACK'});
  expect(early.virtualCallbackCount).toBe(1);
  expect(early.readback).toBe('SYNTHETIC_DELAYED');
  expect(early.outcome).toBe('OUTCOME_UNKNOWN');
  expect(early.virtualReadbackMatchesApprovedScope).toBe(false);
  const wrong=simulateProviderTransport({...base,scenario:'READBACK_MISMATCH'});
  expect(wrong.readback).toBe('SYNTHETIC_MISMATCH');
  expect(wrong.outcome).toBe('OUTCOME_UNKNOWN');
 });
 it('binds deterministic fake request and fake post to tenant, connection, scope and key',()=>{
  const r=simulateProviderTransport(base);
  expect(simulateProviderTransport(base)).toEqual(r);
  for(const mutation of [
   {organizationId:'other-tenant'},{publicationId:'other-pub'},
   {integrationConnectionId:'other-connection'},{providerKey:'LINKEDIN'},
   {scopeDigest:'sha256:'+'b'.repeat(64)},{requestKey:'another-key'}
  ])expect(simulateProviderTransport({...base,...mutation}).providerRequestRef)
   .not.toBe(r.providerRequestRef);
 });
 it('fails closed on unknown scenarios, providers, empty identifiers and invalid digest',()=>{
  for(const raw of ['PUBLISH','REAL','',null,undefined,42,{}])
   expect(()=>assertSocialSimulationScenario(raw)).toThrow();
  expect(()=>simulateProviderTransport({...base,providerKey:'CUSTOM_EVIL'})).toThrow();
  expect(()=>simulateProviderTransport({...base,organizationId:''})).toThrow();
  expect(()=>simulateProviderTransport({...base,scopeDigest:'sha256:fake'})).toThrow();
 });
});
