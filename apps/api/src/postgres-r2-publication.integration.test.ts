import {describe,expect,it} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {CampaignService} from './campaign.service.js';
import {CreativeAssetService} from './creative-asset.service.js';
import {ApprovalService} from './approval.service.js';
import {CampaignPublicationService} from './campaign-publication.service.js';
import {OutboxService} from './outbox.service.js';
import {MarketingPerformanceService} from './marketing-performance.service.js';
import {permissionForMarketingRoute,hasMarketingPermission} from './marketing-permissions.js';

const enabled=process.env.MARKETING_DB_INTEGRATION==='1';
const later=(days:number)=>new Date(Date.now()+days*86400_000).toISOString();
const digest='sha256:'+'c'.repeat(64);
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
   await creatives.reviewRights(org,reviewer,version.revisionId,
    'Reviewed authorized licensing for internal test');
   const preparedCreative=await creatives.submitForApproval(org,creator,version.revisionId,{
    channel:'SOCIAL',destinationRef:'internal:connected-destination/staging-demo',
    audienceRef:'internal:audience-snapshot/staging-demo',policyVersion:'v1',
    scheduledAt:later(10),expiresAt:later(8)
   });
   await approvals.approve({organizationId:org,commandId:randomUUID(),
    correlationId:randomUUID(),approvalId:preparedCreative.approvalId,
    approverUserId:reviewer,decision:'APPROVED',rationale:'Exact asset and audience scope checked'});
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
   const gate=await publications.preflight(org,intent.publicationId);
   expect(gate).toMatchObject({internalReady:true,externalReady:false,
    externalEffectsAuthorized:false,independentlyVerified:false});
   expect(gate.limitations).toContain('provider_account_credentials_and_scopes_unconnected');
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
  expect(permissionForMarketingRoute('POST','/marketing/publications/abc/simulate'))
   .toBe('EXECUTE_WORKFLOW');
  expect(permissionForMarketingRoute('GET','/marketing/publications/abc/performance')).toBe('READ_AUDIT');
  expect(hasMarketingPermission({role:'VIEWER'} as any,'MANAGE_CAMPAIGN')).toBe(false);
  expect(hasMarketingPermission({role:'MARKETING_SPECIALIST'} as any,'EXECUTE_WORKFLOW')).toBe(true);
  expect(()=>permissionForMarketingRoute('DELETE','/marketing/publications/abc'))
   .toThrow('not in the permission registry');
 });
});
