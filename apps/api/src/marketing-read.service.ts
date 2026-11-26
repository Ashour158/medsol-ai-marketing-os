import type {Prisma} from '@prisma/client';
import type {OfflineCampaignStage} from '@medsol/contracts';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService,withMarketingTenant } from './prisma.service.js';

@Injectable()
export class MarketingReadService {
  constructor(private readonly db: PrismaService) {}
  /**
   * One read-only campaign timeline across existing authoritative owners.
   * No workflow/approval/metric state is invented or mutated here.
   * Information is a bounded tenant-scoped operator projection.
   */
  async offlineJourney(organizationId:string,campaignId:string){
   if(!/^[A-Za-z0-9_-]{1,128}$/.test(campaignId))
    throw new BadRequestException('Invalid journey campaign');
   return withMarketingTenant(this.db,organizationId,async tx=>{
    return readOfflineJourneyInTransaction(tx,organizationId,campaignId);
   });
  }
  /** Trusted tenant-scoped catalogue lookup used by the Brain; not regulatory verification. */
  async brainAuthorityContext(organizationId: string, input: {productId?:unknown;objectiveId?:unknown;campaignId?:unknown}) {
    const valid=(v:unknown)=>v===undefined||(typeof v==='string'&&v.length>0&&v.length<=128&&/^[A-Za-z0-9_-]+$/.test(v));
    if(!valid(input.productId)||!valid(input.objectiveId)||!valid(input.campaignId))
      throw new BadRequestException('Invalid authority reference');
    return withMarketingTenant(this.db,organizationId,async tx=>{
      let productId=input.productId as string|undefined;
      let objectiveId=input.objectiveId as string|undefined;
      const campaign=typeof input.campaignId==='string'?await tx.campaign.findFirst({
        where:{id:input.campaignId,organizationId},
        select:{id:true,brandId:true,objectiveId:true,productId:true}
      }):null;
      if(input.campaignId&&!campaign)throw new NotFoundException('Campaign not found in tenant');
      if(campaign){
        if((objectiveId!==undefined&&objectiveId!==campaign.objectiveId)||
           (productId!==undefined&&productId!==campaign.productId))
          throw new ConflictException('Brain catalogue reference differs from stored campaign scope');
        objectiveId=campaign.objectiveId;
        productId=campaign.productId??undefined;
      }
      const [product,objective]=await Promise.all([
        productId?tx.marketingProduct.findFirst({
          where:{id:productId,organizationId,lifecycle:'ACTIVE'},
          select:{id:true,code:true,name:true,vendor:true,lifecycle:true}
        }):Promise.resolve(null),
        objectiveId?tx.marketingObjective.findFirst({
          where:{id:objectiveId,organizationId,status:'ACTIVE'},
          select:{id:true,name:true,description:true,status:true}
        }):Promise.resolve(null)
      ]);
      if(productId&&!product)throw new NotFoundException('Active product not found in tenant catalogue');
      if(objectiveId&&!objective)throw new NotFoundException('Active objective not found in tenant catalogue');
      return {source:'TENANT_MARKETING_CATALOG',campaign,product,objective,
        declarationsVerified:true,scientificClaimsVerified:false,regulatoryApprovalVerified:false};
    });
  }
  async overview(organizationId: string) {
    const [campaigns, objectives, products, workflows, pendingApprovals, recentAgents] = await withMarketingTenant(this.db,organizationId,async tx=>Promise.all([
      tx.campaign.count({ where: { organizationId } }),
      tx.marketingObjective.count({ where: { organizationId, status: 'ACTIVE' } }),
      tx.marketingProduct.count({ where: { organizationId, lifecycle: 'ACTIVE' } }),
      tx.workflowExecution.count({ where: { organizationId, status: 'RUNNING' } }),
      tx.approval.count({ where: { organizationId, decision: 'PENDING' } }),
      tx.agentExecution.count({ where: { organizationId, status: 'FAILED' } })
    ]));
    return { campaigns, activeObjectives: objectives, activeProducts: products, runningWorkflows: workflows, pendingApprovals, failedAgentExecutions: recentAgents };
  }
  campaigns(organizationId: string) {
    return withMarketingTenant(this.db,organizationId,tx=>tx.campaign.findMany({ where: { organizationId }, orderBy: { updatedAt: 'desc' }, take: 100,
      select: { id: true, code: true, name: true, status: true, riskLevel: true, version: true, objectiveId: true, productId: true, brandId: true, updatedAt: true } }));
  }
  async campaign(organizationId: string, id: string) {
    const item = await withMarketingTenant(this.db,organizationId,tx=>tx.campaign.findFirst({ where: { organizationId, id },
      include: { objective: { select: { id: true, name: true } }, product: { select: { id: true, name: true, code: true } } } }));
    if (!item) throw new NotFoundException('Campaign not found in tenant');
    const [approvals, history] = await withMarketingTenant(this.db,organizationId,async tx=>Promise.all([
      tx.approval.findMany({ where: { organizationId, objectType: 'Campaign', objectId: id }, orderBy: { createdAt: 'desc' }, take: 50 }),
      tx.auditEvent.findMany({ where: { organizationId, objectType: 'Campaign', objectId: id }, orderBy: { occurredAt: 'desc' }, take: 50 })
    ]));
    return { ...item, approvals, history };
  }
  objectives(organizationId: string) {
    return withMarketingTenant(this.db,organizationId,tx=>tx.marketingObjective.findMany({ where: { organizationId }, orderBy: { updatedAt: 'desc' }, take: 100,
      select: { id: true, name: true, description: true, status: true, updatedAt: true } }));
  }
  products(organizationId: string) {
    return withMarketingTenant(this.db,organizationId,tx=>tx.marketingProduct.findMany({ where: { organizationId }, orderBy: { updatedAt: 'desc' }, take: 100,
      select: { id: true, code: true, name: true, vendor: true, lifecycle: true } }));
  }
  workflows(organizationId: string) {
    return withMarketingTenant(this.db,organizationId,tx=>tx.workflowExecution.findMany({ where: { organizationId }, orderBy: { startedAt: 'desc' }, take: 100,
      select: { id: true, status: true, currentStep: true, correlationId: true, startedAt: true, updatedAt: true } }));
  }
  async agentExecution(organizationId: string, id: string) {
    const item = await withMarketingTenant(this.db,organizationId,tx=>tx.agentExecution.findFirst({
      where: { organizationId, id },
      select: { id: true, organizationId: true, agentId: true, correlationId: true, causationId: true, status: true, decision: true, startedAt: true, completedAt: true }
    }));
    if (!item) throw new NotFoundException('Agent execution not found in tenant');
    return item;
  }
  async agentOperations(organizationId: string) {
    const [total, grouped, recent] = await withMarketingTenant(this.db,organizationId,async tx=>Promise.all([
      tx.agentExecution.count({ where: { organizationId } }),
      tx.agentExecution.groupBy({ by: ['status'], where: { organizationId }, _count: { _all: true } }),
      tx.agentExecution.findMany({
        where: { organizationId }, orderBy: { startedAt: 'desc' }, take: 30,
        select: { id: true, agentId: true, status: true, correlationId: true, startedAt: true, completedAt: true }
      })
    ]));
    return { total, byStatus: Object.fromEntries(grouped.map(g => [g.status, g._count._all])), recent };
  }
  agentExecutions(organizationId: string) {
    return withMarketingTenant(this.db,organizationId,tx=>tx.agentExecution.findMany({ where: { organizationId }, orderBy: { startedAt: 'desc' }, take: 100,
      select: { id: true, agentId: true, status: true, correlationId: true, startedAt: true, completedAt: true } }));
  }
}

/** Canonical bounded projection reusable inside a caller's fenced transaction. */
export async function readOfflineJourneyInTransaction(tx:Prisma.TransactionClient,organizationId:string,campaignId:string){
    const campaign=await tx.campaign.findFirst({where:{
     id:campaignId,organizationId
    },select:{id:true,code:true,name:true,brandId:true,objectiveId:true,productId:true,
     status:true,version:true,createdAt:true}});
    if(!campaign||!campaign.brandId)
     throw new NotFoundException('Brand-bound campaign not found in tenant');
    const [campaignApprovals,assets,pubs,emails,brainRuns,metrics,audits,learnings]=
     await Promise.all([
      tx.approval.findMany({where:{organizationId,objectType:'Campaign',
       objectId:campaignId},orderBy:{createdAt:'desc'},take:10,
       select:{id:true,decision:true,decidedBy:true,requestedBy:true,
        workflowExecutionId:true,createdAt:true,decidedAt:true}}),
      tx.creativeAsset.findMany({where:{organizationId,brandId:campaign.brandId},
       orderBy:{createdAt:'desc'},take:30,include:{
        revisions:{orderBy:{version:'desc'},take:5,
         select:{id:true,version:true,sourceKind:true,renditionDigest:true,
          rightsReviewedAt:true,rightsExpiresAt:true,
          approvals:{select:{id:true,decision:true,scopeDigest:true,
           scopeExpiresAt:true}}}}
       }}),
      tx.campaignPublication.findMany({where:{organizationId,campaignId},
       orderBy:{createdAt:'desc'},take:20,select:{
        id:true,approvalId:true,creativeAssetRevisionId:true,status:true,
        version:true,scopeDigest:true,createdAt:true,
        attempts:{take:10,orderBy:{sequence:'asc'},select:{
         id:true,mode:true,outcome:true,createdAt:true}}}
       }),
      tx.marketingEmailSimulation.findMany({where:{organizationId,campaignId},
       orderBy:{createdAt:'desc'},take:20,
       select:{id:true,status:true,contentDigest:true,audienceDigest:true,
        result:true,createdAt:true}}),
      tx.brainRun.findMany({where:{organizationId,
       input:{path:['campaignId'],equals:campaignId}},
       orderBy:{createdAt:'desc'},take:15,
       select:{id:true,status:true,currentAgentId:true,updatedAt:true,
        steps:{select:{agentId:true,stage:true,status:true}}}}),
      tx.marketingMetricObservation.findMany({where:{organizationId,campaignId},
       orderBy:{createdAt:'desc'},take:100,
       select:{id:true,metricKey:true,value:true,status:true,sourceSystem:true,
        sourceReference:true,reviewedAt:true}}),
      tx.auditEvent.findMany({where:{organizationId,
       OR:[{objectType:'Campaign',objectId:campaignId},
        {objectType:'CampaignPublication'},
        {objectType:'MarketingEmailSimulation'}]},
       orderBy:{occurredAt:'desc'},take:100,
       select:{id:true,actorType:true,action:true,objectType:true,
        objectId:true,occurredAt:true}}),
      tx.learningSignal.findMany({where:{organizationId,
       sourceUrl:{contains:campaignId}},
       orderBy:{createdAt:'desc'},take:20,
       select:{id:true,status:true,topic:true,sourceUrl:true,createdAt:true}})
     ]);
    const workflowId=campaignApprovals.find(x=>x.workflowExecutionId)?.workflowExecutionId;
    const workflow=workflowId?await tx.workflowExecution.findFirst({
     where:{organizationId,id:workflowId},
     select:{id:true,status:true,currentStep:true,startedAt:true,
      steps:{select:{stepKey:true,status:true,startedAt:true,completedAt:true}}}
    }):null;
    const relevantAudits=audits.filter(e=>e.objectType==='Campaign'||
     (e.objectType==='CampaignPublication'&&pubs.some(p=>p.id===e.objectId))||
     (e.objectType==='MarketingEmailSimulation'&&emails.some(m=>m.id===e.objectId)));
    const flattenedAssets=assets.flatMap(a=>a.revisions.map(v=>({
     assetId:a.id,brandId:a.brandId,title:a.title,revisionId:v.id,
     version:v.version,current:a.version===v.version,
     sourceKind:v.sourceKind,renditionDigest:v.renditionDigest,
     rightsReviewedAt:v.rightsReviewedAt,rightsExpiresAt:v.rightsExpiresAt,
     approvals:v.approvals
    })));
    // Brand-scoped drafts must not be misrepresented as exclusive campaign
    // property until the exact scope/PublicationIntent binds that revision.
    const linkedRevisions=new Set(pubs.map(p=>p.creativeAssetRevisionId));
    const approvedCampaign=campaign.status==='APPROVED'&&
     campaignApprovals.some(a=>a.decision==='APPROVED');
    const staged={
     briefRecorded:!!workflow,
     agentResearchReviewed:brainRuns.some(b=>b.status==='REVIEW_REQUIRED'),
     campaignIndependentlyApproved:approvedCampaign,
     creativeDraftAvailable:flattenedAssets.length>0,
     creativeRightsReviewed:flattenedAssets.some(v=>!!v.rightsReviewedAt),
     creativeIndependentlyApproved:flattenedAssets.some(v=>
      v.approvals.some(a=>a.decision==='APPROVED')),
     simulatedSocialPublished:pubs.some(p=>p.status==='SIMULATED'&&
      p.attempts.some(a=>a.mode==='SANDBOX')),
     syntheticEmailSimulated:emails.some(m=>m.status==='SIMULATED'),
     performanceReviewed:metrics.some(m=>m.status==='REVIEWED'),
     learningFeedbackQuarantined:learnings.some(l=>l.status==='QUARANTINED')
    } satisfies Record<OfflineCampaignStage,boolean>;
    return {
     campaign,workflow,campaignApprovals,brainRuns,
     creativeAssets:flattenedAssets.map(v=>({...v,
      publicationLinked:linkedRevisions.has(v.revisionId)})),
     publications:pubs,
     emailSimulations:emails.map(m=>({...m,
      // Canonical simulator records contain zero actual messages sent.
      syntheticOnly:true,realProviderDeliveryVerified:false})),
     observations:metrics.map(m=>({...m,value:m.value.toString()})),
     learningSignals:learnings,
     auditHistory:relevantAudits,stages:staged,
     offlineSimulationOnly:true,realProvidersConnectedByJourney:false,
     externalEffectsAuthorized:false,productionCertified:false,
     scopeWarning:'Creative drafts are brand-scoped until bound by exact approved publication intent',
     researchWarning:'Research is offline evidence only; synthetic learning remains quarantined'
    };
}
