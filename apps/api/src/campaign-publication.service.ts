import {BadRequestException,ConflictException,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '@prisma/client';
import {createHash,randomUUID} from 'node:crypto';
import {PrismaService} from './prisma.service.js';
import {exactCreativeScopeHash,isExactCreativeScope} from './exact-creative-scope.js';

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
      Date.parse(scope.expiresAt)>=Date.parse(scope.scheduledAt)||
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
  expectedVersionInput:unknown){
  id(actorId,'actor');const publicationId=id(publicationIdInput,'publication');
  if(!Number.isSafeInteger(expectedVersionInput)||(expectedVersionInput as number)<1)
   throw new BadRequestException('Expected publication version required');
  const expectedVersion=expectedVersionInput as number;
  return this.scoped(organizationId,async tx=>{
   const row=await tx.campaignPublication.findFirst({where:{organizationId,id:publicationId}});
   if(!row)throw new NotFoundException('Publication not found in tenant');
   if(row.status==='SIMULATED')return{publicationId,status:'SIMULATED',replayed:true,
    sandboxReceiptOnly:true,externalEffectsAuthorized:false};
   if(row.status!=='PREPARED'||row.version!==expectedVersion)
    throw new ConflictException('Publication no longer ready for this simulation');
   const preflight=await this.check(tx,organizationId,row);
   if(!preflight.internalReady)
    throw new ConflictException('Publication preflight no longer valid: '+preflight.reasons.join(', '));
   // Deterministic local simulation. No fetch, provider SDK, message send,
   // network call, access token or customer-visible delivery.
   const receiptRef='internal:sandbox/'+createHash('sha256').update(
    [organizationId,row.id,row.scopeDigest,'SANDBOX_V1'].join('|')).digest('hex');
   const attempt=await tx.publicationAttempt.create({data:{id:randomUUID(),
    organizationId,publicationId,sequence:1,mode:'SANDBOX',outcome:'SIMULATED',
    evidenceRef:receiptRef,inputDigest:row.scopeDigest,recordedBy:actorId}});
   const changed=await tx.campaignPublication.updateMany({where:{id:publicationId,
    organizationId,status:'PREPARED',version:row.version},
    data:{status:'SIMULATED',version:{increment:1}}});
   if(changed.count!==1)throw new ConflictException('Concurrent simulation claim');
   await tx.auditEvent.create({data:{organizationId,actorType:'HUMAN',actorId,
    action:'PUBLICATION_SANDBOX_SIMULATED',objectType:'CampaignPublication',
    objectId:publicationId,correlationId:publicationId,
    after:{status:'SIMULATED',receiptRef,attemptId:attempt.id,
     actualPlatformDelivery:false,externalEffectsAuthorized:false}}});
   await tx.outboxEvent.create({data:{organizationId,eventId:randomUUID(),
    eventType:'CampaignPublicationSandboxSimulatedInternal',
    aggregateType:'CampaignPublication',aggregateId:publicationId,
    correlationId:publicationId,
    payload:{publicationId,attemptId:attempt.id,receiptRef,
     actualPlatformDelivery:false,externalEffectsAuthorized:false},version:row.version+1}});
   return{publicationId,status:'SIMULATED',replayed:false,
    sandboxReceiptOnly:true,receiptRef,externalEffectsAuthorized:false};
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
