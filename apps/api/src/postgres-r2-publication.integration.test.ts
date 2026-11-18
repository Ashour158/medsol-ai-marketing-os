import {describe,expect,it} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {randomUUID,createHash,createHmac} from 'node:crypto';
import {ProviderWebhookEvidenceService} from './provider-webhook-evidence.service.js';
import {PlatformIntegrationHubService} from './platform-integration-hub.service.js';
import {VerifiedMediaEvidenceService} from './verified-media-evidence.service.js';
import {CampaignService} from './campaign.service.js';
import {CreativeAssetService} from './creative-asset.service.js';
import {ApprovalService} from './approval.service.js';
import {CampaignPublicationService} from './campaign-publication.service.js';
import {exactCreativeScopeHash,type ExactCreativeScope} from './exact-creative-scope.js';
import {OutboxService} from './outbox.service.js';
import {MarketingPerformanceService} from './marketing-performance.service.js';
import {permissionForMarketingRoute,hasMarketingPermission} from './marketing-permissions.js';

const enabled=process.env.MARKETING_DB_INTEGRATION==='1';
const later=(days:number)=>new Date(Date.now()+days*86400_000).toISOString();
const mediaBytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/0pUAAAAASUVORK5CYII=','base64');
const digest='sha256:'+createHash('sha256').update(mediaBytes).digest('hex');
describe('R2 governed sandbox publication from real approved campaign and creative',()=>{
 it.skipIf(!enabled)('runs independent human approvals → exact preflight → one sandbox receipt → source-only metrics',async()=>{
  const db=new PrismaClient(),org='r2-org-'+randomUUID(),foreign='r2-other-'+randomUUID();
  const creator='r2-author-'+randomUUID(),reviewer='r2-reviewer-'+randomUUID(),brandId=randomUUID();
  try{
   await db.$connect();
   await db.organization.createMany({data:[{id:org,name:'R2 organization'},{id:foreign,name:'R2 foreign'}]});
   await db.user.createMany({data:[
    {id:creator,organizationId:org,email:creator+'@example.invalid',name:'Creator',role:'MARKETING_MANAGER'},
    {id:reviewer,organizationId:org,email:reviewer+'@example.invalid',name:'Reviewer',role:'ADMIN'}
   ]});
   await db.brand.create({data:{id:brandId,organizationId:org,slug:'r2-brand',name:'R2 Brand',createdBy:creator}});
   await db.brandMasterRevision.create({data:{
    id:randomUUID(),organizationId:org,version:1,status:'APPROVED',
    sourceReference:'internal:verified-brand-policy-1',
    rules:{voice:'Professional',primaryColor:'#115588',prohibitedClaims:[],requiredDisclaimers:[]},
    proposedBy:creator,approvedBy:reviewer,approvedAt:new Date()
   }});
   const objective=await db.marketingObjective.create({data:{
    id:randomUUID(),organizationId:org,name:'Approved campaign proof',
    description:'Controlled sandbox publication validation'
   }});
   const campaigns=new CampaignService(db as any,new OutboxService(db as any));
   const approvals=new ApprovalService(db as any,{
    completeAfterApproval:async()=>{},blockAfterApprovalRejection:async()=>{}
   } as any);
   const creatives=new CreativeAssetService(db as any);
   const publications=new CampaignPublicationService(db as any);
   const hub=new PlatformIntegrationHubService(db as any);
   const mediaVerifier=new VerifiedMediaEvidenceService(db as any);
   const campaign=await campaigns.create({organizationId:org,commandId:randomUUID(),
    correlationId:randomUUID(),code:'R2-'+randomUUID().slice(0,8).toUpperCase(),
    name:'Authorized creative launch',objectiveId:objective.id,brandId,riskLevel:'R2'},creator) as {
     campaignId:string;version:number;status:string
    };
   expect(campaign.status).toBe('IDEA');
   const transition=async(to:'ASSESSMENT'|'PROPOSED'|'APPROVAL_PENDING',version:number)=>{
    return campaigns.transition({organizationId:org,commandId:randomUUID(),
     correlationId:randomUUID(),campaignId:campaign.campaignId,to,
     expectedVersion:version},creator);
   };
   const assessed=await transition('ASSESSMENT',campaign.version) as {version:number};
   const proposed=await transition('PROPOSED',assessed.version) as {version:number};
   await transition('APPROVAL_PENDING',proposed.version);
   const campaignApproval=await db.approval.findFirstOrThrow({where:{
    organizationId:org,objectType:'Campaign',objectId:campaign.campaignId,decision:'PENDING'}});
   await approvals.approve({organizationId:org,commandId:randomUUID(),
    correlationId:randomUUID(),approvalId:campaignApproval.id,
    approverUserId:reviewer,decision:'APPROVED',rationale:'Independent marketing review'});
   const asset=await creatives.create(org,creator,{brandId,title:'Approved campaign creative'});
   const version=await creatives.addRevision(org,creator,asset.id,{
    expectedVersion:0,sourceKind:'EDITABLE_SOURCE',sourceRef:'internal:creative-source/r2-demo',
    rightsExpiresAt:later(70),renditionDigest:digest
   });
   const destination=await hub.register(org,reviewer,{
    brandId,providerKey:'META_GRAPH',destinationLabel:'Controlled integration fixture'});
   const verified=await mediaVerifier.verifyReadback(org,'trusted-storage-worker',version.revisionId,{
    readVersion:async(input)=>({sourceRef:input.sourceRef,
     objectVersion:'r2-immutable-object-v1',bytes:mediaBytes})
   });
   expect(verified).toMatchObject({status:'VERIFIED_READBACK',externalEffectsAuthorized:false});
   await creatives.reviewRights(org,reviewer,version.revisionId,
    'Reviewed authorized licensing for internal test');
   // R2F-B: a historical approval that expires before its planned release
   // can never authorize a real post. Reject it at creation.
   await expect(creatives.submitForApproval(org,creator,version.revisionId,{
    channel:'SOCIAL',destinationRef:destination.destinationRef,
    audienceRef:'internal:audience-snapshot/staging-demo',policyVersion:'v1',
    scheduledAt:later(10),expiresAt:later(8)
   })).rejects.toThrow('Approval expiry must extend');
   const preparedCreative=await creatives.submitForApproval(org,creator,version.revisionId,{
    channel:'SOCIAL',destinationRef:destination.destinationRef,
    audienceRef:'internal:audience-snapshot/staging-demo',policyVersion:'v1',
    scheduledAt:later(10),expiresAt:later(12)
   });
   await approvals.approve({organizationId:org,commandId:randomUUID(),
    correlationId:randomUUID(),approvalId:preparedCreative.approvalId,
    approverUserId:reviewer,decision:'APPROVED',rationale:'Exact asset and audience scope checked'});
   expect(await creatives.reviewApprovalState(org,preparedCreative.approvalId))
    .toMatchObject({decision:'APPROVED',scopeCurrent:true,humanDecisionValid:true,
     externallyExecutable:false});
   // Existing immutable approvals with pre-scheduled expiry must not be
   // magically corrected; fail at the ApprovalService decision and read model.
   const legacyScope:ExactCreativeScope={
    assetId:asset.id,revisionId:version.revisionId,revisionVersion:1,brandId,
    renditionDigest:digest,sourceRef:'internal:creative-source/r2-demo',
    channel:'SOCIAL',destinationRef:destination.destinationRef,
    audienceRef:'internal:audience-snapshot/staging-demo',policyVersion:'v1',
    scheduledAt:later(10),expiresAt:later(8)
   };
   const legacyApproval=await db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${org}, true)`;
    return tx.approval.create({data:{
     id:randomUUID(),organizationId:org,
     objectType:'CreativeAssetRevision',objectId:version.revisionId,
     creativeAssetRevisionId:version.revisionId,
     requiredAuthority:'HUMAN_CREATIVE_RELEASE',riskLevel:'R2',
     requestedBy:creator,scope:legacyScope,scopeDigest:exactCreativeScopeHash(legacyScope),
     scopeExpiresAt:new Date(legacyScope.expiresAt)
    }});
   });
   await expect(approvals.approve({organizationId:org,commandId:randomUUID(),
    correlationId:randomUUID(),approvalId:legacyApproval.id,
    approverUserId:reviewer,decision:'APPROVED',
    rationale:'Legacy expiry cannot authorize a scheduled provider action'
   })).rejects.toThrow('Exact creative scope expired');
   expect((await creatives.reviewApprovalState(org,legacyApproval.id)))
    .toMatchObject({scopeCurrent:false,humanDecisionValid:false,
     externallyExecutable:false});
   expect((await db.approval.findUniqueOrThrow({where:{id:legacyApproval.id}}))
    .decision).toBe('PENDING');
   const requestKey=randomUUID();
   const intent=await publications.prepare(org,creator,{
    campaignId:campaign.campaignId,approvalId:preparedCreative.approvalId,requestKey});
   expect(intent).toMatchObject({status:'PREPARED',replayed:false,externalEffectsAuthorized:false});
   expect(await publications.prepare(org,creator,{
    campaignId:campaign.campaignId,approvalId:preparedCreative.approvalId,requestKey}))
    .toMatchObject({publicationId:intent.publicationId,replayed:true});
   await expect(publications.prepare(org,creator,{
    campaignId:campaign.campaignId,approvalId:preparedCreative.approvalId,requestKey:randomUUID()
   })).rejects.toThrow('already exists');
   await expect(publications.prepare(foreign,creator,{
    campaignId:campaign.campaignId,approvalId:preparedCreative.approvalId,requestKey:randomUUID()
   })).rejects.toThrow('not found in tenant');
   // Independent verified OIDC user is required for release readiness; the
   // bootstrap path and anonymous identity never authorize provider egress.
   const subject='oidc-r2f-'+randomUUID();
   await db.user.update({where:{id:reviewer},data:{oidcSubject:subject}});
   const identity={userId:reviewer,organizationId:org,email:reviewer+'@example.invalid',
    role:'ADMIN',subject};
   const releaseGate=await publications.releaseReadiness(org,identity,intent.publicationId);
   expect(releaseGate).toMatchObject({
    releaseBlocked:true,externalReady:false,externalEffectsAuthorized:false,
    outgoingProviderCallsMade:0,commercialPolicyEligible:false,
    releasePrerequisitesMet:false,candidateEncryptedTokenPresent:false,
    trustedAccountObservationFresh:false,
    mediaReadbackClean:false,existingAuthorizedRemoteAttempts:0
   });
   expect(releaseGate.checks.scheduleWithinApprovedWindow).toBe(true);
   for(const missing of [
    'active_social_publishing_entitlement_required',
    'provider_app_review_and_eligibility_required',
    'customer_authorized_destination_binding_required',
    'deployment_operator_egress_unlock_required',
    'audience_consent_or_no_targeting_authorization_required',
    'provider_or_platform_kill_switch_must_be_clear'
   ])expect(releaseGate.blockers).toContain(missing);
   await expect(publications.releaseReadiness(foreign,identity,intent.publicationId))
    .rejects.toThrow('Verified tenant-scoped human required');
   await expect(publications.releaseReadiness(org,{
    ...identity,subject:'forged-subject'},intent.publicationId))
    .resolves.toMatchObject({
     checks:{authenticatedHuman:false,activeMemberAndRole:false},
     releaseBlocked:true,externalEffectsAuthorized:false
    });
   await expect(publications.assertExternalDispatchBlocked(
    org,identity,intent.publicationId)).rejects.toThrow('External publication disabled');
   expect(await db.publicationAttempt.count({where:{
    organizationId:org,publicationId:intent.publicationId}})).toBe(0);
   const gate=await publications.preflight(org,intent.publicationId);
   expect(gate).toMatchObject({internalReady:true,externalReady:false,
    externalEffectsAuthorized:false,independentlyVerified:false});
   expect(gate.limitations).toContain('provider_account_credentials_and_scopes_unconnected');
   expect(gate.integrationEvidence).toMatchObject({
    destinationRegistered:true,destinationStatus:'PENDING_VERIFICATION',
    mediaBytesReadbackVerified:true,mediaObjectVersion:'r2-immutable-object-v1',
    providerCredentialsVerified:false,providerPublishingCapabilityVerified:false,
    verifiedExternalDestination:false
   });
   // Signed provider-claimed post activity cannot manufacture a remote
   // delivery attempt. The only authoritative attempt is still SANDBOX.
   const webhookSecret=Buffer.from('0123456789abcdef0123456789abcdef');
   const postRaw=Buffer.from(JSON.stringify({object:'page',entry:[{
    id:'123456789012',time:Math.floor(Date.now()/1000),
    changes:[{field:'feed',value:{
     item:'post',verb:'add',post_id:'123456789012_998877665544'
    }}]
   }]}));
   const signature='sha256='+createHmac('sha256',webhookSecret).update(postRaw).digest('hex');
   const incoming=new ProviderWebhookEvidenceService(db as any,{
    secretFor:async()=>webhookSecret
   });
   const signed=await incoming.ingestMeta(org,'meta_ingress',
    destination.id,postRaw,signature);
   expect(signed).toMatchObject({status:'QUARANTINED',
    receiptReconciled:false,externalEffectsAuthorized:false});
   const reconciliation=await publications.reconcileProviderDelivery(
    org,intent.publicationId);
   expect(reconciliation).toMatchObject({
    approvalPreflightReady:true,
    providerKey:'META_GRAPH',connectionStatus:'PENDING_VERIFICATION',
    correlationState:'NO_AUTHORIZED_REMOTE_ATTEMPT',
    signedWebhookObservations:1,signedPostAddCandidates:1,
    postClaimsMatchingObservedAccount:0,authorizedRemoteAttempts:0,
    verifiedRemoteReceipts:0,providerReceiptVerified:false,
    externallyPublished:false,customerDestinationBound:false,
    externalEffectsAuthorized:false
   });
   expect(reconciliation.reasons).toContain(
    'provider_post_claim_not_linked_to_outbound_dispatch');
   await expect(publications.reconcileProviderDelivery(
    foreign,intent.publicationId)).rejects.toThrow('not found');
   await expect(publications.simulate(foreign,creator,intent.publicationId,1)).rejects.toThrow('not found');
   await expect(publications.simulate(org,creator,intent.publicationId,2)).rejects.toThrow('no longer ready');
   const executed=await publications.simulate(org,creator,intent.publicationId,1);
   expect(executed).toMatchObject({status:'SIMULATED',sandboxReceiptOnly:true,
    externalEffectsAuthorized:false,replayed:false});
   const second=await publications.simulate(org,creator,intent.publicationId,1);
   expect(second).toMatchObject({status:'SIMULATED',replayed:true});
   const details=await publications.detail(org,intent.publicationId);
   expect(details.attempts).toHaveLength(1);
   expect(details.attempts[0]).toMatchObject({mode:'SANDBOX',outcome:'SIMULATED'});
   expect(details.preflight.externalReady).toBe(false);
   expect(await publications.reconcileProviderDelivery(org,intent.publicationId))
    .toMatchObject({correlationState:'NO_AUTHORIZED_REMOTE_ATTEMPT',
     signedPostAddCandidates:1,authorizedRemoteAttempts:0,
     verifiedRemoteReceipts:0,externallyPublished:false});
   expect((await publications.list(foreign)).length).toBe(0);
   const summary=await new MarketingPerformanceService(db as any).summary(org,campaign.campaignId);
   expect(summary).toMatchObject({status:'INSUFFICIENT_REVIEWED_DATA',
    independentlyVerified:false,attributionValidated:false});
   expect(summary.totals).toEqual({});
   const events=await db.outboxEvent.findMany({where:{
    organizationId:org,aggregateType:'CampaignPublication',aggregateId:intent.publicationId}});
   expect(events.map(x=>x.eventType)).toEqual([
    'CampaignPublicationPreparedInternal','CampaignPublicationSandboxSimulatedInternal']);
   expect(await db.auditEvent.count({where:{organizationId:org,
    objectType:'CampaignPublication',objectId:intent.publicationId}})).toBe(2);
   // R2F-C one-use operator dispatch fence belongs to PublicationAttempt,
   // never to a second delivery queue and never to a REMOTE mode.
   const originalApproval=await db.approval.findFirstOrThrow({where:{
    organizationId:org,id:preparedCreative.approvalId}});
   const heldPublicationId=randomUUID(),holdApprovalId=randomUUID();
   await db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${org}, true)`;
    await tx.approval.create({data:{
     id:holdApprovalId,organizationId:org,
     objectType:'CreativeAssetRevision',objectId:version.revisionId,
     creativeAssetRevisionId:version.revisionId,requestedBy:creator,
     requiredAuthority:'HUMAN_CREATIVE_RELEASE',riskLevel:'R2',
     decision:'APPROVED',decidedBy:reviewer,decidedAt:new Date(),
     scope:originalApproval.scope!,scopeDigest:originalApproval.scopeDigest!,
     scopeExpiresAt:originalApproval.scopeExpiresAt
    }});
    await tx.campaignPublication.create({data:{
     id:heldPublicationId,organizationId:org,campaignId:campaign.campaignId,
     creativeAssetRevisionId:version.revisionId,approvalId:holdApprovalId,
     scopeDigest:originalApproval.scopeDigest!,requestKey:randomUUID(),
     createdBy:creator,status:'PREPARED',version:1
    }});
   });
   await expect(db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${org}, true)`;
    return tx.publicationAttempt.create({data:{
     id:randomUUID(),organizationId:org,publicationId:heldPublicationId,
     sequence:1,mode:'RELEASE_FENCE',outcome:'BLOCKED',
     evidenceRef:'internal:release-fence/'+'f'.repeat(64),
     inputDigest:'sha256:'+'f'.repeat(64),recordedBy:reviewer
    }});
   })).rejects.toThrow();
   const holdKey='hold-'+randomUUID();
   const holdInput={expectedVersion:1,requestKey:holdKey,
    reason:'Approved security hold to prevent external dispatch'};
   await expect(publications.placeDispatchHold(foreign,identity,
    heldPublicationId,holdInput)).rejects.toThrow('tenant administrator');
   await expect(publications.placeDispatchHold(org,{
    ...identity,subject:'forged-oidc'},heldPublicationId,holdInput))
    .rejects.toThrow('matching OIDC');
   await expect(publications.placeDispatchHold(org,{
    ...identity,role:'MARKETING_SPECIALIST'},heldPublicationId,holdInput))
    .rejects.toThrow('tenant administrator');
   const settled=await Promise.allSettled([
    publications.placeDispatchHold(org,identity,heldPublicationId,holdInput),
    publications.placeDispatchHold(org,identity,heldPublicationId,holdInput)
   ]);
   expect(settled.some(x=>x.status==='fulfilled')).toBe(true);
   const replayHold=await publications.placeDispatchHold(
    org,identity,heldPublicationId,holdInput);
   expect(replayHold).toMatchObject({
    status:'BLOCKED',replayed:true,releaseFenceDurable:true,
    remoteAttemptCreated:false,automaticRetryAllowed:false,
    externalEffectsAuthorized:false
   });
   await expect(publications.placeDispatchHold(org,identity,heldPublicationId,{
    ...holdInput,requestKey:'different-'+randomUUID()
   })).rejects.toThrow('idempotency');
   expect(await db.publicationAttempt.count({where:{
    organizationId:org,publicationId:heldPublicationId
   }})).toBe(1);
   const fence=await db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${org}, true)`;
    return tx.publicationAttempt.findFirstOrThrow({where:{
     organizationId:org,publicationId:heldPublicationId
    }});
   });
   expect(fence).toMatchObject({
    mode:'RELEASE_FENCE',outcome:'BLOCKED',sequence:1,inputDigest:originalApproval.scopeDigest
   });
   expect(fence.evidenceRef).toMatch(/^internal:release-fence\/[a-f0-9]{64}$/);
   expect(await publications.reconcileProviderDelivery(org,heldPublicationId))
    .toMatchObject({correlationState:'NO_AUTHORIZED_REMOTE_ATTEMPT',
     authorizedRemoteAttempts:0,verifiedRemoteReceipts:0,externallyPublished:false});
   expect(await publications.releaseReadiness(org,identity,heldPublicationId))
    .toMatchObject({publicationStatus:'BLOCKED',releaseBlocked:true,
     externalEffectsAuthorized:false,existingAuthorizedRemoteAttempts:0});
   await expect(publications.simulate(org,creator,heldPublicationId,1))
    .rejects.toThrow('no longer ready');
   await expect(publications.assertProviderDispatchUnavailable(
    org,identity,heldPublicationId)).rejects.toThrow('Official provider dispatch unavailable');
   expect(await db.auditEvent.count({where:{
    organizationId:org,objectId:heldPublicationId,
    action:'CAMPAIGN_PUBLICATION_DISPATCH_HELD'
   }})).toBe(1);
   expect(await db.outboxEvent.count({where:{
    organizationId:org,aggregateId:heldPublicationId,
    eventType:'CampaignPublicationDispatchHeldInternal'
   }})).toBe(1);
   await expect(db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${org}, true)`;
    return tx.publicationAttempt.update({where:{id:fence.id},
     data:{outcome:'OUTCOME_UNKNOWN'}});
   })).rejects.toThrow();
   await expect(db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${org}, true)`;
    return tx.publicationAttempt.delete({where:{id:fence.id}});
   })).rejects.toThrow();
   await expect(db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${org}, true)`;
    return tx.publicationAttempt.create({data:{
     id:randomUUID(),organizationId:org,publicationId:heldPublicationId,
     sequence:2,mode:'REMOTE',outcome:'OUTCOME_UNKNOWN',
     evidenceRef:'internal:release-fence/'+'f'.repeat(64),
     inputDigest:originalApproval.scopeDigest!,recordedBy:reviewer
    }});
   })).rejects.toThrow();
   // R2F-D: one-use preauthorization is durable, tenant-bound and NOT
   // equivalent to a real provider attempt. Reuse the same approval owner.
   const escrowApprovalId=randomUUID(),escrowPublicationId=randomUUID();
   await db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${org}, true)`;
    await tx.approval.create({data:{
     id:escrowApprovalId,organizationId:org,
     objectType:'CreativeAssetRevision',objectId:version.revisionId,
     creativeAssetRevisionId:version.revisionId,requestedBy:creator,
     requiredAuthority:'HUMAN_CREATIVE_RELEASE',riskLevel:'R2',
     decision:'APPROVED',decidedBy:reviewer,decidedAt:new Date(),
     scope:originalApproval.scope!,scopeDigest:originalApproval.scopeDigest!,
     scopeExpiresAt:originalApproval.scopeExpiresAt
    }});
    await tx.campaignPublication.create({data:{
     id:escrowPublicationId,organizationId:org,campaignId:campaign.campaignId,
     creativeAssetRevisionId:version.revisionId,approvalId:escrowApprovalId,
     scopeDigest:originalApproval.scopeDigest!,requestKey:randomUUID(),
     createdBy:creator,status:'PREPARED',version:1
    }});
   });
   const escrowKey='preauth-'+randomUUID();
   const escrowInput={expectedVersion:1,requestKey:escrowKey,
    reason:'Stage exact approved content without enabling external dispatch'};
   await expect(publications.reserveDispatchPreauthorization(
    foreign,identity,escrowPublicationId,escrowInput)).rejects.toThrow('OIDC administrator');
   await expect(publications.reserveDispatchPreauthorization(
    org,{...identity,subject:'wrong-subject'},escrowPublicationId,escrowInput))
    .rejects.toThrow('matching OIDC');
   await expect(publications.reserveDispatchPreauthorization(
    org,{...identity,role:'VIEWER'},escrowPublicationId,escrowInput))
    .rejects.toThrow('OIDC administrator');
   const staged=await Promise.allSettled([
    publications.reserveDispatchPreauthorization(org,identity,
     escrowPublicationId,escrowInput),
    publications.reserveDispatchPreauthorization(org,identity,
     escrowPublicationId,escrowInput)
   ]);
   expect(staged.some(r=>r.status==='fulfilled')).toBe(true);
   const escrowReplay=await publications.reserveDispatchPreauthorization(
    org,identity,escrowPublicationId,escrowInput);
   expect(escrowReplay).toMatchObject({
    status:'AWAITING_AUTHORIZATION',replayed:true,
    authorizedRemoteAttempt:false,providerRequestsMade:0,
    automaticRetryAllowed:false,externalEffectsAuthorized:false
   });
   await expect(publications.reserveDispatchPreauthorization(
    org,identity,escrowPublicationId,
    {...escrowInput,requestKey:'different-'+randomUUID()}
   )).rejects.toThrow('idempotency');
   const escrowRow=await db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${org}, true)`;
    return tx.publicationAttempt.findFirstOrThrow({where:{
     organizationId:org,publicationId:escrowPublicationId
    }});
   });
   expect(escrowRow).toMatchObject({
    mode:'DISPATCH_RESERVATION',outcome:'AWAITING_AUTHORIZATION',
    integrationConnectionId:destination.id,providerKey:'META_GRAPH',
    sequence:1,inputDigest:originalApproval.scopeDigest
   });
   expect(escrowRow.evidenceRef).toMatch(/^internal:dispatch-reservation\/[a-f0-9]{64}$/);
   expect(escrowRow.reservationExpiresAt!.getTime()).toBeGreaterThan(Date.now());
   expect(await db.publicationAttempt.count({where:{
    organizationId:org,publicationId:escrowPublicationId
   }})).toBe(1);
   expect(await publications.dispatchReservationStatus(org,escrowPublicationId))
    .toMatchObject({reservationPresent:true,
     authorizationEscrowState:'WAITING_FOR_AUTHORIZATION',
     authorizedRemoteAttempt:false,providerRequestsMade:0,
     safeToAutomaticallyRetry:false});
   expect(await publications.reconcileProviderDelivery(org,escrowPublicationId))
    .toMatchObject({preauthorizationReservationPresent:true,
     authorizedRemoteAttempts:0,verifiedRemoteReceipts:0,
     externallyPublished:false,correlationState:'NO_AUTHORIZED_REMOTE_ATTEMPT'});
   await expect(publications.simulate(org,creator,escrowPublicationId,1))
    .rejects.toThrow('no longer ready');
   await expect(publications.placeDispatchHold(org,identity,
    escrowPublicationId,holdInput)).rejects.toThrow('Only current unexecuted');
   await expect(publications.expireDispatchPreauthorization(
    org,identity,escrowPublicationId,2)).rejects.toThrow('not yet expired');
   expect(await db.auditEvent.count({where:{
    organizationId:org,objectId:escrowPublicationId,
    action:'CAMPAIGN_PUBLICATION_PREAUTHORIZATION_RESERVED'
   }})).toBe(1);
   expect(await db.outboxEvent.count({where:{
    organizationId:org,aggregateId:escrowPublicationId,
    eventType:'CampaignPublicationPreauthorizationReservedInternal'
   }})).toBe(1);
   await expect(db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${org}, true)`;
    return tx.publicationAttempt.update({where:{id:escrowRow.id},
     data:{outcome:'SIMULATED'}});
   })).rejects.toThrow();
   await expect(db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${org}, true)`;
    return tx.publicationAttempt.create({data:{
     id:randomUUID(),organizationId:org,publicationId:escrowPublicationId,
     sequence:2,mode:'REMOTE',outcome:'OUTCOME_UNKNOWN',
     evidenceRef:escrowRow.evidenceRef,inputDigest:escrowRow.inputDigest,
     recordedBy:reviewer
    }});
   })).rejects.toThrow();
   // Source-bound direct SQL spoofing cannot invent account authorization.
   const fakeApprovalId=randomUUID(),fakePublicationId=randomUUID();
   await db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${org}, true)`;
    await tx.approval.create({data:{
     id:fakeApprovalId,organizationId:org,
     objectType:'CreativeAssetRevision',objectId:version.revisionId,
     creativeAssetRevisionId:version.revisionId,requestedBy:creator,
     requiredAuthority:'HUMAN_CREATIVE_RELEASE',riskLevel:'R2',
     decision:'APPROVED',decidedBy:reviewer,decidedAt:new Date(),
     scope:originalApproval.scope!,scopeDigest:originalApproval.scopeDigest!,
     scopeExpiresAt:originalApproval.scopeExpiresAt
    }});
    await tx.campaignPublication.create({data:{
     id:fakePublicationId,organizationId:org,campaignId:campaign.campaignId,
     creativeAssetRevisionId:version.revisionId,approvalId:fakeApprovalId,
     scopeDigest:originalApproval.scopeDigest!,requestKey:randomUUID(),
     createdBy:creator,status:'PREPARED',version:1
    }});
   });
   await expect(db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${org}, true)`;
    return tx.publicationAttempt.create({data:{
     id:randomUUID(),organizationId:org,publicationId:fakePublicationId,
     sequence:1,mode:'DISPATCH_RESERVATION',outcome:'AWAITING_AUTHORIZATION',
     evidenceRef:'internal:dispatch-reservation/'+'f'.repeat(64),
     inputDigest:'sha256:'+'e'.repeat(64),recordedBy:reviewer,
     integrationConnectionId:destination.id,providerKey:'META_GRAPH',
     reservationExpiresAt:new Date(Date.now()+600000)
    }});
   })).rejects.toThrow();
   await expect(publications.dispatchReservationStatus(
    foreign,escrowPublicationId)).rejects.toThrow('not found');
   // A new creative version changes the authoritative asset and invalidates
   // the old exact approval; its old simulated result remains evidence only.
   await creatives.addRevision(org,creator,asset.id,{
    expectedVersion:1,sourceKind:'FLATTENED_EXPORT',sourceRef:'internal:creative-source/r2-v2',
    rightsExpiresAt:later(70),renditionDigest:'sha256:'+'d'.repeat(64)
   });
   const stale=await publications.detail(org,intent.publicationId);
   expect(stale.preflight.internalReady).toBe(false);
   expect(stale.preflight.reasons).toContain('current_same_brand_asset_required');
   expect(stale.status).toBe('SIMULATED');
   const staleReconciliation=await publications.reconcileProviderDelivery(
    org,intent.publicationId);
   expect(staleReconciliation.approvalPreflightReady).toBe(false);
   expect(staleReconciliation.reasons).toContain('current_same_brand_asset_required');
   expect(staleReconciliation.verifiedRemoteReceipts).toBe(0);
   const staleRelease=await publications.releaseReadiness(org,identity,intent.publicationId);
   expect(staleRelease.releaseBlocked).toBe(true);
   expect(staleRelease.checks.currentCampaignAndCreative).toBe(false);
   expect(staleRelease.externalEffectsAuthorized).toBe(false);
   // Once written, even direct SQL cannot rewrite the first synthetic receipt.
   await expect(db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${org}, true)`;
    return tx.publicationAttempt.update({where:{id:details.attempts[0]!.id},
     data:{outcome:'BLOCKED'}});
   })).rejects.toThrow();
  }finally{
   // CI runs a throwaway postgres service; preserve append-only ledger and
   // RLS contract rather than adding a deletion backdoor to fixture records.
   await db.$disconnect();
  }
 },90000);
 it('enforces R2 route permissions, including no bootstrap publication access',()=>{
  expect(permissionForMarketingRoute('POST','/marketing/publications')).toBe('MANAGE_CAMPAIGN');
  expect(permissionForMarketingRoute('POST','/marketing/publications/abc/dispatch-hold'))
   .toBe('MANAGE_TENANT');
  expect(permissionForMarketingRoute('POST','/marketing/publications/abc/dispatch-reservation'))
   .toBe('MANAGE_TENANT');
  expect(permissionForMarketingRoute('POST','/marketing/publications/abc/dispatch-reservation/expire'))
   .toBe('MANAGE_TENANT');
  expect(permissionForMarketingRoute('GET','/marketing/publications/abc/dispatch-reservation'))
   .toBe('READ_AUDIT');
  expect(()=>permissionForMarketingRoute('POST','/marketing/publications/abc/dispatch'))
   .toThrow('not in the permission registry');
  expect(permissionForMarketingRoute('POST','/marketing/publications/abc/simulate'))
   .toBe('EXECUTE_WORKFLOW');
  expect(permissionForMarketingRoute('GET','/marketing/publications/abc/performance')).toBe('READ_AUDIT');
  expect(permissionForMarketingRoute('GET','/marketing/publications/abc/reconciliation'))
   .toBe('READ_AUDIT');
  expect(permissionForMarketingRoute('GET','/marketing/publications/abc/release-readiness'))
   .toBe('READ_AUDIT');
  expect(()=>permissionForMarketingRoute('POST','/marketing/publications/abc/release-readiness'))
   .toThrow('not in the permission registry');
  expect(()=>permissionForMarketingRoute('POST','/marketing/publications/abc/publish'))
   .toThrow('not in the permission registry');
  expect(()=>permissionForMarketingRoute('POST','/marketing/publications/abc/reconciliation'))
   .toThrow('not in the permission registry');
  expect(hasMarketingPermission({role:'VIEWER'} as any,'MANAGE_CAMPAIGN')).toBe(false);
  expect(hasMarketingPermission({role:'MARKETING_SPECIALIST'} as any,'EXECUTE_WORKFLOW')).toBe(true);
  expect(()=>permissionForMarketingRoute('DELETE','/marketing/publications/abc'))
   .toThrow('not in the permission registry');
 });
});
