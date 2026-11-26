import {describe,expect,it} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {MarketingPerformanceService} from './marketing-performance.service.js';
import {withMarketingTenant} from './prisma.service.js';

const enabled=process.env.MARKETING_DB_INTEGRATION==='1';
describe.skipIf(!enabled)('PostgreSQL authoritative campaign KPI evidence',()=>{
 it('T13-001 preserves source provenance, reviewer separation and composite campaign tenant isolation',async()=>{
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
   expect(result.sourceRecordReconciliation).toMatchObject({
    status:'NO_COMPLETE_MATCHED_GROUPS',matchedGroups:0,incompleteGroups:3,matchedTotals:null});
   for(const [metricKey,value] of [['impressions',100],['clicks',20],['leads',8],['qualified_leads',4]] as const){
    const added=await metrics.ingest(organizationId,'submitter',{
     campaignId:campaignA.id,sourceSystem:'MANUAL_EXPORT',sourceRecordId:'same-export-record',
     metricKey,value,observedAt,sourceReference:'internal:cohort-evidence'});
    await metrics.review(organizationId,'independent-reviewer',added.observationId,'Reviewed exact same source record');
   }
   const matched=await metrics.summary(organizationId,campaignA.id);
   expect(matched.sourceRecordReconciliation).toMatchObject({
    status:'PARTIAL_SOURCE_MATCH',matchedGroups:1,incompleteGroups:3,
    matchedTotals:{impressions:'100',clicks:'20',leads:'8',qualifiedLeads:'4'},
    rates:{ctrPercent:20,clickToLeadPercent:40,leadQualificationPercent:50},
    attributionValidated:false,spendCurrencyVerified:false,independentVerification:false});
   expect((await metrics.summary(otherOrganization,campaignB.id)).sourceRecordReconciliation)
    .toMatchObject({matchedGroups:0,matchedTotals:null});

   // Currency-labelled spend is never pooled with another currency or unknown legacy spend.
   for(const [sourceRecordId,metricKey,value,currency] of [
    ['mon-egp','spend_micros',1000000,'EGP'],['mon-egp','reported_revenue_micros',5000000,'EGP'],
    ['mon-usd','spend_micros',2000000,'USD'],['mon-usd','reported_revenue_micros',8000000,'USD']
   ] as const){
    const row=await metrics.ingest(organizationId,'submitter',{campaignId:campaignA.id,
     sourceSystem:'MANUAL_EXPORT',sourceRecordId,metricKey,value,currency,observedAt,sourceReference:'internal:monetary-report'});
    await metrics.review(organizationId,'independent-reviewer',row.observationId,'Reviewed exact currency-tagged source');
   }
   const monetary=await metrics.summary(organizationId,campaignA.id);
   expect(monetary.totals.spend_micros).toBeUndefined();
   expect(monetary.evidenceManifest).toMatchObject({status:'BOUNDED_REVIEWED_SOURCE_MANIFEST',rowCount:11,signed:false,externalEffectsAuthorized:false});
   expect(monetary.evidenceManifest.groups.filter(x=>x.monetaryStatus==='EXACT_MONETARY_SOURCE_MATCH')).toHaveLength(2);
   expect((await metrics.summary(organizationId,campaignA.id)).evidenceManifest.sourceDigest).toBe(monetary.evidenceManifest.sourceDigest);
   expect(JSON.stringify(monetary.evidenceManifest)).not.toContain('internal:monetary-report');
   expect((await metrics.summary(otherOrganization,campaignB.id)).evidenceManifest).toMatchObject({rowCount:0,groups:[]});

   expect(monetary.monetaryReconciliation).toMatchObject({status:'EXACT_MONETARY_SOURCE_MATCH',matchedGroups:2,
    currencies:[{currency:'EGP',reportedSpendMicros:'1000000',reportedRevenueMicros:'5000000'},
     {currency:'USD',reportedSpendMicros:'2000000',reportedRevenueMicros:'8000000'}],
    revenueVerified:false,roiValidated:false,fxConversionPerformed:false});
   // Separate money and funnel records cannot fabricate a combined cohort.
   expect(monetary.combinedCommercialReconciliation).toMatchObject({status:'NO_COMPLETE_COMBINED_GROUPS',matchedGroups:0,currencies:[]});
   // Attach the actual funnel rows to the exact same monetary source record, not by campaign alone.
   for(const [metricKey,value] of [['impressions',100],['clicks',20],['leads',8],['qualified_leads',4]] as const){
    const row=await metrics.ingest(organizationId,'submitter',{campaignId:campaignA.id,
     sourceSystem:'MANUAL_EXPORT',sourceRecordId:'mon-egp',metricKey,value,observedAt,sourceReference:'internal:monetary-report'});
    await metrics.review(organizationId,'independent-reviewer',row.observationId,'Reviewed complete same-record funnel evidence');
   }
   const combined=await metrics.summary(organizationId,campaignA.id);
   expect(combined.combinedCommercialReconciliation).toMatchObject({status:'PARTIAL_COMBINED_MATCH',matchedGroups:1,
    sourceDigest:combined.evidenceManifest.sourceDigest,attributionValidated:false,revenueVerified:false,roiValidated:false,
    currencies:[{currency:'EGP',impressions:'100',leads:'8',qualifiedLeads:'4',reportedSpendMicros:'1000000',
     reportedRevenueMicros:'5000000',spendMicrosPerLead:'125000',spendMicrosPerQualifiedLead:'250000',reportedRevenueToSpendRatio:'5.0000'}]});
   expect((await metrics.summary(otherOrganization,campaignB.id)).combinedCommercialReconciliation.currencies).toEqual([]);
   await expect(metrics.ingest(organizationId,'submitter',{campaignId:campaignA.id,sourceSystem:'MANUAL_EXPORT',
    sourceRecordId:'mon-egp',metricKey:'spend_micros',value:1000000,currency:'USD',observedAt,
    sourceReference:'internal:monetary-report'})).rejects.toThrow('conflicting observation');
   await expect(metrics.ingest(organizationId,'submitter',{campaignId:campaignA.id,sourceSystem:'MANUAL_EXPORT',
    sourceRecordId:'missing-currency',metricKey:'reported_revenue_micros',value:1,observedAt,
    sourceReference:'internal:monetary-report'})).rejects.toThrow('currency');
   await expect(metrics.ingest(organizationId,'submitter',{campaignId:campaignA.id,sourceSystem:'MANUAL_EXPORT',
    sourceRecordId:'invalid-count',metricKey:'clicks',value:1,currency:'EGP',observedAt,
    sourceReference:'internal:monetary-report'})).rejects.toThrow('currency');
   expect((await metrics.summary(otherOrganization,campaignB.id)).monetaryReconciliation.currencies).toEqual([]);
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
   await withMarketingTenant(db,organizationId,tx=>
    tx.marketingMetricObservation.deleteMany({where:{organizationId}}));
   await db.campaign.deleteMany({where:{organizationId:{in:[organizationId,otherOrganization]}}});
   await db.marketingObjective.deleteMany({where:{organizationId:{in:[organizationId,otherOrganization]}}});
   await db.organization.deleteMany({where:{id:{in:[organizationId,otherOrganization]}}});
   await db.$disconnect();
  }
 },30000);
});
