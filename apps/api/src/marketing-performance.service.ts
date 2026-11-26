import {BadRequestException,ConflictException,ForbiddenException,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {PrismaService,withMarketingTenant} from './prisma.service.js';
import {summarizeReviewedCommercialMetrics,reconcileReviewedFunnelCohorts,reconcileReviewedMonetaryCohorts,monetaryKeys,COHORT_ROW_LIMIT} from './commercial-metric-calculation.js';

const METRICS=new Set(['impressions','clicks','engagements','leads','qualified_leads',...monetaryKeys]);
const SOURCE_SYSTEMS=new Set(['MANUAL_EXPORT','APPROVED_CONNECTOR_EXPORT']);
function required(value:unknown,name:string,max=500):string{
 if(typeof value!=='string'||!value.trim()||value.trim().length>max)throw new BadRequestException('Invalid '+name);
 return value.trim();
}
@Injectable()
export class MarketingPerformanceService{
 constructor(private readonly db:PrismaService){}
 async ingest(organizationId:string,actorId:string,raw:{
   campaignId?:unknown;sourceSystem?:unknown;sourceRecordId?:unknown;metricKey?:unknown;
   value?:unknown;observedAt?:unknown;sourceReference?:unknown;currency?:unknown
 }){
  const campaignId=required(raw?.campaignId,'campaignId',200);
  const sourceSystem=required(raw?.sourceSystem,'sourceSystem',80);
  const sourceRecordId=required(raw?.sourceRecordId,'sourceRecordId',200);
  const metricKey=required(raw?.metricKey,'metricKey',80);
  const sourceReference=required(raw?.sourceReference,'sourceReference',1000);
  if(!SOURCE_SYSTEMS.has(sourceSystem)||!METRICS.has(metricKey))throw new BadRequestException('Unsupported metric source or key');
  if(!/^[-A-Za-z0-9_:.]{1,200}$/.test(sourceRecordId))throw new BadRequestException('Invalid source event key');
  if(!sourceReference.startsWith('https://')&&!sourceReference.startsWith('internal:'))
    throw new BadRequestException('Provide an HTTPS or internal evidence reference');
  if(typeof raw.value!=='number'||!Number.isSafeInteger(raw.value)||raw.value<0||raw.value>1_000_000_000_000)
    throw new BadRequestException('Only bounded nonnegative integer observations are accepted');
  const money=monetaryKeys.some(k=>k===metricKey);
  const currency=raw.currency===undefined||raw.currency===null?null:raw.currency;
  if((currency!==null&&(typeof currency!=='string'||! /^[A-Z]{3}$/.test(currency)))||
     (!money&&currency!==null)||(money&&metricKey!=='spend_micros'&&currency===null))
   throw new BadRequestException('Explicit three-letter currency required for reported monetary evidence; forbidden on count metrics');
  const value=BigInt(raw.value);
  const observedAt=new Date(required(raw.observedAt,'observedAt',40));
  if(!Number.isFinite(observedAt.getTime())||observedAt.getTime()>Date.now()+3600000||
     observedAt.getTime()<Date.now()-3*365*86400000)throw new BadRequestException('Observed date outside allowed range');
  // Retry only a rolled-back serializable DB transaction; no external effect.
  // Every retry rechecks the full immutable source tuple and tenant scope.
  for(let attempt=0;attempt<3;attempt++)try{
   return await withMarketingTenant(this.db,organizationId,async tx=>{
    const campaign=await tx.campaign.findFirst({
     where:{id:campaignId,organizationId},select:{id:true}
    });
    if(!campaign)throw new NotFoundException('Campaign not found in tenant');
    const where={organizationId_sourceSystem_sourceRecordId_metricKey:{
     organizationId,sourceSystem,sourceRecordId,metricKey
    }};
    const existing=await tx.marketingMetricObservation.findUnique({where});
    if(existing){
     if(existing.campaignId!==campaignId||existing.value!==value||(existing.currency??null)!==currency||
        existing.sourceReference!==sourceReference||
        existing.observedAt.getTime()!==observedAt.getTime())
      throw new ConflictException('Source record reused with conflicting observation');
     return {observationId:existing.id,status:existing.status,replayed:true};
    }
    const created=await tx.marketingMetricObservation.create({data:{
     id:randomUUID(),organizationId,campaignId,sourceSystem,sourceRecordId,
     metricKey,value,currency,observedAt,sourceReference,submittedBy:actorId,status:'QUARANTINED'
    }});
    return {observationId:created.id,status:'QUARANTINED',replayed:false};
   },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  }catch(error){
   const code=(error as {code?:string})?.code;
   if(code==='P2034'&&attempt<2)continue;
   if(code==='P2002'||code==='P2034')
    throw new ConflictException('Concurrent duplicate metric import; refresh evidence');
   throw error;
  }
  throw new ConflictException('Concurrent metric import; retry limit reached');
 }
 list(organizationId:string,campaignId?:string){
  return withMarketingTenant(this.db,organizationId,async tx=>{
   const records=await tx.marketingMetricObservation.findMany({
    where:{organizationId,...(campaignId?{campaignId}:{})},
    orderBy:{createdAt:'desc'},take:100,
    select:{id:true,campaignId:true,metricKey:true,value:true,currency:true,status:true,sourceSystem:true,
     sourceRecordId:true,sourceReference:true,observedAt:true,submittedBy:true,reviewedBy:true,
     reviewedAt:true}
   });
   return records.map(row=>({...row,value:row.value.toString()}));
  });
 }
 async review(organizationId:string,actorId:string,observationId:string,rationale:string){
  const reason=required(rationale,'review rationale',2000);
  if(reason.length<12)throw new BadRequestException('Detailed review rationale required');
  return withMarketingTenant(this.db,organizationId,async tx=>{
   const observed=await tx.marketingMetricObservation.findFirst({where:{id:observationId,organizationId}});
   if(!observed)throw new NotFoundException('Metric observation not found in tenant');
   if(observed.status!=='QUARANTINED')throw new ConflictException('Observation already reviewed');
   if(observed.submittedBy===actorId)throw new ForbiddenException('Independent performance reviewer required');
   const changed=await tx.marketingMetricObservation.updateMany({
    where:{id:observationId,organizationId,status:'QUARANTINED'},
    data:{status:'REVIEWED',reviewedBy:actorId,reviewedAt:new Date()}
   });
   if(changed.count!==1)throw new ConflictException('Concurrent review');
   await tx.auditEvent.create({data:{organizationId,actorType:'HUMAN',actorId,
    action:'MARKETING_METRIC_REVIEWED',objectType:'MarketingMetricObservation',
    objectId:observationId,correlationId:observationId,
    after:{status:'REVIEWED',sourceReference:observed.sourceReference,currency:observed.currency??null,rationale:reason,
      independentlyVerified:false}}});
   return{observationId,status:'REVIEWED',independentlyVerified:false,externalEffectsAuthorized:false};
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
 }
 async summary(organizationId:string,campaignId:string){
  return withMarketingTenant(this.db,organizationId,async tx=>{
  const campaign=await tx.campaign.findFirst({
   where:{id:campaignId,organizationId},select:{id:true,code:true,name:true}});
  if(!campaign)throw new NotFoundException('Campaign not found in tenant');
  const [rows,pending,cohortRows]=await Promise.all([
   tx.marketingMetricObservation.groupBy({by:['metricKey'],where:{organizationId,campaignId,status:'REVIEWED'},
    _sum:{value:true},_count:{_all:true}}),
   tx.marketingMetricObservation.count({where:{organizationId,campaignId,status:'QUARANTINED'}}),
   tx.marketingMetricObservation.findMany({where:{organizationId,campaignId,status:'REVIEWED'},
    take:COHORT_ROW_LIMIT+1,orderBy:{id:'asc'},select:{sourceSystem:true,sourceRecordId:true,
     sourceReference:true,observedAt:true,metricKey:true,value:true,currency:true}})
  ]);
  // Keep legacy unknown-unit spend descriptive only. Never expose a mixed or
  // explicit-currency total as the old unspecified-unit aggregate.
  const hideLegacySpend=cohortRows.length>COHORT_ROW_LIMIT||cohortRows.some(r=>r.metricKey==='spend_micros'&&r.currency!==null);
  const metrics=summarizeReviewedCommercialMetrics(rows.filter(r=>!r.metricKey.startsWith('reported_')&&
   !(hideLegacySpend&&r.metricKey==='spend_micros')),pending);
  if(hideLegacySpend&&rows.some(r=>r.metricKey==='spend_micros'))
   metrics.warnings.push('CURRENCY_SPEND_REPORTED_SEPARATELY');
  const monetaryReconciliation=reconcileReviewedMonetaryCohorts(cohortRows);
  return{organizationId,campaign,...metrics,sourceRecordReconciliation:reconcileReviewedFunnelCohorts(cohortRows),
   monetaryReconciliation,
   independentlyVerified:false,spendUnit:'micro currency units'};
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
 }
}
