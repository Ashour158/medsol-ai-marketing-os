import {describe,expect,it,vi} from 'vitest';
import {ModelReconciliationService} from './model-reconciliation.service.js';
import {ModelBudgetService} from './model-budget.service.js';
const evidence={organizationId:'tenant',usageId:'usage',providerRequestId:'provider-id',evidenceReference:'invoice-2026-11',
 actualCostMicros:900,model:'approved-model',inputTokens:50,outputTokens:25};
function fixture(){
 const db:any={$queryRaw:vi.fn().mockResolvedValue([]),modelUsage:{
   findFirst:vi.fn().mockResolvedValue({id:'usage',organizationId:'tenant',requestId:'req',
     status:'SETTLED',billingStatus:'ESTIMATED',actualMicros:800n,reservedMicros:1000n,model:'approved-model'}),
   updateMany:vi.fn().mockResolvedValue({count:1}),
   count:vi.fn().mockResolvedValue(1),
   aggregate:vi.fn().mockResolvedValue({_sum:{verifiedBilledMicros:900n},_count:{_all:1}})
  },modelBudget:{findUnique:vi.fn().mockResolvedValue({limitMicros:10000n,spentMicros:800n,reservedMicros:0n})},
  auditEvent:{create:vi.fn().mockResolvedValue({})}};
 db.$transaction=vi.fn(async(f:any)=>f(db));
 return{db,service:new ModelReconciliationService(db)};
}
describe('verified billing versus policy estimates',()=>{
 it('records invoice amount separately without silently editing policy budget',async()=>{
  const {db,service}=fixture();
  const result=await service.verifySettledInvoice(evidence);
  expect(result).toMatchObject({billingStatus:'VERIFIED',verifiedBilledMicros:'900',estimatedMicros:'800',financeReviewRequired:true});
  expect(db.modelUsage.updateMany).toHaveBeenCalledWith(expect.objectContaining({
   data:expect.objectContaining({verifiedBilledMicros:900n,billedEvidenceReference:'invoice-2026-11',billingStatus:'VERIFIED'})}));
  expect(db.modelBudget.findUnique).not.toHaveBeenCalled();
  expect(db.auditEvent.create).toHaveBeenCalledTimes(1);
 });
 it('refuses a conflicting invoice after verification',async()=>{
  const {db,service}=fixture();
  db.modelUsage.findFirst.mockResolvedValue({id:'usage',organizationId:'tenant',status:'SETTLED',
   billingStatus:'VERIFIED',billedEvidenceReference:'invoice-previous',verifiedBilledMicros:700n,providerRequestId:'provider-id'});
  await expect(service.verifySettledInvoice(evidence)).rejects.toThrow('Conflicting invoice');
  expect(db.modelUsage.updateMany).not.toHaveBeenCalled();
 });
 it('reports estimated spend and verified billed spend separately',async()=>{
  const {db}=fixture();
  const service=new ModelBudgetService(db);
  const summary=await service.summary('tenant');
  expect(summary).toMatchObject({enabled:true,estimatedSpentMicros:'800',verifiedBilledMicros:'900',
   awaitingInvoiceCount:1,accountingStatus:'ESTIMATES_NOT_INVOICES'});
  expect(db.modelUsage.aggregate).toHaveBeenCalledWith({where:{organizationId:'tenant',billingStatus:'VERIFIED'},_sum:{verifiedBilledMicros:true},_count:{_all:true}});
 });
});
