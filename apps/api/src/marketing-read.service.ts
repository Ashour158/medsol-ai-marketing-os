import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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
    const campaign=await tx.campaign.findFirst({where:{
     id:campaignId,organizationId
    },select:{id:true,code:true,name:true,brandId:true,objectiveId:true,
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
       }}),
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
    };
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
   });
  }
  /** Trusted tenant-scoped catalogue lookup used by the Brain; not regulatory verification. */
  async brainAuthorityContext(organizationId: string, input: {productId?:unknown;objectiveId?:unknown}) {
    const productId=input.productId;
    const objectiveId=input.objectiveId;
    if((productId!==undefined&&typeof productId!=='string')||
       (objectiveId!==undefined&&typeof objectiveId!=='string'))throw new BadRequestException('Invalid authority reference');
    const [product,objective]=await Promise.all([
      productId?this.db.marketingProduct.findFirst({
       where:{id:productId,organizationId,lifecycle:'ACTIVE'},
       select:{id:true,code:true,name:true,vendor:true,lifecycle:true}
      }):Promise.resolve(null),
      objectiveId?this.db.marketingObjective.findFirst({
       where:{id:objectiveId,organizationId,status:'ACTIVE'},
       select:{id:true,name:true,description:true,status:true}
      }):Promise.resolve(null)
    ]);
    if(productId&&!product)throw new NotFoundException('Active product not found in tenant catalogue');
    if(objectiveId&&!objective)throw new NotFoundException('Active objective not found in tenant catalogue');
    return {source:'TENANT_MARKETING_CATALOG',product,objective,
      declarationsVerified:true,scientificClaimsVerified:false,regulatoryApprovalVerified:false};
  }
  async overview(organizationId: string) {
    const [campaigns, objectives, products, workflows, pendingApprovals, recentAgents] = await Promise.all([
      this.db.campaign.count({ where: { organizationId } }),
      this.db.marketingObjective.count({ where: { organizationId, status: 'ACTIVE' } }),
      this.db.marketingProduct.count({ where: { organizationId, lifecycle: 'ACTIVE' } }),
      this.db.workflowExecution.count({ where: { organizationId, status: 'RUNNING' } }),
      this.db.approval.count({ where: { organizationId, decision: 'PENDING' } }),
      this.db.agentExecution.count({ where: { organizationId, status: 'FAILED' } })
    ]);
    return { campaigns, activeObjectives: objectives, activeProducts: products, runningWorkflows: workflows, pendingApprovals, failedAgentExecutions: recentAgents };
  }
  campaigns(organizationId: string) {
    return this.db.campaign.findMany({ where: { organizationId }, orderBy: { updatedAt: 'desc' }, take: 100,
      select: { id: true, code: true, name: true, status: true, riskLevel: true, version: true, objectiveId: true, productId: true, brandId: true, updatedAt: true } });
  }
  async campaign(organizationId: string, id: string) {
    const item = await this.db.campaign.findFirst({ where: { organizationId, id },
      include: { objective: { select: { id: true, name: true } }, product: { select: { id: true, name: true, code: true } } } });
    if (!item) throw new NotFoundException('Campaign not found in tenant');
    const [approvals, history] = await Promise.all([
      this.db.approval.findMany({ where: { organizationId, objectType: 'Campaign', objectId: id }, orderBy: { createdAt: 'desc' }, take: 50 }),
      this.db.auditEvent.findMany({ where: { organizationId, objectType: 'Campaign', objectId: id }, orderBy: { occurredAt: 'desc' }, take: 50 })
    ]);
    return { ...item, approvals, history };
  }
  objectives(organizationId: string) {
    return this.db.marketingObjective.findMany({ where: { organizationId }, orderBy: { updatedAt: 'desc' }, take: 100,
      select: { id: true, name: true, description: true, status: true, updatedAt: true } });
  }
  products(organizationId: string) {
    return this.db.marketingProduct.findMany({ where: { organizationId }, orderBy: { updatedAt: 'desc' }, take: 100,
      select: { id: true, code: true, name: true, vendor: true, lifecycle: true } });
  }
  workflows(organizationId: string) {
    return this.db.workflowExecution.findMany({ where: { organizationId }, orderBy: { startedAt: 'desc' }, take: 100,
      select: { id: true, status: true, currentStep: true, correlationId: true, startedAt: true, updatedAt: true } });
  }
  async agentExecution(organizationId: string, id: string) {
    const item = await this.db.agentExecution.findFirst({
      where: { organizationId, id },
      select: { id: true, organizationId: true, agentId: true, correlationId: true, causationId: true, status: true, decision: true, startedAt: true, completedAt: true }
    });
    if (!item) throw new NotFoundException('Agent execution not found in tenant');
    return item;
  }
  async agentOperations(organizationId: string) {
    const [total, grouped, recent] = await Promise.all([
      this.db.agentExecution.count({ where: { organizationId } }),
      this.db.agentExecution.groupBy({ by: ['status'], where: { organizationId }, _count: { _all: true } }),
      this.db.agentExecution.findMany({
        where: { organizationId }, orderBy: { startedAt: 'desc' }, take: 30,
        select: { id: true, agentId: true, status: true, correlationId: true, startedAt: true, completedAt: true }
      })
    ]);
    return { total, byStatus: Object.fromEntries(grouped.map(g => [g.status, g._count._all])), recent };
  }
  agentExecutions(organizationId: string) {
    return this.db.agentExecution.findMany({ where: { organizationId }, orderBy: { startedAt: 'desc' }, take: 100,
      select: { id: true, agentId: true, status: true, correlationId: true, startedAt: true, completedAt: true } });
  }
}
