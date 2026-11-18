/**
 * R2F-A official social publishing eligibility / last-mile preflight.
 *
 * Pure decision logic only. CALLERS MUST derive evidence from authoritative
 * server-side repositories, not an LLM, browser, mock provider, or user JSON.
 * The canonical CampaignPublicationService is the only invoking write owner.
 * Missing evidence is denied. No network call or mode switch exists here.
 */
export type SocialReleaseEvidence={
 authenticatedHuman:boolean;
 activeMemberAndRole:boolean;
 tenantSubscriptionEntitled:boolean;
 delegatedAgencyScopeValid:boolean;
 tenantAndBrandActive:boolean;
 independentExactApprovalCurrent:boolean;
 currentCampaignAndCreative:boolean;
 verifiedUnexpiredRights:boolean;
 sameApprovedDestination:boolean;
 cleanImmutableMediaReadback:boolean;
 mediaVersionStillCurrent:boolean;
 providerAppReviewed:boolean;
 providerCredentialFresh:boolean;
 providerScopesAndCapabilitiesVerified:boolean;
 accountOwnershipVerified:boolean;
 customerDestinationBound:boolean;
 providerRegionAndPurposePermitted:boolean;
 audiencePolicyAndConsentResolved:boolean;
 scheduleWithinApprovedWindow:boolean;
 noTenantOrBrandEmergencyHold:boolean;
 operatorEgressUnlocked:boolean;
 noPriorRemoteAttemptOrUnknownOutcome:boolean;
 noProviderKillSwitch:boolean;
};
export type SocialReleaseDecision={
 eligible:boolean;
 externalEffectAuthorized:boolean;
 missing:readonly string[];
 evidenceChecks:Readonly<Record<keyof SocialReleaseEvidence,boolean>>;
};
const RULES:readonly (readonly [keyof SocialReleaseEvidence,string])[]=[
 ['authenticatedHuman','verified_human_identity_required'],
 ['activeMemberAndRole','active_scoped_publisher_role_required'],
 ['tenantSubscriptionEntitled','active_social_publishing_entitlement_required'],
 ['delegatedAgencyScopeValid','agency_grant_and_brand_scope_must_be_valid'],
 ['tenantAndBrandActive','active_tenant_and_brand_required'],
 ['independentExactApprovalCurrent','current_independent_exact_scope_approval_required'],
 ['currentCampaignAndCreative','unchanged_campaign_and_creative_revision_required'],
 ['verifiedUnexpiredRights','reviewed_media_rights_and_expiry_required'],
 ['sameApprovedDestination','same_approved_tenant_brand_destination_required'],
 ['cleanImmutableMediaReadback','malware_clean_immutable_media_readback_required'],
 ['mediaVersionStillCurrent','current_matching_media_object_version_required'],
 ['providerAppReviewed','provider_app_review_and_eligibility_required'],
 ['providerCredentialFresh','fresh_backend_managed_provider_credential_required'],
 ['providerScopesAndCapabilitiesVerified','official_provider_scope_and_capability_readback_required'],
 ['accountOwnershipVerified','provider_account_ownership_verification_required'],
 ['customerDestinationBound','customer_authorized_destination_binding_required'],
 ['providerRegionAndPurposePermitted','region_and_data_purpose_authorization_required'],
 ['audiencePolicyAndConsentResolved','audience_consent_or_no_targeting_authorization_required'],
 ['scheduleWithinApprovedWindow','approved_release_window_required'],
 ['noTenantOrBrandEmergencyHold','tenant_and_brand_emergency_hold_must_be_clear'],
 ['operatorEgressUnlocked','deployment_operator_egress_unlock_required'],
 ['noPriorRemoteAttemptOrUnknownOutcome','prior_dispatch_or_ambiguous_outcome_must_be_resolved'],
 ['noProviderKillSwitch','provider_or_platform_kill_switch_must_be_clear']
];
/** This function is reusable and testable, but does not grant a capability to
 * callers. A true result is a prerequisite only; the separate official
 * adapter, durable attempt claim and provider readback still must succeed.
 */
export function evaluateSocialPublishingRelease(
 evidence:Partial<SocialReleaseEvidence>|null|undefined
):SocialReleaseDecision{
 const checked={} as Record<keyof SocialReleaseEvidence,boolean>;
 const missing:string[]=[];
 for(const [key,reason] of RULES){
  const valid=evidence?.[key]===true;
  checked[key]=valid;
  if(!valid)missing.push(reason);
 }
 return{eligible:missing.length===0,externalEffectAuthorized:false,
  missing,evidenceChecks:Object.freeze(checked)};
}
