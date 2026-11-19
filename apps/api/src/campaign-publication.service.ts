import {BadRequestException,ConflictException,ForbiddenException,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '@prisma/client';
import {createHash,randomUUID} from 'node:crypto';
import {PrismaService} from './prisma.service.js';
import {EXACT_APPROVAL_EXECUTION_GRACE_MS,exactCreativeScopeHash,isExactCreativeScope} from './exact-creative-scope.js';
import {providerClaimDigest} from './provider-claim-digest.js';
import {assertSocialSimulationScenario,simulateProviderTransport} from './social-provider-simulation.js';
import {
 authorizeCommercialScope,evaluateSocialPublishingRelease
} from '@medsol/policy';
import {hasMarketingPermission} from './marketing-permissions.js';
import type {VerifiedIdentity} from './oidc-identity.js';

/**
 * R2 publication intent is the owner of the *desired* campaign channel action.
 * It is not the event transport, creative store, approval ledger, metrics store
 * or provider connector. No outbound API or external-effect escape hatch exists.
 */
const id=(v:unknown,name:string,max=128)=>{
 if(typeof v!=='string'||!v.trim()||v.length>max||!/^[A-Za-z0-9_-]+$/.test(v))
  throw new BadRequestException('Invalid '+name);
 return v;
};
const SANDBOX_LIMITATIONS=[
 'unverified_media_bytes_and_editable_source',
 'provider_account_credentials_and_scopes_unconnected',
 'audience_consent_and_suppression_not_verified',
 'customer_tenant_identity_and_global_row_level_security_incomplete',
 'external_delivery_feature_flag_permanently_disabled_in_this_tranche'
] as const;
export type PublicationPreflight={
 publicationId:string;internalReady:boolean;externalReady:false;
 independentlyVerified:false;externalEffectsAuthorized:false;
 reasons:string[];limitations:readonly string[];
 integrationEvidence:{
  destinationRegistered:boolean;destinationStatus:string|null;providerKey:string|null;
  mediaBytesReadbackVerified:boolean;mediaObjectVersion:string|null;
  mediaMalwareScanClean:boolean;
  encryptedTokenReceivedPendingAttestation:boolean;
  accountReadbackObserved:boolean;accountReadbackFresh:boolean;
  customerDestinationBound:false;
  providerCredentialsVerified:false;providerPublishingCapabilityVerified:false;
  verifiedExternalDestination:false;
 };
};
type Tx=Prisma.TransactionClient;
@Injectable()
export class CampaignPublicationService{
 constructor(private readonly db:PrismaService){}
 private scoped<T>(organizationId:string,work:(tx:Tx)=>Promise<T>):Promise<T>{
  id(organizationId,'tenant');
  return this.db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${organizationId}, true)`;
   return work(tx);
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
 }
 private async check(tx:Tx,organizationId:string,pub:{
  id:string;campaignId:string;creativeAssetRevisionId:string;approvalId:string;scopeDigest:string
 }):Promise<PublicationPreflight>{
  const reasons:string[]=[];
  const [campaign,revision,approval,master,campaignApproval]=await Promise.all([
   tx.campaign.findFirst({where:{organizationId,id:pub.campaignId}}),
   tx.creativeAssetRevision.findFirst({where:{organizationId,id:pub.creativeAssetRevisionId}}),
   tx.approval.findFirst({where:{organizationId,id:pub.approvalId}}),
   tx.brandMasterRevision.findFirst({where:{organizationId,status:'APPROVED'},
    orderBy:{version:'desc'},select:{version:true}}),
   tx.approval.findFirst({where:{organizationId,objectType:'Campaign',objectId:pub.campaignId,
    decision:'APPROVED'},select:{id:true,decidedBy:true}})
  ]);
  if(!campaign||campaign.status!=='APPROVED')reasons.push('human_approved_campaign_required');
  if(!campaignApproval?.decidedBy)reasons.push('recorded_campaign_human_approval_required');
  if(!campaign?.brandId)reasons.push('campaign_must_bind_tenant_brand');
  if(!revision)reasons.push('creative_revision_missing');
  if(!approval||approval.decision!=='APPROVED'||approval.objectType!=='CreativeAssetRevision'||
      approval.objectId!==pub.creativeAssetRevisionId||
      approval.creativeAssetRevisionId!==pub.creativeAssetRevisionId)
   reasons.push('independent_human_creative_approval_required');
  const asset=revision?await tx.creativeAsset.findFirst({where:{
   organizationId,id:revision.assetId,status:'ACTIVE'}}):null;
  const brand=asset?await tx.brand.findFirst({where:{
   organizationId,id:asset.brandId,status:'ACTIVE'}}):null;
  if(!asset||!brand||campaign?.brandId!==asset.brandId||asset.version!==revision?.version)
   reasons.push('current_same_brand_asset_required');
  const scope=approval?.scope;
  if(!isExactCreativeScope(scope)||!approval?.scopeDigest||
      approval.scopeDigest!==pub.scopeDigest||
      (isExactCreativeScope(scope)&&exactCreativeScopeHash(scope)!==pub.scopeDigest))
   reasons.push('unchanged_exact_version_approval_digest_required');
  if(isExactCreativeScope(scope)){
   if(scope.channel!=='SOCIAL')reasons.push('only_social_sandbox_supported');
   if(!revision||!asset||scope.assetId!==asset.id||scope.revisionId!==revision.id||
      scope.revisionVersion!==revision.version||
      scope.brandId!==asset.brandId||scope.renditionDigest!==revision.renditionDigest||
      scope.sourceRef!==revision.sourceRef)
    reasons.push('creative_approval_source_mismatch');
   if(!master||scope.policyVersion!=='v'+master.version)
    reasons.push('current_approved_brand_master_required');
   const now=Date.now();
   if(Date.parse(scope.expiresAt)<=now||Date.parse(scope.scheduledAt)<=now||
      Date.parse(scope.expiresAt)<=Date.parse(scope.scheduledAt)+EXACT_APPROVAL_EXECUTION_GRACE_MS||
      !approval?.scopeExpiresAt||approval.scopeExpiresAt.getTime()!==Date.parse(scope.expiresAt))
    reasons.push('current_schedule_and_approval_expiry_required');
   if(!revision?.rightsReviewedAt||revision.rightsExpiresAt.getTime()<=Date.parse(scope.scheduledAt))
    reasons.push('reviewed_media_rights_covering_scheduled_time_required');
   if(approval?.requestedBy&&approval.requestedBy===approval.decidedBy)
    reasons.push('maker_checker_separation_required');
   if(asset&&(approval?.decidedBy===asset.createdBy||approval?.decidedBy===revision?.createdBy))
    reasons.push('independent_media_approver_required');
  }
  // Observation-only R2B preflight: the absence of verified provider
  // credentials cannot be filled by a model, client-declared capability,
  // registered destination or the synthetic sandbox receipt.
  const connection=isExactCreativeScope(scope)?await tx.integrationConnection.findFirst({
   where:{organizationId,brandId:scope.brandId,destinationRef:scope.destinationRef}}):null;
  const evidence=isExactCreativeScope(scope)?await tx.verifiedMediaEvidence.findUnique({
   where:{organizationId_creativeAssetRevisionId:{
    organizationId,creativeAssetRevisionId:scope.revisionId}}}):null;
  const pendingCredential=connection?await tx.providerCredential.findUnique({where:{
   organizationId_integrationConnectionId:{
    organizationId,integrationConnectionId:connection.id
   }},select:{status:true,tokenExpiresAt:true}}):null;
  const accountObservation=connection?await tx.providerAccountObservation.findFirst({where:{
   organizationId,integrationConnectionId:connection.id},
   select:{status:true,expiresAt:true,providerCredentialId:true}}):null;
  const matchingEvidence=!!evidence&&evidence.status==='VERIFIED_READBACK'&&
   !!revision&&evidence.sourceRef===revision.sourceRef&&
   evidence.sha256Digest===revision.renditionDigest&&
   isExactCreativeScope(scope)&&evidence.sha256Digest===scope.renditionDigest;
  return{publicationId:pub.id,internalReady:reasons.length===0,externalReady:false,
   independentlyVerified:false,externalEffectsAuthorized:false,reasons,
   limitations:SANDBOX_LIMITATIONS,
   integrationEvidence:{
    destinationRegistered:!!connection,
    destinationStatus:connection?.status??null,
    providerKey:connection?.providerKey??null,
    mediaBytesReadbackVerified:matchingEvidence,
    mediaObjectVersion:matchingEvidence?evidence!.objectVersion:null,
    mediaMalwareScanClean:matchingEvidence&&evidence?.malwareScanStatus==='CLEAN',
    encryptedTokenReceivedPendingAttestation:connection?.status==='PENDING_VERIFICATION'&&
      pendingCredential?.status==='PENDING_ATTESTATION'&&
      pendingCredential.tokenExpiresAt>new Date(),
    accountReadbackObserved:!!accountObservation,
    accountReadbackFresh:connection?.status==='PENDING_VERIFICATION'&&
      pendingCredential?.status==='PENDING_ATTESTATION'&&
      pendingCredential.tokenExpiresAt>new Date()&&
      !!accountObservation&&accountObservation.status==='OBSERVED'&&
      accountObservation.expiresAt>new Date(),
    customerDestinationBound:false as const,
    providerCredentialsVerified:false as const,
    providerPublishingCapabilityVerified:false as const,
    verifiedExternalDestination:false as const
   }};
 }
 async prepare(organizationId:string,actorId:string,raw:{
  campaignId?:unknown;approvalId?:unknown;requestKey?:unknown
 }){
  id(actorId,'authenticated actor');
  const campaignId=id(raw?.campaignId,'campaign'),approvalId=id(raw?.approvalId,'approval');
  const requestKey=id(raw?.requestKey,'idempotency key',160);
  return this.scoped(organizationId,async tx=>{
   const existing=await tx.campaignPublication.findUnique({where:{
    organizationId_requestKey:{organizationId,requestKey}}});
   if(existing){
    if(existing.campaignId!==campaignId||existing.approvalId!==approvalId)
     throw new ConflictException('Idempotency key reused with different publication scope');
    return{publicationId:existing.id,status:existing.status,replayed:true,
     externalEffectsAuthorized:false};
   }
   const approval=await tx.approval.findFirst({where:{organizationId,id:approvalId}});
   if(!approval||!approval.creativeAssetRevisionId||!approval.scopeDigest)
    throw new NotFoundException('Exact creative approval not found in tenant');
   const publication={id:randomUUID(),campaignId,creativeAssetRevisionId:approval.creativeAssetRevisionId,
    approvalId,scopeDigest:approval.scopeDigest};
   const preflight=await this.check(tx,organizationId,publication);
   if(!preflight.internalReady)
    throw new ConflictException('Creative publication preflight denied: '+preflight.reasons.join(', '));
   try{
    const created=await tx.campaignPublication.create({data:{
     ...publication,organizationId,requestKey,createdBy:actorId,status:'PREPARED'
    }});
    await tx.auditEvent.create({data:{organizationId,actorType:'HUMAN',actorId,
     action:'CAMPAIGN_PUBLICATION_PREPARED',objectType:'CampaignPublication',objectId:created.id,
     correlationId:created.id,after:{campaignId,approvalId,scopeDigest:approval.scopeDigest,
      status:'PREPARED',externalEffectsAuthorized:false}}});
    await tx.outboxEvent.create({data:{organizationId,eventId:randomUUID(),
     eventType:'CampaignPublicationPreparedInternal',aggregateType:'CampaignPublication',
     aggregateId:created.id,correlationId:created.id,
     payload:{publicationId:created.id,campaignId,scopeDigest:approval.scopeDigest,
      mode:'SANDBOX_ONLY',externalEffectsAuthorized:false}}});
    return{publicationId:created.id,status:'PREPARED',replayed:false,
     externalEffectsAuthorized:false};
   }catch(e){
    if((e as {code?:string})?.code==='P2002')
     throw new ConflictException('Publication plan already exists for this exact approval or request key');
    throw e;
   }
  });
 }
 async list(organizationId:string,campaignIdInput?:unknown){
  const campaignId=campaignIdInput===undefined?undefined:id(campaignIdInput,'campaign');
  return this.scoped(organizationId,tx=>tx.campaignPublication.findMany({
   where:{organizationId,...(campaignId?{campaignId}:{})},take:100,
   orderBy:{createdAt:'desc'},select:{id:true,campaignId:true,approvalId:true,
    creativeAssetRevisionId:true,status:true,version:true,createdAt:true,updatedAt:true}
  }));
 }
 async detail(organizationId:string,publicationIdInput:unknown){
  const publicationId=id(publicationIdInput,'publication');
  return this.scoped(organizationId,async tx=>{
   const row=await tx.campaignPublication.findFirst({where:{organizationId,id:publicationId},
    include:{attempts:{take:20,orderBy:{sequence:'asc'}}}});
   if(!row)throw new NotFoundException('Publication not found in tenant');
   const preflight=await this.check(tx,organizationId,row);
   return{id:row.id,campaignId:row.campaignId,approvalId:row.approvalId,
    creativeAssetRevisionId:row.creativeAssetRevisionId,status:row.status,
    version:row.version,scopeDigest:row.scopeDigest,
    createdAt:row.createdAt,updatedAt:row.updatedAt,
    preflight,attempts:row.attempts.map(a=>({
     id:a.id,sequence:a.sequence,mode:a.mode,outcome:a.outcome,
     evidenceRef:a.evidenceRef,recordedAt:a.createdAt
    })),externalEffectsAuthorized:false};
  });
 }

 /**
  * R2E-C read-only correlation. The canonical PublicationAttempt table is
  * still SANDBOX-only at the database layer. A provider-signed post claim
  * has no authenticated outbound attempt to attach to, so this can never
  * report a confirmed remote publication in R2E-C.
  *
  * No second receipt ledger, fabricated remote success, or external effect.
  */
 async reconcileProviderDelivery(organizationId:string,publicationIdInput:unknown){
  const publicationId=id(publicationIdInput,'publication');
  return this.scoped(organizationId,async tx=>{
   const pub=await tx.campaignPublication.findFirst({where:{
    organizationId,id:publicationId}});
   if(!pub)throw new NotFoundException('Publication not found in tenant');
   const approval=await tx.approval.findFirst({where:{
    organizationId,id:pub.approvalId},select:{scope:true,scopeDigest:true}});
   const scope=approval?.scope;
   const exactScope=isExactCreativeScope(scope)&&
    approval?.scopeDigest===pub.scopeDigest&&
    exactCreativeScopeHash(scope)===pub.scopeDigest;
   const connection=exactScope?await tx.integrationConnection.findFirst({where:{
    organizationId,brandId:scope.brandId,destinationRef:scope.destinationRef
   },select:{id:true,providerKey:true,status:true}}):null;
   const base={organizationId,...(connection?{integrationConnectionId:connection.id}:{})};
   const [allSigned,postClaims,latest,remoteAttempts,observedAccount]=await Promise.all([
    connection?tx.providerWebhookObservation.count({where:base}):Promise.resolve(0),
    connection?tx.providerWebhookObservation.count({where:{
     ...base,candidatePostDigest:{not:null}
    }}):Promise.resolve(0),
    connection?tx.providerWebhookObservation.findFirst({where:base,
     orderBy:{verifiedAt:'desc'},select:{verifiedAt:true}}):Promise.resolve(null),
    tx.publicationAttempt.count({where:{
     organizationId,publicationId,mode:'REMOTE'
    }}),
    connection?tx.providerAccountObservation.findFirst({where:{
     organizationId,integrationConnectionId:connection.id,status:'OBSERVED',
     expiresAt:{gt:new Date()}
    },select:{providerAccountRef:true}}):Promise.resolve(null)
   ]);
   let accountClaimMatchCount=0;
   if(connection&&connection.providerKey==='META_GRAPH'&&
      observedAccount&&/^[0-9]{4,32}$/.test(observedAccount.providerAccountRef)){
    const candidateAccountDigest=providerClaimDigest(organizationId,
     connection.id,'ACCOUNT',observedAccount.providerAccountRef);
    accountClaimMatchCount=await tx.providerWebhookObservation.count({where:{
     ...base,candidateAccountDigest,candidatePostDigest:{not:null}
    }});
   }
   // Reuse the canonical human/brand/rights/creative policy preflight;
   // correlation must never become an alternate approval decision engine.
   const existingGate=await this.check(tx,organizationId,pub);
   const [heldFence,preauthorization]=await Promise.all([
    tx.publicationAttempt.findFirst({where:{
     organizationId,publicationId,mode:'RELEASE_FENCE'
    },select:{id:true,createdAt:true}}),
    tx.publicationAttempt.findFirst({where:{
     organizationId,publicationId,mode:'DISPATCH_RESERVATION'
    },select:{id:true,createdAt:true,reservationExpiresAt:true}})
   ]);
   const reasons:string[]=[...existingGate.reasons];
   if(preauthorization)reasons.push('preauthorization_reservation_is_not_a_remote_send');
   if(heldFence)reasons.push('operator_dispatch_hold_permanently_active');
   if(!exactScope)reasons.push('exact_publication_approval_scope_invalid');
   if(!connection)reasons.push('registered_provider_destination_not_found');
   if(connection?.status!=='PENDING_VERIFICATION')
    reasons.push('provider_destination_not_pending_verification');
   if(!observedAccount)reasons.push('no_fresh_provider_account_observation');
   reasons.push('no_verified_customer_destination_binding');
   if(remoteAttempts===0)reasons.push('no_authorized_remote_dispatch_evidence');
   reasons.push('no_independent_provider_delivery_receipt_readback');
   if(allSigned>0)reasons.push('signed_webhook_is_not_proof_of_publication');
   if(postClaims>0)reasons.push('provider_post_claim_not_linked_to_outbound_dispatch');
   return{
    publicationId,publicationStatus:pub.status,
    approvalPreflightReady:existingGate.internalReady,
    scopeDigest:pub.scopeDigest,providerKey:connection?.providerKey??null,
    connectionStatus:connection?.status??null,
    correlationState:remoteAttempts>0?'OUTCOME_UNKNOWN':'NO_AUTHORIZED_REMOTE_ATTEMPT',
    signedWebhookObservations:allSigned,
    signedPostAddCandidates:postClaims,
    postClaimsMatchingObservedAccount:accountClaimMatchCount,
    lastSignedWebhookAt:latest?.verifiedAt??null,
    authorizedRemoteAttempts:remoteAttempts,
    releaseFenceActive:!!heldFence,
    releaseFenceRecordedAt:heldFence?.createdAt??null,
    preauthorizationReservationPresent:!!preauthorization,
    preauthorizationExpiresAt:preauthorization?.reservationExpiresAt??null,
    verifiedRemoteReceipts:0,
    providerReceiptVerified:false as const,
    customerDestinationBound:false as const,
    externallyPublished:false as const,
    externalEffectsAuthorized:false as const,
    reasons
   };
  });
 }

 /**
  * R2F-A: non-mutating release eligibility; strictly server-side evidence.
  * The R2 PublicationAttempt schema still allows SANDBOX only, so a positive
  * checklist in an isolated test can NEVER authorize a provider API call.
  * No agent, browser or caller-provided grant can promote these fields.
  */
 async releaseReadiness(organizationId:string,identity:VerifiedIdentity,
  publicationIdInput:unknown){
  const publicationId=id(publicationIdInput,'publication');
  if(!identity||identity.organizationId!==organizationId||
     !identity.userId||!identity.subject)
   throw new BadRequestException('Verified tenant-scoped human required');
  return this.scoped(organizationId,async tx=>{
   const pub=await tx.campaignPublication.findFirst({where:{
    organizationId,id:publicationId
   }});
   if(!pub)throw new NotFoundException('Publication not found in tenant');
   const [user,tenant,approval,existingRemoteAttempts]=await Promise.all([
    tx.user.findFirst({where:{
     id:identity.userId,organizationId,
     oidcSubject:identity.subject,disabledAt:null
    },select:{id:true,role:true,tenantRoleDefinitionId:true}}),
    tx.organization.findUnique({where:{id:organizationId},select:{id:true}}),
    tx.approval.findFirst({where:{organizationId,id:pub.approvalId}}),
    tx.publicationAttempt.count({where:{
     organizationId,publicationId,mode:'REMOTE'
    }})
   ]);
   const scope=approval?.scope;
   const exactScope=isExactCreativeScope(scope)&&approval?.scopeDigest===pub.scopeDigest&&
    exactCreativeScopeHash(scope)===pub.scopeDigest;
   const [connection,media,revision,accountObs,credentials,brand]=await (async()=>{
    const conn=exactScope?await tx.integrationConnection.findFirst({where:{
     organizationId,brandId:scope.brandId,destinationRef:scope.destinationRef
    }}):null;
    const [m,r,o,cred,b]=await Promise.all([
     tx.verifiedMediaEvidence.findUnique({where:{
      organizationId_creativeAssetRevisionId:{
       organizationId,creativeAssetRevisionId:pub.creativeAssetRevisionId
      }
     }}),
     tx.creativeAssetRevision.findFirst({where:{
      organizationId,id:pub.creativeAssetRevisionId
     }}),
     conn?tx.providerAccountObservation.findFirst({where:{
      organizationId,integrationConnectionId:conn.id,status:'OBSERVED'
     }}):Promise.resolve(null),
     conn?tx.providerCredential.findUnique({where:{
      organizationId_integrationConnectionId:{
       organizationId,integrationConnectionId:conn.id
      }
     }}):Promise.resolve(null),
     exactScope?tx.brand.findFirst({where:{
      organizationId,id:scope.brandId,status:'ACTIVE'
     }}):Promise.resolve(null)
    ]);
    return[conn,m,r,o,cred,b] as const;
   })();
   const preflight=await this.check(tx,organizationId,pub);
   const canAct=!!user&&user.role.toUpperCase()===identity.role.toUpperCase()&&
    hasMarketingPermission(identity,'MANAGE_CAMPAIGN');
   const now=Date.now();
   const cleanMedia=!!media&&!!revision&&!!exactScope&&
    media.status==='VERIFIED_READBACK'&&
    media.malwareScanStatus==='CLEAN'&&
    media.sourceRef===revision.sourceRef&&
    media.sha256Digest===revision.renditionDigest&&
    scope.renditionDigest===revision.renditionDigest;
   const knownVersion=cleanMedia&&typeof media.objectVersion==='string'&&
    media.objectVersion.length>3;
   const pendingProviderCredential=!!credentials&&!!connection&&
    credentials.integrationConnectionId===connection.id&&
    credentials.providerKey===connection.providerKey&&
    credentials.status==='PENDING_ATTESTATION'&&
    credentials.tokenExpiresAt.getTime()>now+60000;
   const isObserved=!!accountObs&&accountObs.expiresAt.getTime()>now&&
    accountObs.status==='OBSERVED'&&
    accountObs.providerCredentialId===credentials?.id;
   // Existing current R2C metadata cannot constitute provider approval.
   // No account-owner binding, reviewed app, live scope/readback or
   // commercial entitlement authority has been installed yet.
   const evidence={
    authenticatedHuman:!!user&&identity.organizationId===organizationId,
    activeMemberAndRole:canAct,
    tenantSubscriptionEntitled:false,
    delegatedAgencyScopeValid:identity.organizationId===organizationId,
    tenantAndBrandActive:!!tenant&&!!brand,
    independentExactApprovalCurrent:preflight.internalReady&&
     exactScope&&!!approval?.decidedBy&&
     !!approval.requestedBy&&approval.decidedBy!==approval.requestedBy,
    currentCampaignAndCreative:preflight.internalReady&&pub.status==='PREPARED',
    verifiedUnexpiredRights:preflight.internalReady&&!!revision&&
     !!revision.rightsReviewedAt&&revision.rightsExpiresAt.getTime()>now,
    sameApprovedDestination:exactScope&&!!connection&&
     connection.brandId===scope.brandId&&
     connection.destinationRef===scope.destinationRef&&
     connection.status==='VERIFIED',
    cleanImmutableMediaReadback:cleanMedia,
    mediaVersionStillCurrent:!!knownVersion,
    providerAppReviewed:false,
    providerCredentialFresh:pendingProviderCredential,
    providerScopesAndCapabilitiesVerified:false,
    accountOwnershipVerified:false,
    customerDestinationBound:false,
    providerRegionAndPurposePermitted:false,
    audiencePolicyAndConsentResolved:false,
    // Approval must remain valid AT the scheduled release time. Current
    // sandbox scopes may expire earlier; such plans are never live-ready.
    scheduleWithinApprovedWindow:exactScope&&
     Number.isFinite(Date.parse(scope.scheduledAt))&&
     Date.parse(scope.scheduledAt)+EXACT_APPROVAL_EXECUTION_GRACE_MS<Date.parse(scope.expiresAt)&&
     Date.parse(scope.expiresAt)>now,
    noTenantOrBrandEmergencyHold:false,
    operatorEgressUnlocked:false,
    noPriorRemoteAttemptOrUnknownOutcome:existingRemoteAttempts===0&&
     pub.status==='PREPARED',
    noProviderKillSwitch:false
   };
   const gate=evaluateSocialPublishingRelease(evidence);
   // R1 canonical commercial policy is additional AND authorization. Its
   // subscription and provider context are deliberately absent here.
   const commercial=authorizeCommercialScope({
    action:'APPROVED_PUBLISH',
    identity:{humanId:identity.userId,homeTenantId:identity.organizationId,
     verified:true,grantedActions:canAct?['APPROVED_PUBLISH']:[]},
    resource:{tenantId:organizationId,
     brandId:exactScope?scope.brandId:null,classification:'INTERNAL'},
    tenant:{active:!!tenant,entitledActions:[],emergencyHold:true},
    brand:exactScope?{brandId:scope.brandId,authorized:!!brand,policyHold:true}:null,
    dataUse:{permitted:false,regionAllowed:false},
    external:{providerCapabilityVerified:false,destinationAuthorized:false,
     exactApproval:null}
   });
   const blockers=[...new Set([
    ...preflight.reasons,...gate.missing,...commercial.reasons,
    ...(isObserved?[]:['trusted_provider_observation_not_current']),
    'real_provider_dispatch_and_receipt_adapter_not_activated'
   ])];
   return{
    publicationId,publicationStatus:pub.status,
    scopeDigest:pub.scopeDigest,connectionId:connection?.id??null,
    providerKey:connection?.providerKey??null,
    candidateEncryptedTokenPresent:pendingProviderCredential,
    trustedAccountObservationFresh:isObserved,
    mediaReadbackClean:cleanMedia,mediaObjectVersionVerified:!!knownVersion,
    releasePrerequisitesMet:gate.eligible,
    commercialPolicyEligible:commercial.allowed,
    externalReady:false as const,externalEffectsAuthorized:false as const,
    outgoingProviderCallsMade:0 as const,
    existingAuthorizedRemoteAttempts:existingRemoteAttempts,
    releaseBlocked:true as const,
    checks:gate.evidenceChecks,blockers
   };
  });
 }
 /**
  * Absolute R2F-A barrier: network dispatch is absent. Do not add a public
  * POST route until the provider-specific approved worker + durable attempt
  * fence, global IAM, verified customer ownership and staged adapter exist.
  */

 /**
  * Durable one-use DENIAL fence (NOT an outbound dispatch reservation). The
  * only permitted write is a non-dispatchable RELEASE_FENCE / BLOCKED evidence
  * row inside the canonical PublicationAttempt authority.
  */

 /**
  * R2F-D: one-use PRE-AUTHORIZATION escrow. This is NOT a REMOTE attempt,
  * an approved send, a permission to call an adapter, or an implicit retry.
  * The canonical publication and attempt ledger own the entire transition.
  */
 async reserveDispatchPreauthorization(organizationId:string,identity:VerifiedIdentity,
  publicationIdInput:unknown,input:{
   expectedVersion?:unknown;requestKey?:unknown;reason?:unknown
  }){
  const publicationId=id(publicationIdInput,'publication');
  if(!identity||identity.organizationId!==organizationId||!identity.userId||
     !identity.subject||!hasMarketingPermission(identity,'MANAGE_TENANT'))
   throw new ForbiddenException('Tenant OIDC administrator required');
  if(!Number.isSafeInteger(input?.expectedVersion)||(input.expectedVersion as number)<1)
   throw new BadRequestException('Expected publication version required');
  const expectedVersion=input.expectedVersion as number;
  const requestKey=id(input?.requestKey,'preauthorization idempotency key',160);
  if(requestKey.length<12)throw new BadRequestException('Preauthorization key must have 12+ characters');
  const reason=typeof input?.reason==='string'?input.reason.trim():'';
  if(reason.length<12||reason.length>500)
   throw new BadRequestException('Specific preauthorization rationale (12–500 characters) required');
  const work=async(tx:Tx)=>{
   const actor=await tx.user.findFirst({where:{
    organizationId,id:identity.userId,oidcSubject:identity.subject,disabledAt:null
   },select:{role:true}});
   if(!actor||actor.role.toUpperCase()!==identity.role.toUpperCase()||
      !['ADMIN','SUPER_ADMIN'].includes(actor.role.toUpperCase()))
    throw new ForbiddenException('Active matching OIDC tenant administrator required');
   const pub=await tx.campaignPublication.findFirst({where:{
    organizationId,id:publicationId
   }});
   if(!pub)throw new NotFoundException('Publication not found in tenant');
   const previous=await tx.publicationAttempt.findFirst({where:{
    organizationId,publicationId,mode:'DISPATCH_RESERVATION'
   }});
   if(previous){
    const digest=createHash('sha256').update(JSON.stringify([
     'medsol-r2f-d-reservation-v1',organizationId,publicationId,
     previous.integrationConnectionId,requestKey
    ])).digest('hex');
    if(previous.evidenceRef!=='internal:dispatch-reservation/'+digest)
     throw new ConflictException('Preauthorization reservation idempotency key differs');
    if(!['AWAITING_AUTHORIZATION','BLOCKED'].includes(pub.status))
     throw new ConflictException('Preauthorization reservation state inconsistent');
    return{publicationId,status:pub.status,attemptId:previous.id,
     expiresAt:previous.reservationExpiresAt,replayed:true,
     authorizedRemoteAttempt:false,providerRequestsMade:0,
     automaticRetryAllowed:false,externalEffectsAuthorized:false};
   }
   if(pub.status!=='PREPARED'||pub.version!==expectedVersion)
    throw new ConflictException('Only current unexecuted publication may be reserved');
   const prior=await tx.publicationAttempt.count({where:{organizationId,publicationId}});
   if(prior!==0)throw new ConflictException('Preauthorization requires no prior attempt');
   const approval=await tx.approval.findFirst({where:{
    organizationId,id:pub.approvalId
   }});
   if(!approval||!isExactCreativeScope(approval.scope)||
      approval.scopeDigest!==pub.scopeDigest||
      exactCreativeScopeHash(approval.scope)!==pub.scopeDigest)
    throw new ConflictException('Current exact approval scope required');
   const scope=approval.scope;
   const preflight=await this.check(tx,organizationId,pub);
   if(!preflight.internalReady)
    throw new ConflictException('Internal approval and rights preflight denied: '+
     preflight.reasons.join(', '));
   const connection=await tx.integrationConnection.findFirst({where:{
    organizationId,brandId:scope.brandId,
    destinationRef:scope.destinationRef,status:'PENDING_VERIFICATION'
   },select:{id:true,providerKey:true}});
   if(!connection)throw new ConflictException('Tenant provider connection unavailable');
   const fingerprint=createHash('sha256').update(JSON.stringify([
    'medsol-r2f-d-reservation-v1',organizationId,publicationId,
    connection.id,requestKey
   ])).digest('hex');
   // 10 minute time-bounded *administrative reservation*, not a lease to send.
   const reservationExpiresAt=new Date(Date.now()+10*60_000);
   const attempt=await tx.publicationAttempt.create({data:{
    id:randomUUID(),organizationId,publicationId,sequence:1,
    mode:'DISPATCH_RESERVATION',outcome:'AWAITING_AUTHORIZATION',
    evidenceRef:'internal:dispatch-reservation/'+fingerprint,
    inputDigest:pub.scopeDigest,recordedBy:identity.userId,
    integrationConnectionId:connection.id,providerKey:connection.providerKey,
    reservationExpiresAt
   }});
   const updated=await tx.campaignPublication.updateMany({where:{
    organizationId,id:publicationId,status:'PREPARED',version:pub.version
   },data:{status:'AWAITING_AUTHORIZATION',version:{increment:1}}});
   if(updated.count!==1)throw new ConflictException('Concurrent publication reservation claim');
   await tx.auditEvent.create({data:{
    organizationId,actorType:'HUMAN',actorId:identity.userId,
    action:'CAMPAIGN_PUBLICATION_PREAUTHORIZATION_RESERVED',
    objectType:'CampaignPublication',objectId:publicationId,
    correlationId:attempt.id,
    after:{reason,attemptId:attempt.id,scopeDigest:pub.scopeDigest,
     connectionId:connection.id,providerKey:connection.providerKey,
     expiresAt:reservationExpiresAt.toISOString(),remoteAttempt:false,
     providerRequestsMade:0,externalEffectsAuthorized:false}
   }});
   await tx.outboxEvent.create({data:{
    organizationId,eventId:randomUUID(),
    eventType:'CampaignPublicationPreauthorizationReservedInternal',
    aggregateType:'CampaignPublication',aggregateId:publicationId,
    correlationId:attempt.id,version:pub.version+1,
    payload:{publicationId,attemptId:attempt.id,expiresAt:reservationExpiresAt.toISOString(),
     mode:'DISPATCH_RESERVATION',externalEffectsAuthorized:false}
   }});
   return{publicationId,status:'AWAITING_AUTHORIZATION' as const,
    attemptId:attempt.id,expiresAt:reservationExpiresAt,replayed:false,
    authorizedRemoteAttempt:false,providerRequestsMade:0,
    automaticRetryAllowed:false,externalEffectsAuthorized:false};
  };
  try{return await this.scoped(organizationId,work);}
  catch(error){
   const code=(error as {code?:string})?.code;
   if(code!=='P2002'&&code!=='P2034'&&!(error instanceof ConflictException))
    throw error;
   return this.scoped(organizationId,async tx=>{
    const actor=await tx.user.findFirst({where:{
     organizationId,id:identity.userId,oidcSubject:identity.subject,disabledAt:null
    },select:{role:true}});
    if(!actor||actor.role.toUpperCase()!==identity.role.toUpperCase()||
       !['ADMIN','SUPER_ADMIN'].includes(actor.role.toUpperCase()))throw error;
    const [pub,prior]=await Promise.all([
     tx.campaignPublication.findFirst({where:{organizationId,id:publicationId}}),
     tx.publicationAttempt.findFirst({where:{
      organizationId,publicationId,mode:'DISPATCH_RESERVATION'
     }})
    ]);
    if(!pub||!prior||!['AWAITING_AUTHORIZATION','BLOCKED'].includes(pub.status))
     throw error;
    const fingerprint=createHash('sha256').update(JSON.stringify([
     'medsol-r2f-d-reservation-v1',organizationId,publicationId,
     prior.integrationConnectionId,requestKey
    ])).digest('hex');
    if(prior.evidenceRef!=='internal:dispatch-reservation/'+fingerprint)
     throw error;
    return{publicationId,status:pub.status,attemptId:prior.id,
     expiresAt:prior.reservationExpiresAt,replayed:true,
     authorizedRemoteAttempt:false,providerRequestsMade:0,
     automaticRetryAllowed:false,externalEffectsAuthorized:false};
   });
  }
 }
 /**
  * Crash recovery: observation never retries egress. On expiry, a verified
  * administrator can atomically close a stale authorization escrow as BLOCKED.
  * An existing committed record is immutable; no hidden lease renewal.
  */
 async expireDispatchPreauthorization(organizationId:string,identity:VerifiedIdentity,
  publicationIdInput:unknown,expectedVersionInput:unknown){
  const publicationId=id(publicationIdInput,'publication');
  if(!identity||identity.organizationId!==organizationId||!identity.userId||
     !identity.subject||!hasMarketingPermission(identity,'MANAGE_TENANT'))
   throw new ForbiddenException('Verified OIDC administrator required');
  if(!Number.isSafeInteger(expectedVersionInput)||(expectedVersionInput as number)<1)
   throw new BadRequestException('Expected reservation publication version required');
  return this.scoped(organizationId,async tx=>{
   const actor=await tx.user.findFirst({where:{
    organizationId,id:identity.userId,oidcSubject:identity.subject,disabledAt:null
   },select:{role:true}});
   if(!actor||actor.role.toUpperCase()!==identity.role.toUpperCase()||
      !['ADMIN','SUPER_ADMIN'].includes(actor.role.toUpperCase()))
    throw new ForbiddenException('Current OIDC tenant administrator required');
   const [pub,attempt]=await Promise.all([
    tx.campaignPublication.findFirst({where:{organizationId,id:publicationId}}),
    tx.publicationAttempt.findFirst({where:{
     organizationId,publicationId,mode:'DISPATCH_RESERVATION'
    }})
   ]);
   if(!pub||!attempt)throw new NotFoundException('Preauthorization reservation not found');
   if(pub.status==='BLOCKED')
    return{publicationId,status:'BLOCKED' as const,replayed:true,
     authorizedRemoteAttempt:false,externalEffectsAuthorized:false};
   if(pub.status!=='AWAITING_AUTHORIZATION'||pub.version!==expectedVersionInput)
    throw new ConflictException('Preauthorization reservation version changed');
   if(!attempt.reservationExpiresAt||
      attempt.reservationExpiresAt.getTime()>Date.now())
    throw new ConflictException('Preauthorization is not yet expired');
   const changed=await tx.campaignPublication.updateMany({where:{
    organizationId,id:publicationId,status:'AWAITING_AUTHORIZATION',version:pub.version
   },data:{status:'BLOCKED',version:{increment:1}}});
   if(changed.count!==1)throw new ConflictException('Concurrent reservation closure');
   await tx.auditEvent.create({data:{
    organizationId,actorType:'HUMAN',actorId:identity.userId,
    action:'CAMPAIGN_PUBLICATION_PREAUTHORIZATION_EXPIRED',
    objectType:'CampaignPublication',objectId:publicationId,
    correlationId:attempt.id,
    after:{attemptId:attempt.id,reason:'expired_not_dispatched',
     remoteAttempt:false,externalEffectsAuthorized:false}
   }});
   await tx.outboxEvent.create({data:{
    organizationId,eventId:randomUUID(),
    eventType:'CampaignPublicationPreauthorizationExpiredInternal',
    aggregateType:'CampaignPublication',aggregateId:publicationId,
    correlationId:attempt.id,version:pub.version+1,
    payload:{publicationId,attemptId:attempt.id,status:'BLOCKED',
     reason:'expired_not_dispatched',externalEffectsAuthorized:false}
   }});
   return{publicationId,status:'BLOCKED' as const,replayed:false,
    authorizedRemoteAttempt:false,externalEffectsAuthorized:false};
  });
 }
 /** Read-only recovery projection: no refresh, retry, send or status update. */
 async dispatchReservationStatus(organizationId:string,publicationIdInput:unknown){
  const publicationId=id(publicationIdInput,'publication');
  return this.scoped(organizationId,async tx=>{
   const pub=await tx.campaignPublication.findFirst({where:{organizationId,id:publicationId}});
   if(!pub)throw new NotFoundException('Publication not found in tenant');
   const attempt=await tx.publicationAttempt.findFirst({where:{
    organizationId,publicationId,mode:'DISPATCH_RESERVATION'
   }});
   return{publicationId,status:pub.status,
    reservationPresent:!!attempt,
    reservationExpiresAt:attempt?.reservationExpiresAt??null,
    authorizationEscrowState:!attempt?'NO_RESERVATION':
     pub.status==='BLOCKED'?'CLOSED_NOT_SENT':
     (attempt.reservationExpiresAt&&attempt.reservationExpiresAt.getTime()<=Date.now())?
      'EXPIRED_NOT_SENT':'WAITING_FOR_AUTHORIZATION',
    requiresIndependentProviderAuthorization:true,
    authorizedRemoteAttempt:false,providerRequestsMade:0,
    safeToAutomaticallyRetry:false,externalEffectsAuthorized:false};
  });
 }
 async placeDispatchHold(organizationId:string,identity:VerifiedIdentity,
  publicationIdInput:unknown,input:{expectedVersion?:unknown;requestKey?:unknown;reason?:unknown}){
  const publicationId=id(publicationIdInput,'publication');
  if(!identity||identity.organizationId!==organizationId||!identity.userId||
     !identity.subject||!hasMarketingPermission(identity,'MANAGE_TENANT'))
   throw new ForbiddenException('Verified tenant administrator required');
  if(!Number.isSafeInteger(input?.expectedVersion)||(input.expectedVersion as number)<1)
   throw new BadRequestException('Expected publication version required');
  const expectedVersion=input.expectedVersion as number;
  const requestKey=id(input?.requestKey,'hold idempotency key',160);
  if(requestKey.length<12)throw new BadRequestException('Hold key must have 12+ characters');
  const reason=typeof input?.reason==='string'?input.reason.trim():'';
  if(reason.length<12||reason.length>500)
   throw new BadRequestException('Specific release-hold rationale (12–500 characters) required');
  const fenceRef='internal:release-fence/'+createHash('sha256').update(JSON.stringify([
   'medsol-r2f-c-fence-v1',organizationId,publicationId,requestKey
  ])).digest('hex');
  const work=async(tx:Tx)=>{
   const actor=await tx.user.findFirst({where:{
    organizationId,id:identity.userId,oidcSubject:identity.subject,disabledAt:null
   },select:{role:true}});
   if(!actor||actor.role.toUpperCase()!==identity.role.toUpperCase()||
      !['ADMIN','SUPER_ADMIN'].includes(actor.role.toUpperCase()))
    throw new ForbiddenException('Active matching OIDC tenant administrator required');
   const row=await tx.campaignPublication.findFirst({where:{organizationId,id:publicationId}});
   if(!row)throw new NotFoundException('Publication not found in tenant');
   const prior=await tx.publicationAttempt.findFirst({where:{
    organizationId,publicationId,mode:'RELEASE_FENCE'
   }});
   if(prior){
    if(prior.evidenceRef!==fenceRef||row.status!=='BLOCKED')
     throw new ConflictException('Release fence does not match idempotency key');
    return{publicationId,status:'BLOCKED' as const,attemptId:prior.id,
     replayed:true,releaseFenceDurable:true,remoteAttemptCreated:false,
     automaticRetryAllowed:false,externalEffectsAuthorized:false};
   }
   if(row.status!=='PREPARED'||row.version!==expectedVersion)
    throw new ConflictException('Only current unexecuted publication may be held');
   const count=await tx.publicationAttempt.count({where:{organizationId,publicationId}});
   if(count!==0)throw new ConflictException('Existing attempt prevents a new release fence');
   const attempt=await tx.publicationAttempt.create({data:{
    id:randomUUID(),organizationId,publicationId,sequence:1,
    mode:'RELEASE_FENCE',outcome:'BLOCKED',evidenceRef:fenceRef,
    inputDigest:row.scopeDigest,recordedBy:identity.userId
   }});
   const updated=await tx.campaignPublication.updateMany({where:{
    organizationId,id:publicationId,status:'PREPARED',version:row.version
   },data:{status:'BLOCKED',version:{increment:1}}});
   if(updated.count!==1)throw new ConflictException('Concurrent publication transition');
   await tx.auditEvent.create({data:{
    organizationId,actorType:'HUMAN',actorId:identity.userId,
    action:'CAMPAIGN_PUBLICATION_DISPATCH_HELD',objectType:'CampaignPublication',
    objectId:publicationId,correlationId:attempt.id,
    after:{reason,attemptId:attempt.id,scopeDigest:row.scopeDigest,
     mode:'RELEASE_FENCE',remoteAttemptCreated:false,externalEffectsAuthorized:false}
   }});
   await tx.outboxEvent.create({data:{
    organizationId,eventId:randomUUID(),
    eventType:'CampaignPublicationDispatchHeldInternal',
    aggregateType:'CampaignPublication',aggregateId:publicationId,
    correlationId:attempt.id,version:row.version+1,
    payload:{publicationId,attemptId:attempt.id,mode:'RELEASE_FENCE',
     reason,automaticRetryAllowed:false,externalEffectsAuthorized:false}
   }});
   return{publicationId,status:'BLOCKED' as const,attemptId:attempt.id,
    replayed:false,releaseFenceDurable:true,remoteAttemptCreated:false,
    automaticRetryAllowed:false,externalEffectsAuthorized:false};
  };
  try{return await this.scoped(organizationId,work);}
  catch(error){
   const code=(error as {code?:string})?.code;
   if(code!=='P2002'&&code!=='P2034'&&!(error instanceof ConflictException))
    throw error;
   return this.scoped(organizationId,async tx=>{
    const actor=await tx.user.findFirst({where:{
     organizationId,id:identity.userId,oidcSubject:identity.subject,disabledAt:null
    },select:{role:true}});
    if(!actor||actor.role.toUpperCase()!==identity.role.toUpperCase()||
       !['ADMIN','SUPER_ADMIN'].includes(actor.role.toUpperCase()))throw error;
    const [row,prior]=await Promise.all([
     tx.campaignPublication.findFirst({where:{organizationId,id:publicationId}}),
     tx.publicationAttempt.findFirst({where:{
      organizationId,publicationId,mode:'RELEASE_FENCE'
     }})
    ]);
    if(!row||row.status!=='BLOCKED'||!prior||prior.evidenceRef!==fenceRef)
     throw error;
    return{publicationId,status:'BLOCKED' as const,attemptId:prior.id,
     replayed:true,releaseFenceDurable:true,remoteAttemptCreated:false,
     automaticRetryAllowed:false,externalEffectsAuthorized:false};
   });
  }
 }
 /**
  * Absolute external adapter boundary. Neither a sandbox attempt nor a
  * release fence is a provider-write permit. No HTTP adapter is invoked.
  */
 async assertProviderDispatchUnavailable(organizationId:string,
  identity:VerifiedIdentity,publicationIdInput:unknown){
  const readiness=await this.releaseReadiness(organizationId,identity,publicationIdInput);
  throw new ConflictException('Official provider dispatch unavailable: '+
   [...new Set([...readiness.blockers,'no_durable_authorized_remote_attempt',
    'provider_egress_disabled_in_database'])].join(', '));
 }
 async assertExternalDispatchBlocked(organizationId:string,identity:VerifiedIdentity,
  publicationIdInput:unknown){
  const result=await this.releaseReadiness(organizationId,identity,publicationIdInput);
  throw new ConflictException('External publication disabled: '+result.blockers.join(', '));
 }
 async preflight(organizationId:string,publicationIdInput:unknown){
  const publicationId=id(publicationIdInput,'publication');
  return this.scoped(organizationId,async tx=>{
   const row=await tx.campaignPublication.findFirst({where:{organizationId,id:publicationId}});
   if(!row)throw new NotFoundException('Publication not found in tenant');
   const check=await this.check(tx,organizationId,row);
   if(row.status!=='PREPARED')check.reasons.push('publication_not_prepared');
   return{...check,internalReady:check.internalReady&&row.status==='PREPARED'};
  });
 }
 async simulate(organizationId:string,actorId:string,publicationIdInput:unknown,
  expectedVersionInput:unknown,scenarioInput?:unknown,simulationKeyInput?:unknown){
  id(actorId,'actor');const publicationId=id(publicationIdInput,'publication');
  if(!Number.isSafeInteger(expectedVersionInput)||(expectedVersionInput as number)<1)
   throw new BadRequestException('Expected publication version required');
  const expectedVersion=expectedVersionInput as number;
  const simulationRequested=scenarioInput!==undefined;
  let scenario:ReturnType<typeof assertSocialSimulationScenario>|null=null;
  let simulationKey:string|null=null;
  if(simulationRequested){
   try{scenario=assertSocialSimulationScenario(scenarioInput);}
   catch{throw new BadRequestException('Unsupported provider simulation scenario');}
   simulationKey=id(simulationKeyInput,'simulation request key',160);
   if(simulationKey.length<12)throw new BadRequestException('Simulation key must have 12+ characters');
  }else if(simulationKeyInput!==undefined)
   throw new BadRequestException('Simulation key requires an explicit scenario');
  return this.scoped(organizationId,async tx=>{
   const row=await tx.campaignPublication.findFirst({where:{organizationId,id:publicationId}});
   if(!row)throw new NotFoundException('Publication not found in tenant');
   let synthetic:ReturnType<typeof simulateProviderTransport>|null=null;
   if(scenario&&simulationKey){
    const approval=await tx.approval.findFirst({where:{organizationId,id:row.approvalId}});
    if(!approval||!isExactCreativeScope(approval.scope)||
       approval.scopeDigest!==row.scopeDigest||
       exactCreativeScopeHash(approval.scope)!==row.scopeDigest)
     throw new ConflictException('Exact immutable creative approval required for simulation');
    const connection=await tx.integrationConnection.findFirst({where:{
     organizationId,brandId:approval.scope.brandId,
     destinationRef:approval.scope.destinationRef
    }});
    if(!connection)throw new ConflictException('Registered tenant provider required for simulation');
    synthetic=simulateProviderTransport({
     organizationId,publicationId,integrationConnectionId:connection.id,
     providerKey:connection.providerKey,scopeDigest:row.scopeDigest,
     scenario,requestKey:simulationKey
    });
   }
   // The same canonical PublicationAttempt remains the only attempt owner.
   // Synthetic results never create a live provider dispatch or remote receipt.
   const receiptRef=synthetic?'internal:sandbox/'+createHash('sha256').update(JSON.stringify([
    'medsol-provider-simulation-receipt-v1',synthetic.providerRequestRef,
    organizationId,publicationId,row.scopeDigest
   ])).digest('hex'):'internal:sandbox/'+createHash('sha256').update(
    [organizationId,row.id,row.scopeDigest,'SANDBOX_V1'].join('|')).digest('hex');
   const status=synthetic?synthetic.outcome:'SIMULATED';
   if(row.status!=='PREPARED'){
    if(!synthetic&&row.status==='SIMULATED')
     return{publicationId,status:'SIMULATED',replayed:true,
      sandboxReceiptOnly:true,externalEffectsAuthorized:false};
    const prior=synthetic?await tx.publicationAttempt.findFirst({where:{
     organizationId,publicationId,mode:'SANDBOX'
    }}):null;
    if(synthetic&&prior?.evidenceRef===receiptRef&&
       prior.outcome===status&&row.status===status)
     return{publicationId,status,replayed:true,sandboxReceiptOnly:true,
      simulation:synthetic,externalEffectsAuthorized:false};
    throw new ConflictException(synthetic?
     'Publication already executed or held under different simulation intent':
     'Publication no longer ready for this simulation');
   }
   if(row.version!==expectedVersion)
    throw new ConflictException('Publication no longer ready for this simulation');
   const preflight=await this.check(tx,organizationId,row);
   if(!preflight.internalReady)
    throw new ConflictException('Publication preflight no longer valid: '+preflight.reasons.join(', '));
   const previous=await tx.publicationAttempt.count({where:{organizationId,publicationId}});
   if(previous>0)throw new ConflictException('Publication already owns attempt evidence');
   const attempt=await tx.publicationAttempt.create({data:{id:randomUUID(),
    organizationId,publicationId,sequence:1,mode:'SANDBOX',outcome:status,
    evidenceRef:receiptRef,inputDigest:row.scopeDigest,recordedBy:actorId}});
   const changed=await tx.campaignPublication.updateMany({where:{id:publicationId,
    organizationId,status:'PREPARED',version:row.version},
    data:{status,version:{increment:1}}});
   if(changed.count!==1)throw new ConflictException('Concurrent simulation claim');
   await tx.auditEvent.create({data:{organizationId,actorType:'HUMAN',actorId,
    action:synthetic?'CAMPAIGN_PROVIDER_SIMULATION_RECORDED':'PUBLICATION_SANDBOX_SIMULATED',
    objectType:'CampaignPublication',objectId:publicationId,
    correlationId:publicationId,
    after:{status,receiptRef,attemptId:attempt.id,
     ...(synthetic?{syntheticProviderKey:synthetic.providerKey,
      syntheticScenario:synthetic.scenario,syntheticTransport:synthetic.transport,
      syntheticReadback:synthetic.readback,
      virtualCallbackCount:synthetic.virtualCallbackCount,
      virtualReadbackMatchesApprovedScope:synthetic.virtualReadbackMatchesApprovedScope,
      syntheticProviderRequestRef:synthetic.providerRequestRef,
      syntheticPostRef:synthetic.simulatedRemotePostRef}:{}),
     actualPlatformDelivery:false,verifiedRemoteReceipts:0,
     externalEffectsAuthorized:false}}});
   await tx.outboxEvent.create({data:{organizationId,eventId:randomUUID(),
    eventType:synthetic?'CampaignProviderSimulationRecordedInternal':
     'CampaignPublicationSandboxSimulatedInternal',
    aggregateType:'CampaignPublication',aggregateId:publicationId,
    correlationId:publicationId,
    payload:{publicationId,attemptId:attempt.id,receiptRef,status,
     ...(synthetic?{scenario:synthetic.scenario,providerKey:synthetic.providerKey,
      readback:synthetic.readback,
      simulatedRemotePostRef:synthetic.simulatedRemotePostRef,
      virtualCallbackCount:synthetic.virtualCallbackCount,
      deduplicatedVirtualCallbackCount:synthetic.deduplicatedVirtualCallbackCount}:{}),
     actualPlatformDelivery:false,verifiedRemoteReceipts:0,
     externalEffectsAuthorized:false},version:row.version+1}});
   return{publicationId,status,replayed:false,sandboxReceiptOnly:true,
    receiptRef,...(synthetic?{simulation:synthetic}:{}),externalEffectsAuthorized:false};
  });
 }
 async cancel(organizationId:string,actorId:string,publicationIdInput:unknown,
  expectedVersionInput:unknown,reasonInput:unknown){
  id(actorId,'actor');const publicationId=id(publicationIdInput,'publication');
  const reason=typeof reasonInput==='string'?reasonInput.trim():'';
  if(reason.length<12||reason.length>500)throw new BadRequestException('Reason must be 12–500 characters');
  if(!Number.isSafeInteger(expectedVersionInput)||(expectedVersionInput as number)<1)
   throw new BadRequestException('Expected publication version required');
  return this.scoped(organizationId,async tx=>{
   const row=await tx.campaignPublication.findFirst({where:{organizationId,id:publicationId}});
   if(!row)throw new NotFoundException('Publication not found');
   if(row.status==='CANCELLED')return{publicationId,status:'CANCELLED',replayed:true};
   if(row.status!=='PREPARED'||row.version!==expectedVersionInput)
    throw new ConflictException('Only unexecuted publication can be cancelled');
   const changed=await tx.campaignPublication.updateMany({where:{
    organizationId,id:publicationId,status:'PREPARED',version:row.version},
    data:{status:'CANCELLED',version:{increment:1}}});
   if(changed.count!==1)throw new ConflictException('Concurrent cancellation');
   await tx.auditEvent.create({data:{organizationId,actorType:'HUMAN',actorId,
    action:'CAMPAIGN_PUBLICATION_CANCELLED',objectType:'CampaignPublication',objectId:publicationId,
    correlationId:publicationId,after:{reason,status:'CANCELLED',
     externalEffectsAuthorized:false}}});
   await tx.outboxEvent.create({data:{organizationId,eventId:randomUUID(),
    eventType:'CampaignPublicationCancelledInternal',aggregateType:'CampaignPublication',
    aggregateId:publicationId,correlationId:publicationId,
    payload:{publicationId,status:'CANCELLED',externalEffectsAuthorized:false},
    version:row.version+1}});
   return{publicationId,status:'CANCELLED',replayed:false,externalEffectsAuthorized:false};
  });
 }
}
