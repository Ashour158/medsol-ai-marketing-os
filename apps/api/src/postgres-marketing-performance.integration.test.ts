import {describe,expect,it} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {MarketingPerformanceService} from './marketing-performance.service.js';

const enabled=process.env.MARKETING_DB_INTEGRATION==='1';
describe.skipIf(!enabled)('PostgreSQL authoritative campaign KPI evidence',()=>{
 it('preserves source provenance, reviewer separation and composite campaign tenant isolation',async()=>{
  const db=new PrismaClient();
  const organizationId='metric-a-'+randomUUID(),otherOrganization='metric-b-'+randomUUID();
  try{
   await db.$connect();
   await db.organization.createMany({data:[
    {id:organizationId,name:'Metrics A'},{id:otherOrganization,name:'Metrics B'}]});
   const objectiveA=await db.marketingObjective.create({data:{organizationId,name:'Awareness A',description:'Market evidence test'}});
   const objectiveB=await db.marketingObjective.create({data:{organizationId:otherOrganization,name:'Awareness B',description:'Other tenant'}});
   const campaignA=await db.campaign.create({data:{organizationId,objectiveId:objectiveA.id,code:'PERF_A',name:'Genomics A'}});
   const campaignB=await db.campaign.create({data:{organizationId:otherOrganization,objectiveId:objectiveB.id,code:'PERF_B',name:'Genomics B'}});
   const metrics=new MarketingPerformanceService(db as any);
   const observedAt=new Date(Date.now()-120000).toISOString();
   for(const [metricKey,value] of [['impressions',1000],['clicks',50],['leads',5]] as const){
    const added=await metrics.ingest(organizationId,'submitter',{
     campaignId:campaignA.id,sourceSystem:'MANUAL_EXPORT',sourceRecordId:'source-'+metricKey,
     metricKey,value,observedAt,sourceReference:'internal:reviewed-channel-export'});
    expect(added.status).toBe('QUARANTINED');
    await expect(metrics.review(organizationId,'submitter',added.observationId,'Verified against source file')).rejects.toThrow('Independent');
    await metrics.review(organizationId,'independent-reviewer',added.observationId,'Reviewed against approved channel export');
   }
   const result=await metrics.summary(organizationId,campaignA.id);
   expect(result.derived.ctrPercent).toBe(5);
   expect(result.derived.clickToLeadPercent).toBe(10);
   expect(result.attributionValidated).toBe(false);
   expect((await metrics.summary(otherOrganization,campaignB.id)).totals).toEqual({});
   await expect(metrics.summary(otherOrganization,campaignA.id)).rejects.toThrow('not found in tenant');
   // A direct write cannot bypass the tenant composite FK on Campaign.
   await expect(db.marketingMetricObservation.create({data:{
    organizationId:otherOrganization,campaignId:campaignA.id,sourceSystem:'MANUAL_EXPORT',
    sourceRecordId:'forged-record',metricKey:'clicks',value:3n,
    sourceReference:'internal:forged',observedAt:new Date(),submittedBy:'attacker'
   }})).rejects.toThrow();
  }finally{
   await db.auditEvent.deleteMany({where:{organizationId:{in:[organizationId,otherOrganization]}}});
   await db.marketingMetricObservation.deleteMany({where:{organizationId:{in:[organizationId,otherOrganization]}}});
   await db.campaign.deleteMany({where:{organizationId:{in:[organizationId,otherOrganization]}}});
   await db.marketingObjective.deleteMany({where:{organizationId:{in:[organizationId,otherOrganization]}}});
   await db.organization.deleteMany({where:{id:{in:[organizationId,otherOrganization]}}});
   await db.$disconnect();
  }
 },30000);
});
