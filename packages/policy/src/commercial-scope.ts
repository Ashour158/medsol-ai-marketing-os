/**
 * R1 authorizer for future brand/agency-scoped commercial commands.
 * Pure policy gate; not yet connected to an externally consequential command.
 * The trusted context MUST be constructed server-side from verified identity,
 * tenant/agency grants, approval records, provider capabilities and entitlements.
 * No LLM or browser-supplied booleans may be considered authoritative.
 */
export type CommercialAction=
 'RESEARCH_READ'|'CREATIVE_DRAFT'|'CAMPAIGN_WRITE'|'APPROVED_PUBLISH'|
 'APPROVED_EMAIL_SEND'|'PRICE_PROPOSAL'|'PAID_MEDIA_SPEND'|'MANAGE_PRIVILEGES';
export type CommercialAuthorizationInput={
 action:CommercialAction;
 identity:{
  humanId:string;
  homeTenantId:string;
  verified:true;
  grantedActions:readonly CommercialAction[];
 };
 resource:{tenantId:string;brandId:string|null;classification:'PUBLIC'|'INTERNAL'|'CONFIDENTIAL'|'RESTRICTED'};
 tenant:{active:boolean;entitledActions:readonly CommercialAction[];emergencyHold:boolean};
 brand?:{brandId:string;authorized:boolean;policyHold:boolean}|null;
 agencyGrant?:{
  agencyTenantId:string;clientTenantId:string;brandIds:readonly string[];
  delegatedActions:readonly CommercialAction[];serverVerified:true;revoked:boolean;
  expiresAt:string;
 }|null;
 dataUse:{permitted:boolean;regionAllowed:boolean};
 external?:{
  providerCapabilityVerified:boolean;destinationAuthorized:boolean;
  exactApproval:{
   approved:true;contentDigest:string;currentContentDigest:string;
   authorizedActorId:string;expiresAt:string;reviewerId:string
  }|null;
  consentEligible?:boolean;budgetReserved?:boolean
 }|null;
};
export type CommercialAuthorizationDecision={
 allowed:boolean;reasons:readonly string[];
 externalEffectAuthorized:boolean;
};
const SUPPORTED_ACTIONS:ReadonlySet<string>=new Set(['RESEARCH_READ','CREATIVE_DRAFT','CAMPAIGN_WRITE',
 'APPROVED_PUBLISH','APPROVED_EMAIL_SEND','PRICE_PROPOSAL','PAID_MEDIA_SPEND','MANAGE_PRIVILEGES']);
const EXTERNAL=new Set<CommercialAction>([
 'APPROVED_PUBLISH','APPROVED_EMAIL_SEND','PAID_MEDIA_SPEND'
]);
const HIGH_RISK=new Set<CommercialAction>([
 ...EXTERNAL,'MANAGE_PRIVILEGES'
]);
const SHA=/^sha256:[0-9a-f]{64}$/;
export function authorizeCommercialScope(i:CommercialAuthorizationInput,now=new Date()):CommercialAuthorizationDecision{
 const reasons:string[]=[];
 const deny=(reason:string)=>reasons.push(reason);
 if(!i||!i.identity||!i.resource||!i.tenant||!i.dataUse)
  return{allowed:false,reasons:['incomplete_trusted_authorization_context'],
   externalEffectAuthorized:false};
 if(!SUPPORTED_ACTIONS.has(i.action))deny('unknown_commercial_action');
 if(i.identity.verified!==true||!i.identity.humanId||!i.identity.homeTenantId)
  deny('verified_human_identity_required');
 if(!i.resource.tenantId)deny('resource_tenant_required');
 if(!i.identity.grantedActions?.includes(i.action))deny('actor_action_not_granted');
 if(!i.tenant.active||i.tenant.emergencyHold)deny('inactive_tenant_or_emergency_hold');
 if(!i.tenant.entitledActions?.includes(i.action))deny('subscription_entitlement_required');
 if(!i.dataUse.permitted||!i.dataUse.regionAllowed)deny('data_purpose_or_region_denied');
 if(i.resource.brandId){
  if(!i.brand||i.brand.brandId!==i.resource.brandId||
     !i.brand.authorized||i.brand.policyHold)
   deny('scoped_brand_authorization_required');
 }
 if(i.identity.homeTenantId!==i.resource.tenantId){
  const a=i.agencyGrant;
  if(!a||a.serverVerified!==true||a.revoked||
     a.agencyTenantId!==i.identity.homeTenantId||
     a.clientTenantId!==i.resource.tenantId||
     !a.delegatedActions.includes(i.action)||
     (i.resource.brandId!==null&&!a.brandIds.includes(i.resource.brandId))||
     !Number.isFinite(Date.parse(a.expiresAt))||Date.parse(a.expiresAt)<=now.getTime())
   deny('active_verified_agency_delegation_required');
 }
 if(HIGH_RISK.has(i.action)&&i.resource.classification==='RESTRICTED')
  deny('restricted_action_requires_separate_privileged_review');
 if(EXTERNAL.has(i.action)){
  const x=i.external;
  if(!x?.providerCapabilityVerified||!x.destinationAuthorized)
   deny('verified_provider_and_destination_required');
  if(i.action==='APPROVED_EMAIL_SEND'&&x?.consentEligible!==true)
   deny('audience_consent_and_suppression_required');
  if(i.action==='PAID_MEDIA_SPEND'&&x?.budgetReserved!==true)
   deny('funded_budget_reservation_required');
  const a=x?.exactApproval;
  if(!a||a.approved!==true||!SHA.test(a.contentDigest)||
     !SHA.test(a.currentContentDigest)||a.contentDigest!==a.currentContentDigest||
     a.authorizedActorId!==i.identity.humanId||
     a.reviewerId===i.identity.humanId||
     !Number.isFinite(Date.parse(a.expiresAt))||Date.parse(a.expiresAt)<=now.getTime())
   deny('current_independent_exact_version_approval_required');
 }
 // Privilege editing always requires the separate IAM maker-checker command.
 if(i.action==='MANAGE_PRIVILEGES')deny('separate_iam_change_workflow_required');
 return{allowed:reasons.length===0,reasons,
  externalEffectAuthorized:reasons.length===0&&EXTERNAL.has(i.action)};
}
