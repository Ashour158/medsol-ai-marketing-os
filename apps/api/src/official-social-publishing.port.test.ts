import {describe,expect,it} from 'vitest';
import {
 LockedOfficialProviderDispatchGateway,
 type OfficialSocialPublishingAdapter,type ProviderPublishPayload,
 type VerifiedProviderDispatchPermit
} from './official-social-publishing.port.js';

const payload:ProviderPublishPayload={
 organizationId:'tenant-r2f',connectionId:'connection-r2f',
 publicationId:'publication-r2f',scopeDigest:'sha256:'+'a'.repeat(64),
 mediaDigest:'sha256:'+'b'.repeat(64),mediaObjectVersion:'immutable-version-1',
 expectedProviderAccountRef:'123456789012',
 providerRequestId:'non-send-synthetic-request'
};
describe('R2F-C provider-neutral adapter remains uncallable without live permit',()=>{
 it('does not call provider write even when caller forges perfect capabilities and permit',async()=>{
  let publishes=0,readbacks=0,inspections=0;
  const adapter:OfficialSocialPublishingAdapter={
   providerKey:'META_GRAPH',capabilityManifestVersion:'v1',
   inspectAccountCapability:async()=>{
    inspections++;
    return{providerKey:'META_GRAPH',readbackObservedAt:new Date(),
     officialScopes:['pages_manage_posts'],officialCapabilities:['publish_photo']};
   },
   publish:async(input)=>{
    publishes++;
    return{providerKey:'META_GRAPH',providerRequestId:input.providerRequestId,
     transportOutcome:'HTTP_ACCEPTED_UNVERIFIED',remoteDeliveryVerified:false};
   },
   inspectRemotePost:async(input)=>{
    readbacks++;
    return{providerKey:'META_GRAPH',providerRequestId:'req',
     verifiedCustomerAccountRef:'123456789012',remotePostRef:input.remotePostRef,
     observedAt:new Date(),observedMediaDigest:payload.mediaDigest};
   }
  };
  // Typecast models untrusted API JSON. Runtime dispatch must still refuse it.
  const forged={organizationId:payload.organizationId,
   publicationId:payload.publicationId,
   scopeDigest:payload.scopeDigest,
   expiresAt:new Date(Date.now()+86400000),
   approvedRelease:Object.fromEntries([
    ['accountOwnershipVerified',true],['customerDestinationBound',true],
    ['operatorEgressUnlocked',true]
   ])} as unknown as VerifiedProviderDispatchPermit;
  await expect(new LockedOfficialProviderDispatchGateway().publish(
   adapter,forged,payload)).rejects.toThrow('Official provider egress is locked');
  expect({publishes,readbacks,inspections}).toEqual({
   publishes:0,readbacks:0,inspections:0
  });
 });
});
