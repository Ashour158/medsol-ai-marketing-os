import {ConflictException} from '@nestjs/common';
import type {SocialReleaseEvidence} from '@medsol/policy';

/**
 * R2F-C provider-neutral Integration Hub port. This is a contract, not a
 * live adapter or independent business authority. Approved providers must
 * implement this port only when production customer account binding,
 * entitlement, audience policy, staging and a server-minted dispatch permit
 * exist in the canonical CampaignPublicationService.
 */
export type ApprovedSocialProvider='META_GRAPH'|'LINKEDIN';
export type ProviderPublishPayload={
 organizationId:string;connectionId:string;publicationId:string;
 scopeDigest:string;mediaDigest:string;mediaObjectVersion:string;
 expectedProviderAccountRef:string;providerRequestId:string;
};
export type ProviderTransportObservation={
 providerKey:ApprovedSocialProvider;
 transportOutcome:'HTTP_ACCEPTED_UNVERIFIED'|'HTTP_REJECTED_UNVERIFIED'|
  'TIMEOUT'|'CONNECTION_RESET'|'SERVER_ERROR'|'UNKNOWN';
 remotePostRef?:string;
 providerRequestId:string;
 /** Even a provider response containing a post ID is not durable readback. */
 remoteDeliveryVerified:false;
};
export type ProviderReadbackObservation={
 providerKey:ApprovedSocialProvider;providerRequestId:string;
 verifiedCustomerAccountRef:string;remotePostRef:string;
 observedAt:Date;observedMediaDigest:string;
};
export interface OfficialSocialPublishingAdapter {
 readonly providerKey:ApprovedSocialProvider;
 readonly capabilityManifestVersion:string;
 /** Official provider-owned capability observation; never a user declaration. */
 inspectAccountCapability(connectionId:string):Promise<{
  providerKey:ApprovedSocialProvider;readbackObservedAt:Date;
  officialScopes:string[];officialCapabilities:string[];
 }>;
 /** Must not be called without a real, durable, independently approved permit. */
 publish(input:ProviderPublishPayload):Promise<ProviderTransportObservation>;
 /** GET-only provider-confirmed receipt readback; not a webhook assertion. */
 inspectRemotePost(input:{connectionId:string;remotePostRef:string}):
  Promise<ProviderReadbackObservation>;
}
/** Deliberately non-instantiable by external consumers of the adapter port.
 * This release has no minting API. TS branding is NOT a security boundary:
 * the runtime gateway below denies even forged objects.
 */
declare const serverMintedPermit:unique symbol;
export type VerifiedProviderDispatchPermit={
 readonly [serverMintedPermit]:'authoritative-server-only';
 readonly organizationId:string;readonly publicationId:string;
 readonly scopeDigest:string;readonly expiresAt:Date;
 readonly approvedRelease:Readonly<SocialReleaseEvidence>;
};
/** Server enforcement is the authoritative boundary. No environment toggle,
 * provider adapter instance, mock response or browser JSON can activate it.
 */
export class LockedOfficialProviderDispatchGateway{
 async publish(_adapter:OfficialSocialPublishingAdapter,
  _permit:VerifiedProviderDispatchPermit,_payload:ProviderPublishPayload):
  Promise<never>{
  throw new ConflictException(
   'Official provider egress is locked: account ownership, approved permit, '+
   'durable REMOTE attempt and independent provider readback not available');
 }
}
