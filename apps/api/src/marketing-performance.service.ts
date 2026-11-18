import {BadRequestException,ConflictException,ForbiddenException,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {PrismaService} from './prisma.service.js';

const METRICS=new Set(['impressions','clicks','engagements','leads','qualified_leads','spend_micros']);
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
   value?:unknown;observedAt?:unknown;sourceReference?:unknown
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
  const value=BigInt(raw.value);
  const observedAt=new Date(required(raw.observedAt,'observedAt',40));
  if(!Number.isFinite(observedAt.getTime())||observedAt.getTime()>Date.now()+3600000||
     observedAt.getTime()<Date.now()-3*365*86400000)throw new BadRequestException('Observed date outside allowed range');
  const campaign=await this.db.campaign.findFirst({where:{id:campaignId,organizationId},select:{id:true}});
  if(!campaign)throw new NotFoundException('Campaign not found in tenant');
  const where={organizationId_sourceSystem_sourceRecordId_metricKey:{organizationId,sourceSystem,sourceRecordId,metricKey}};
  const existing=await this.db.marketingMetricObservation.findUnique({where});
  if(existing){
   if(existing.campaignId!==campaignId||existing.value!==value||existing.sourceReference!==sourceReference||
      existing.observedAt.getTime()!==observedAt.getTime())throw new ConflictException('Source record reused with conflicting observation');
   return{observationId:existing.id,status:existing.status,replayed:true};
  }
  try{
   const created=await this.db.marketingMetricObservation.create({data:{
    id:randomUUID(),organizationId,campaignId,sourceSystem,sourceRecordId,metricKey,value,
    observedAt,sourceReference,submittedBy:actorId,status:'QUARANTINED'
   }});
   return{observationId:created.id,status:'QUARANTINED',replayed:false};
  }catch(error){
   if((error as {code?:string})?.code==='P2002')throw new ConflictException('Concurrent duplicate metric import; refresh evidence');
   throw error;
  }
 }
 list(organizationId:string,campaignId?:string){
  return this.db.marketingMetricObservation.findMany({
   where:{organizationId,...(campaignId?{campaignId}:{})},orderBy:{createdAt:'desc'},take:100,
   select:{id:true,campaignId:true,metricKey:true,value:true,status:true,sourceSystem:true,
    sourceRecordId:true,sourceReference:true,observedAt:true,submittedBy:true,reviewedBy:true,reviewedAt:true}
  }).then(records=>records.map(r=>({...r,value:r.value.toString()})));
 }
 async review(organizationId:string,actorId:string,observationId:string,rationale:string){
  const reason=required(rationale,'review rationale',2000);
  if(reason.length<12)throw new BadRequestException('Detailed review rationale required');
  return this.db.$transaction(async tx=>{
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
    after:{status:'REVIEWED',sourceReference:observed.sourceReference,rationale:reason,
      independentlyVerified:false}}});
   return{observationId,status:'REVIEWED',independentlyVerified:false,externalEffectsAuthorized:false};
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
 }
 async summary(organizationId:string,campaignId:string){
  const campaign=await this.db.campaign.findFirst({
   where:{id:campaignId,organizationId},select:{id:true,code:true,name:true}});
  if(!campaign)throw new NotFoundException('Campaign not found in tenant');
  const [rows,pending]=await Promise.all([
   this.db.marketingMetricObservation.groupBy({by:['metricKey'],where:{organizationId,campaignId,status:'REVIEWED'},
    _sum:{value:true},_count:{_all:true}}),
   this.db.marketingMetricObservation.count({where:{organizationId,campaignId,status:'QUARANTINED'}})
  ]);
  const totals:Record<string,string>={};const observations:Record<string,number>={};
  for(const row of rows){totals[row.metricKey]=(row._sum.value??0n).toString();observations[row.metricKey]=row._count._all;}
  const toBig=(key:string):bigint|null=>key in totals?BigInt(totals[key]!):null;
  const rate=(a:bigint|null,b:bigint|null):number|null=>a!==null&&b!==null&&b>0n?
    Number(a*10000n/b)/100:null;
  const impressions=toBig('impressions'),clicks=toBig('clicks'),leads=toBig('leads'),
    spend=toBig('spend_micros');
  return{organizationId,campaign,totals,observationCounts:observations,
   derived:{ctrPercent:rate(clicks,impressions),clickToLeadPercent:rate(leads,clicks),
     spendMicrosPerLead:spend!==null&&leads!==null&&leads>0n?(spend/leads).toString():null},
   pendingReviewCount:pending,status:rows.length?'REVIEWED_SOURCE_EVIDENCE':'INSUFFICIENT_REVIEWED_DATA',
   independentlyVerified:false,attributionValidated:false,spendUnit:'micro currency units'};
 }
}
