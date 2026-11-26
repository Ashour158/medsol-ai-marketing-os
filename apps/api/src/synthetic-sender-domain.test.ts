import {describe,it,expect} from 'vitest';
import {senderDomainFixture,SENDER_DOMAIN_SCENARIOS} from './synthetic-sender-domain.js';
describe('strict sender-authentication fixture only',()=>{
 it('passes only aligned fixture, not real DNS, signature, entitlement or deliverability',()=>{
  expect(senderDomainFixture('ALIGNED')).toMatchObject({fixtureEligible:true,spfAligned:true,dkimAligned:true,
   dmarcPolicy:'REJECT',realDnsQueries:0,realSignatureChecks:0,senderDomainVerified:false,
   providerEntitlementVerified:false,realDeliverabilityVerified:false,externalEffectsAuthorized:false});
  for(const scenario of SENDER_DOMAIN_SCENARIOS.filter(x=>x!=='ALIGNED')){
   const r=senderDomainFixture(scenario);expect(r.fixtureEligible).toBe(false);expect(r.blockers.length).toBeGreaterThan(0);
  }
  // Actual DMARC can pass through one aligned method. The internal fixture
  // policy is deliberately stricter and never claims real DMARC verification.
  expect(senderDomainFixture('DKIM_MISALIGNED')).toMatchObject({dmarcAlignmentResult:'PASS',fixtureEligible:false});
  expect(()=>senderDomainFixture('https://real.example')).toThrow();
  expect(()=>senderDomainFixture({domain:'real.example'})).toThrow();
 });
});
