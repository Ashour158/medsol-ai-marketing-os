import {OFFLINE_CAMPAIGN_STAGE_KEYS} from '@medsol/contracts';
import {buildCustomerDeliveryDossier} from './customer-delivery-dossier.js';
import {describe,it,expect} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {CampaignService} from './campaign.service.js';
import {MarketingWorkflowService} from './marketing-workflow.service.js';
import {WorkflowLeaseService} from './workflow-lease.service.js';
import {AgentService} from './agent.service.js';
import {OutboxService} from './outbox.service.js';
import {ApprovalService} from './approval.service.js';
import {BrainRunLedgerService} from './brain-run-ledger.service.js';
import {BrainRunExecutorService} from './brain-run-executor.service.js';
import {MarketingReadService} from './marketing-read.service.js';
import {MarketingLearningService} from './marketing-learning.service.js';
import {BrandMasterService} from './brand-master.service.js';
import {MarketingPerformanceService} from './marketing-performance.service.js';
import {CreativeAssetService} from './creative-asset.service.js';
import {VerifiedMediaEvidenceService} from './verified-media-evidence.service.js';
import {PlatformIntegrationHubService} from './platform-integration-hub.service.js';
import {CampaignPublicationService} from './campaign-publication.service.js';
import {SyntheticAudienceEmailService} from './synthetic-audience-email.service.js';
import {withMarketingTenant} from './prisma.service.js';
const enabled=process.env.MARKETING_DB_INTEGRATION==='1';
const later=(days:number)=>new Date(Date.now()+days*86400_000).toISOString();
function crc32(bytes:Buffer){
 let c=0xffffffff;
 for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}
 return(c^0xffffffff)>>>0;
}
function chunk(kind:string,data:Buffer){
 const type=Buffer.from(kind,'ascii'),size=Buffer.alloc(4),crc=Buffer.alloc(4);
 size.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([type,data])));
 return Buffer.concat([size,type,data,crc]);
}
function png64(){
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(64,0);ihdr.writeUInt32BE(64,4);
 ihdr[8]=8;ihdr[9]=6;
 const rows=Buffer.alloc(64*(1+64*4));
 for(let y=0;y<64;y++){
  const off=y*(1+64*4);rows[off]=0;
  for(let x=0;x<64;x++){
   rows[off+1+x*4]=16;rows[off+2+x*4]=77;
   rows[off+3+x*4]=131;rows[off+4+x*4]=255;
  }
 }
 return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),
  chunk('IHDR',ihdr),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);
}
describe.skipIf(!enabled)('R3-O full actual-PostgreSQL offline campaign journey with original domain owners',()=>{
 it('T08-031 / T09-002 / T10-002 / T15-023 executes real approvals, 13-agent brain, immutable raster, zero-network social/email, report and quarantined learning',async()=>{
  const db=new PrismaClient(),org='r3o-'+randomUUID(),other='r3o-other-'+randomUUID();
  const creator='r3o-creator-'+randomUUID(),reviewer='r3o-reviewer-'+randomUUID(),
   brandId=randomUUID(),subject='oidc-r3o-'+randomUUID();
  try{
   await db.$connect();
   await db.organization.createMany({data:[
    {id:org,name:'Offline integrated campaign'},
    {id:other,name:'Other simulated organization'}
   ]});
   await db.user.createMany({data:[
    {id:creator,organizationId:org,email:creator+'@example.invalid',
     name:'Separate creative author',role:'MARKETING_MANAGER'},
    {id:reviewer,organizationId:org,email:reviewer+'@example.invalid',
     name:'Independent reviewer',role:'ADMIN',oidcSubject:subject}
   ]});
   await withMarketingTenant(db,org,tx=>tx.brand.create({data:{
    id:brandId,organizationId:org,slug:'offline-research-brand',
    name:'Research Brand',createdBy:creator
   }}));
   await db.brandMasterRevision.create({data:{
    id:randomUUID(),organizationId:org,version:1,status:'APPROVED',
    sourceReference:'internal:reviewed-offline-brand-master',
    rules:{voice:'Evidence-first',primaryColor:'#124d83',
     requiredDisclaimers:[],prohibitedClaims:['guaranteed clinical outcome']},
    proposedBy:creator,approvedBy:reviewer,approvedAt:new Date()
   }});
   const objective=await db.marketingObjective.create({data:{
    id:randomUUID(),organizationId:org,
    name:'Offline patient-safe scientific marketing',
    description:'Execute synthetic campaign with no real provider or marketing effects'
   }});
   const agents=new AgentService(db as any);
   const campaigns=new CampaignService(db as any,new OutboxService(db as any));
   const workflows=new MarketingWorkflowService(db as any,agents,campaigns,
    new WorkflowLeaseService(db as any));
   const approval=new ApprovalService(db as any,workflows);
   const reads=new MarketingReadService(db as any);
   const learning=new MarketingLearningService(db as any);
   const performance=new MarketingPerformanceService(db as any);
   const ledger=new BrainRunLedgerService(db as any);
   const brainExecutor=new BrainRunExecutorService(db as any,agents,ledger,
    learning,reads,new BrandMasterService(db as any),performance);
   const media=new VerifiedMediaEvidenceService(db as any);
   const creatives=new CreativeAssetService(db as any);
   const publications=new CampaignPublicationService(db as any);
   const hub=new PlatformIntegrationHubService(db as any);
   const email=new SyntheticAudienceEmailService(db as any);
   const identity={organizationId:org,userId:reviewer,role:'ADMIN',
    subject,email:reviewer+'@example.invalid'};
   const brief='Generate an evidence-first biotechnology research engagement campaign, no unsupported scientific claims or real providers';
   const workflow=await workflows.start({organizationId:org,
    brandId,objectiveId:objective.id,requestedOutcome:brief});
   expect(workflow.status).toBe('WAITING_APPROVAL');
   const campaignId=(workflow.output as {campaign:{campaignId:string}}).campaign.campaignId;
   const pending=await db.approval.findFirstOrThrow({where:{organizationId:org,
    objectType:'Campaign',objectId:campaignId,decision:'PENDING'}});
   await expect(email.simulateEmailJourney(org,identity,{
    brandId,campaignId,contactIds:[randomUUID()],contentDigest:'sha256:'+'b'.repeat(64),
    requestKey:'mail-before-approval-'+randomUUID()
   })).rejects.toThrow('independently approved campaign');
   // Research run is real offline agent execution; no remote LLM is called.
   const run=await ledger.create(org,{
    organizationId:org,correlationId:randomUUID(),requestedOutcome:brief,
    campaignId,objectiveId:objective.id
   },'r3o-brain-'+randomUUID());
   const finished=await brainExecutor.execute(org,run.id);
   expect(finished.status).toBe('REVIEW_REQUIRED');
   expect(finished.steps.length).toBeGreaterThanOrEqual(13);
   await approval.approve({organizationId:org,commandId:randomUUID(),
    correlationId:randomUUID(),approvalId:pending.id,approverUserId:reviewer,
    decision:'APPROVED',rationale:'Independent campaign compliance review'});
   const campaign=await db.campaign.findFirstOrThrow({where:{id:campaignId,organizationId:org}});
   expect(campaign.status).toBe('APPROVED');
   const raster=png64(),requestKey='offline-'+randomUUID(),copy=
    'Scientific research platform awareness preview, with unsupported claims explicitly excluded.';
   const draft=await creatives.createOfflineRasterDraft(org,creator,{
    brandId,title:'Offline approved research image',editableCopy:copy,
    pngBase64:raster.toString('base64'),rightsExpiresAt:later(60),requestKey
   });
   const revisionId=draft.revisionId;
   if(!revisionId)throw new Error('Offline DAM must return immutable revision');
   expect(draft).toMatchObject({
    sourceKind:'FLATTENED_EXPORT',offlineOnly:true,
    layeredEditableImage:false,externalEffectsAuthorized:false,replayed:false
   });
   const replay=await creatives.createOfflineRasterDraft(org,creator,{
    brandId,title:'Offline approved research image',editableCopy:copy,
    pngBase64:raster.toString('base64'),rightsExpiresAt:later(60),requestKey
   }).catch(e=>e);
   // A rights date changes the command scope; fail closed rather than
   // returning a forged replay after another time-based input.
   expect(replay).toBeInstanceOf(Error);
   const p=await creatives.offlinePreview(org,revisionId);
   expect(p.imageDataUrl).toContain('data:image/png;base64,');
   expect(p.editableImageLayers).toBe(false);
   await expect(creatives.offlinePreview(other,revisionId))
    .rejects.toThrow('not found');
   const verified=await media.verifyOfflineRaster(org,revisionId);
   expect(verified).toMatchObject({evidenceOrigin:'OFFLINE_DB_RASTER',
    malwareScanStatus:'NOT_SCANNED',externalEffectsAuthorized:false});
   expect(await media.verifyOfflineRaster(org,revisionId))
    .toMatchObject({replayed:true});
   await expect(withMarketingTenant(db,org,tx=>tx.creativeAssetRevision.update({
    where:{id:revisionId},data:{offlineEditableCopy:'Forged post-review content'}
   }))).rejects.toThrow();
   await expect(withMarketingTenant(db,org,tx=>tx.verifiedMediaEvidence.update({
    where:{organizationId_creativeAssetRevisionId:{
     organizationId:org,creativeAssetRevisionId:revisionId}},
    data:{evidenceOrigin:'VERSIONED_OBJECT_STORE'}
   }))).rejects.toThrow();
   await creatives.reviewRights(org,reviewer,revisionId,
    'Reviewed original synthetic artwork with independent human reviewer');
   const destination=await hub.register(org,reviewer,{
    brandId,providerKey:'META_GRAPH',destinationLabel:'OFFLINE ONLY no account registered'
   });
   const scope=await creatives.submitForApproval(org,creator,revisionId,{
    channel:'SOCIAL',destinationRef:destination.destinationRef,
    audienceRef:'internal:audience-snapshot/offline',
    policyVersion:'v1',scheduledAt:later(2),expiresAt:later(4)
   });
   await expect(approval.approve({organizationId:org,commandId:randomUUID(),
    correlationId:randomUUID(),approvalId:scope.approvalId,approverUserId:creator,
    decision:'APPROVED',rationale:'Creator cannot self-approve an exact creative scope'
   })).rejects.toThrow();
   await approval.approve({organizationId:org,commandId:randomUUID(),
    correlationId:randomUUID(),approvalId:scope.approvalId,approverUserId:reviewer,
    decision:'APPROVED',rationale:'Independent immutable creative scope approval'});
   const pub=await publications.prepare(org,creator,{
    campaignId,approvalId:scope.approvalId,requestKey:'publication-'+randomUUID()
   });
   expect((await publications.preflight(org,pub.publicationId)).internalReady).toBe(true);
   const calendarInput={brandId,start:new Date().toISOString(),end:later(7),spacingMinutes:'60'};
   const calendar=await publications.calendar(org,identity,calendarInput);
   expect(calendar).toMatchObject({brandId,source:'EXISTING_EXACT_CREATIVE_APPROVALS',scheduleChanged:false,externalEffectsAuthorized:false,
    entries:[{approvalId:scope.approvalId,revisionId,approvalDecision:'APPROVED',publicationStatus:'PREPARED',current:true}],conflicts:[]});
   await expect(publications.calendar(other,identity,calendarInput)).rejects.toThrow('Verified editorial operator');
   await expect(publications.calendar(org,identity,{...calendarInput,brandId:'nonexistent'})).rejects.toThrow('Active tenant brand');

   const gate=await publications.releaseReadiness(org,identity,pub.publicationId);
   expect(gate).toMatchObject({releaseBlocked:true,externalReady:false,
    externalEffectsAuthorized:false,outgoingProviderCallsMade:0,
    mediaReadbackClean:false});
   expect(gate.blockers).toContain('synthetic_db_raster_cannot_authorize_real_provider_delivery');
   const simulated=await publications.simulate(org,creator,pub.publicationId,1);
   expect(simulated).toMatchObject({status:'SIMULATED',
    externalEffectsAuthorized:false,sandboxReceiptOnly:true});
   expect((await publications.simulate(org,creator,pub.publicationId,1))
    .replayed).toBe(true);
   const contact=await email.createSyntheticContact(org,identity,{brandId});
   await email.recordSyntheticConsent(org,identity,contact.contactId,{
    action:'SIMULATED_OPT_IN',requestKey:'optin-'+randomUUID()
   });
   const emailResult=await email.simulateEmailJourney(org,identity,{
    brandId,campaignId,contactIds:[contact.contactId],
    contentDigest:draft.renditionDigest,requestKey:'email-'+randomUUID(),
    scenario:'ACCEPTED'
   });
   expect(emailResult).toMatchObject({status:'SIMULATED',
    externalEffectsAuthorized:false,results:{actualMessagesSent:0,
     syntheticEligible:1,verifiedProviderReceipts:0}});
   // First assert missing evidence stays unproven. Then submit purely
   // SYNTHETIC CI numbers through the original quarantine/reviewer owner.
   // This is a disposable test tenant, never a measured marketing outcome.
   expect(await performance.summary(org,campaignId)).toMatchObject({
    status:'INSUFFICIENT_REVIEWED_DATA',attributionValidated:false,
    independentlyVerified:false});
   const syntheticMetrics=[
    ['impressions',1000],['clicks',200],['leads',20],['qualified_leads',5]
   ] as const;
   for(const [metricKey,value] of syntheticMetrics){
    const observation=await performance.ingest(org,creator,{
     campaignId,sourceSystem:'MANUAL_EXPORT',
     sourceRecordId:'r3o-ci-virtual-'+randomUUID(),metricKey,value,
     observedAt:new Date().toISOString(),
     sourceReference:'internal:r3o-disposable-synthetic-funnel-not-real'
    });
    expect(observation.status).toBe('QUARANTINED');
    await expect(performance.review(org,creator,observation.observationId,
     'A submitter must not self-review synthetic conversion data'))
     .rejects.toThrow('Independent');
    expect(await performance.review(org,reviewer,observation.observationId,
     'Independent fixture review, never verified actual campaign activity'))
     .toMatchObject({status:'REVIEWED',independentlyVerified:false,
      externalEffectsAuthorized:false});
   }
   const reviewed=await performance.summary(org,campaignId);
   expect(reviewed).toMatchObject({
    status:'REVIEWED_SOURCE_EVIDENCE',attributionValidated:false,
    independentlyVerified:false,roiValidated:false,revenueVerified:false,
    totals:{impressions:'1000',clicks:'200',leads:'20',qualified_leads:'5'}
   });
   const signal=await learning.ingest(org,{
    topic:'offline journey control observations',sector:'biotechnology',
    sourceUrl:'https://example.invalid/offline-campaign/'+campaignId,
    sourceTitle:'Synthetic case exercise, not published evidence',
    observedAt:new Date().toISOString(),
    evidence:{summary:'Review workflow approval and consent controls before considering learning signals'}
   });
   expect(signal.signal.status).toBe('QUARANTINED');
   const timeline=await reads.offlineJourney(org,campaignId);
   expect(timeline.stages).toMatchObject({
    briefRecorded:true,agentResearchReviewed:true,
    campaignIndependentlyApproved:true,creativeDraftAvailable:true,
    creativeRightsReviewed:true,creativeIndependentlyApproved:true,
    simulatedSocialPublished:true,syntheticEmailSimulated:true,
    performanceReviewed:true,learningFeedbackQuarantined:true
   });
   expect(timeline.offlineSimulationOnly).toBe(true);
   expect(timeline.externalEffectsAuthorized).toBe(false);
   expect(timeline.observations).toHaveLength(4);
   expect(timeline.observations.every(x=>x.status==='REVIEWED')).toBe(true);
   expect(JSON.stringify(timeline.observations)).not.toContain('private@example.com');
   const dossier=buildCustomerDeliveryDossier(org,timeline,
    await performance.summary(org,campaignId),
    await learning.trendBrief(org),new Date());
   expect(dossier.stages.map(s=>s.key)).toEqual(OFFLINE_CAMPAIGN_STAGE_KEYS);
   expect(dossier.missingOfflineGates).toEqual([]);
   expect(dossier).toMatchObject({
    schema:'medsol.customer_delivery_dossier.v1',
    offlineGatesMet:10,productionStatus:'NOT_CERTIFIED',
    pillars:{creative:{currentLinkedRightsAndApprovalReviewed:1},
     social:{sandboxSimulated:1,realPostsPublished:0},
     email:{syntheticSimulations:1,actualMessagesSent:0},
     conversion:{reviewedQualifiedLeadCount:'5',causalAttributionVerified:false},
     commercial:{roiVerified:false}},
    signed:false,externalEffectsAuthorized:false
   });
   expect(JSON.stringify(dossier)).not.toContain(contact.contactId);
   await expect(reads.offlineJourney(other,campaignId)).rejects.toThrow('not found');

   expect(timeline.publications[0]!.attempts[0]!.mode).toBe('SANDBOX');
   expect(await db.providerCredential.count({where:{organizationId:org}})).toBe(0);
   expect(await db.modelUsage.count({where:{organizationId:org}})).toBe(0);
   expect(await db.publicationAttempt.count({where:{
    organizationId:org,mode:'REMOTE'}})).toBe(0);
   // A new editable source invalidates the old exact approval and is not
   // independently reviewed or publishable merely because its parent was.
   const layeredInput={parentRevisionId:revisionId,expectedVersion:draft.version,requestKey:randomUUID(),
    rightsExpiresAt:later(60),spec:{format:'SQUARE',title:'Editable scientific draft',body:'Separate source text, no real rights inherited.',accent:'#124d83'}};
   const layer=await creatives.appendOfflineLayeredDraft(org,creator,draft.assetId,layeredInput) as {revisionId:string;version:number};
   expect(layer).toMatchObject({version:draft.version+1,parentRevisionId:revisionId,approvalInherited:false,releaseAuthorized:false});
   const layerPreview=await creatives.offlineLayeredPreview(org,layer.revisionId);
   expect(layerPreview).toMatchObject({current:true,parentRevisionId:revisionId,releaseAuthorized:false,
    rightsVerified:false,spec:layeredInput.spec});
   expect(layerPreview.svgDataUrl).toMatch(/^data:image\/svg\+xml;base64,/);
   expect(await creatives.appendOfflineLayeredDraft(org,creator,draft.assetId,layeredInput)).toMatchObject({revisionId:layer.revisionId,replayed:true});
   await expect(creatives.appendOfflineLayeredDraft(org,creator,draft.assetId,{...layeredInput,spec:{...layeredInput.spec,title:'Changed'}})).rejects.toThrow('different evidence');
   await expect(creatives.offlineLayeredPreview(other,layer.revisionId)).rejects.toThrow('not found');
   expect(await creatives.reviewApprovalState(org,scope.approvalId)).toMatchObject({scopeCurrent:false,humanDecisionValid:false});
   await expect(creatives.submitForApproval(org,creator,layer.revisionId,{channel:'SOCIAL',destinationRef:destination.destinationRef,
    audienceRef:'internal:audience-snapshot/offline',policyVersion:'v1',scheduledAt:later(2),expiresAt:later(4)})).rejects.toThrow('separately verified release rendition');
   await expect(withMarketingTenant(db,org,tx=>tx.creativeAssetRevision.update({where:{id:layer.revisionId},
    data:{offlineLayeredSourceDigest:'sha256:'+'f'.repeat(64)}}))).rejects.toThrow();

   await expect(reads.offlineJourney(other,campaignId)).rejects.toThrow('not found');
  }finally{
   // Append-only evidence and RLS deny-delete tables are left in the
   // disposable CI database. Never erase human decisions as test cleanup.
   await db.$disconnect();
  }
 },120000);
});
