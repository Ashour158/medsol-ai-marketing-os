import {describe,expect,it} from 'vitest';
import {
 evaluateSocialPublishingRelease,type SocialReleaseEvidence
} from './social-publishing-release.js';

const allVerified:SocialReleaseEvidence={
 authenticatedHuman:true,activeMemberAndRole:true,
 tenantSubscriptionEntitled:true,delegatedAgencyScopeValid:true,
 tenantAndBrandActive:true,independentExactApprovalCurrent:true,
 currentCampaignAndCreative:true,verifiedUnexpiredRights:true,
 sameApprovedDestination:true,cleanImmutableMediaReadback:true,
 mediaVersionStillCurrent:true,providerAppReviewed:true,
 providerCredentialFresh:true,providerScopesAndCapabilitiesVerified:true,
 accountOwnershipVerified:true,customerDestinationBound:true,
 providerRegionAndPurposePermitted:true,audiencePolicyAndConsentResolved:true,
 scheduleWithinApprovedWindow:true,noTenantOrBrandEmergencyHold:true,
 operatorEgressUnlocked:true,noPriorRemoteAttemptOrUnknownOutcome:true,
 noProviderKillSwitch:true
};
describe('R2F-A social release prerequisite policy',()=>{
 it('denies absent, incomplete, falsy and caller-supplied unknown proof',()=>{
  const missing=evaluateSocialPublishingRelease(null);
  expect(missing.eligible).toBe(false);
  expect(missing.externalEffectAuthorized).toBe(false);
  expect(missing.missing.length).toBe(Object.keys(allVerified).length);
  for(const key of Object.keys(allVerified) as (keyof SocialReleaseEvidence)[]){
   const result=evaluateSocialPublishingRelease({...allVerified,[key]:false});
   expect(result.eligible).toBe(false);
   expect(result.externalEffectAuthorized).toBe(false);
   expect(result.missing).toHaveLength(1);
   expect(result.evidenceChecks[key]).toBe(false);
   const omitted={...allVerified} as Partial<SocialReleaseEvidence>;
   delete omitted[key];
   expect(evaluateSocialPublishingRelease(omitted).eligible).toBe(false);
   expect(evaluateSocialPublishingRelease({...allVerified,
    [key]:'true' as unknown as boolean}).eligible).toBe(false);
  }
 });
 it('even complete verification is only a prerequisite, never a send authorization',()=>{
  const result=evaluateSocialPublishingRelease(allVerified);
  expect(result.eligible).toBe(true);
  expect(result.missing).toEqual([]);
  expect(result.externalEffectAuthorized).toBe(false);
 });
 it('fails closed if operator lock, provider kill switch or unknown outcomes remain',()=>{
  for(const key of [
   'operatorEgressUnlocked','noProviderKillSwitch',
   'noPriorRemoteAttemptOrUnknownOutcome','customerDestinationBound',
   'providerScopesAndCapabilitiesVerified','audiencePolicyAndConsentResolved'
  ] as const){
   const result=evaluateSocialPublishingRelease({...allVerified,[key]:false});
   expect(result.eligible).toBe(false);
   expect(result.externalEffectAuthorized).toBe(false);
  }
 });
});
