import {describe,expect,it,vi} from 'vitest';
import {MarketingPerformanceService} from './marketing-performance.service.js';
import {permissionForMarketingRoute} from './marketing-permissions.js';
const now=new Date(Date.now()-60000).toISOString();
const input={campaignId:'campaign-1',sourceSystem:'MANUAL_EXPORT',sourceRecordId:'audit-123',
 metricKey:'clicks',value:50,observedAt:now,sourceReference:'internal:monthly-approved-dashboard-export'};
function setup(){
 const db:any={
  campaign:{findFirst:vi.fn().mockResolvedValue({id:'campaign-1',code:'CMP',name:'Market awareness'})},
  marketingMetricObservation:{
   findUnique:vi.fn().mockResolvedValue(null),
   findFirst:vi.fn().mockResolvedValue({id:'obs',status:'QUARANTINED',submittedBy:'submitter',sourceReference:input.sourceReference}),
   create:vi.fn().mockImplementation(async({data}:any)=>data),
   updateMany:vi.fn().mockResolvedValue({count:1}),
   findMany:vi.fn().mockResolvedValue([]),
   groupBy:vi.fn().mockResolvedValue([
    {metricKey:'impressions',_sum:{value:1000n},_count:{_all:1}},
    {metricKey:'clicks',_sum:{value:50n},_count:{_all:1}},
    {metricKey:'leads',_sum:{value:5n},_count:{_all:1}},
    {metricKey:'spend_micros',_sum:{value:60000000n},_count:{_all:1}}
   ]),count:vi.fn().mockResolvedValue(2)
  },
  auditEvent:{create:vi.fn().mockResolvedValue({})}
 };
 db.$transaction=vi.fn(async(cb:any)=>cb(db));
 return{db,service:new MarketingPerformanceService(db)};
}
describe('governed marketing performance evidence',()=>{
 it('quarantines observations, deduplicates by tenant/source identity and cannot invent marketing metrics',async()=>{
  const{db,service}=setup();
  const created=await service.ingest('tenant','submitter',input);
  expect(created).toMatchObject({status:'QUARANTINED',replayed:false});
  expect(db.campaign.findFirst).toHaveBeenCalledWith({where:{id:'campaign-1',organizationId:'tenant'},select:{id:true}});
  expect(db.marketingMetricObservation.create).toHaveBeenCalledWith({data:expect.objectContaining({
   organizationId:'tenant',metricKey:'clicks',value:50n,status:'QUARANTINED'})});
  db.marketingMetricObservation.findUnique.mockResolvedValueOnce({...created,
   id:created.observationId,campaignId:'campaign-1',value:50n,sourceReference:input.sourceReference,observedAt:new Date(now),status:'QUARANTINED'});
  await expect(service.ingest('tenant','submitter',input)).resolves.toMatchObject({replayed:true});
  await expect(service.ingest('tenant','submitter',{...input,value:-1})).rejects.toThrow('nonnegative');
 });
 it('requires independent human source review',async()=>{
  const{db,service}=setup();
  await expect(service.review('tenant','submitter','obs','Verified source numbers')).rejects.toThrow('Independent');
  const result=await service.review('tenant','reviewer','obs','Reviewed against source export');
  expect(result).toMatchObject({status:'REVIEWED',independentlyVerified:false});
  expect(db.marketingMetricObservation.updateMany).toHaveBeenCalledWith(expect.objectContaining({
   where:{organizationId:'tenant',status:'QUARANTINED'}}));
 });
 it('calculates ratios only from reviewed evidence with explicit numerator and denominator',async()=>{
  const{db,service}=setup();
  const result=await service.summary('tenant','campaign-1');
  expect(db.marketingMetricObservation.groupBy).toHaveBeenCalledWith(expect.objectContaining({
   where:{organizationId:'tenant',campaignId:'campaign-1',status:'REVIEWED'}}));
  expect(result.totals.clicks).toBe('50');
  expect(result.derived.ctrPercent).toBe(5);
  expect(result.derived.clickToLeadPercent).toBe(10);
  expect(result.derived.spendMicrosPerLead).toBe('12000000');
  expect(result.attributionValidated).toBe(false);
  expect(result.pendingReviewCount).toBe(2);
 });
 it('denies cross-tenant campaign evidence and requires approver privileges',async()=>{
  const{db,service}=setup();db.campaign.findFirst.mockResolvedValueOnce(null);
  await expect(service.ingest('other','submitter',input)).rejects.toThrow('not found in tenant');
  expect(permissionForMarketingRoute('POST','/marketing/performance/review')).toBe('DECIDE_APPROVAL');
  expect(permissionForMarketingRoute('POST','/marketing/performance/ingest')).toBe('SUBMIT_EVIDENCE');
  expect(permissionForMarketingRoute('GET','/marketing/performance/campaigns/campaign-1')).toBe('READ_AUDIT');
 });
});
