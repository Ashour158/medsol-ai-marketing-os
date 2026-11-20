import { describe, expect, it, vi } from 'vitest';
import { MarketingReadService } from './marketing-read.service.js';
import { BrainRunExecutorService } from './brain-run-executor.service.js';

describe('authoritative catalogue data for the marketing Brain',()=>{
 it('reads only active product/objective records owned by the authenticated tenant',async()=>{
  const db:any={
    marketingProduct:{findFirst:vi.fn().mockResolvedValue({id:'p1',code:'SEQ-001',name:'Research platform',vendor:'Vendor',lifecycle:'ACTIVE'})},
    marketingObjective:{findFirst:vi.fn().mockResolvedValue({id:'o1',name:'Expand awareness',description:'Plan',status:'ACTIVE'})}
  };
  db.$queryRaw=vi.fn().mockResolvedValue([]);
  db.$transaction=vi.fn(async(fn:any)=>fn(db));
  const read=new MarketingReadService(db);
  const context=await read.brainAuthorityContext('tenant-a',{productId:'p1',objectiveId:'o1'});
  expect(context.product?.code).toBe('SEQ-001');
  expect(context.regulatoryApprovalVerified).toBe(false);
  expect(context.scientificClaimsVerified).toBe(false);
  expect(db.marketingProduct.findFirst).toHaveBeenCalledWith(expect.objectContaining({
   where:{id:'p1',organizationId:'tenant-a',lifecycle:'ACTIVE'}}));
  expect(db.marketingObjective.findFirst).toHaveBeenCalledWith(expect.objectContaining({
   where:{id:'o1',organizationId:'tenant-a',status:'ACTIVE'}}));
 });
 it('fails closed when product does not belong to the tenant',async()=>{
  const db:any={marketingProduct:{findFirst:vi.fn().mockResolvedValue(null)}};
  db.$queryRaw=vi.fn().mockResolvedValue([]);
  db.$transaction=vi.fn(async(fn:any)=>fn(db));
  const read=new MarketingReadService(db);
  await expect(read.brainAuthorityContext('other',{productId:'p1'})).rejects.toThrow('not found in tenant');
 });
 it('uses authoritative data in agent handoff without pretending literature is verified',async()=>{
  const run:any={status:'PENDING',organizationId:'tenant-a',correlationId:'corr',input:{requestedOutcome:'Launch',productId:'p1'},steps:[{agentId:'MKT-CMO-001',status:'PENDING'}]};
  const db:any={brainRun:{updateMany:vi.fn().mockResolvedValue({count:1})}};
  db.$queryRaw=vi.fn().mockResolvedValue([]);
  db.$transaction=vi.fn(async(fn:any)=>fn(db));
  const agents:any={execute:vi.fn().mockResolvedValue({executionId:'agent-ex',decision:{executionAllowed:true}})};
  const ledger:any={get:vi.fn().mockResolvedValueOnce(run).mockResolvedValueOnce({status:'REVIEW_REQUIRED'}),checkpoint:vi.fn().mockResolvedValue({completed:true})};
  const learning:any={
   trendBrief:vi.fn().mockResolvedValue({topics:[{topic:'Proteomics',sector:'proteomics',status:'HUMAN_REVIEWED_NOT_INDEPENDENTLY_VERIFIED',
    evidence:[{signalId:'s1',url:'https://europepmc.org/article/MED/123'}]}]}),
   contextForAgent:vi.fn().mockResolvedValue({results:[{citationRef:'kb:curated:0:123abc',
    snippet:'Review-required research excerpt',independentlyVerified:false,
    untrustedSourceText:true}],reviewedOnly:true,independentlyVerified:false,
    externalEffectsAuthorized:false})
  };
  const context={source:'TENANT_MARKETING_CATALOG',product:{id:'p1',code:'SEQ-001',name:'Platform'},objective:null,
   declarationsVerified:true,scientificClaimsVerified:false,regulatoryApprovalVerified:false};
  const read:any={brainAuthorityContext:vi.fn().mockResolvedValue(context)};
  const executor=new BrainRunExecutorService(db,agents,ledger,learning,read);
  await executor.execute('tenant-a','run1');
  expect(read.brainAuthorityContext).toHaveBeenCalledWith('tenant-a',run.input);
  const payload=agents.execute.mock.calls[0]![1].input;
  expect(payload.authorityContext.product.code).toBe('SEQ-001');
  expect(payload.trendContext.verified).toBe(false);
  expect(learning.contextForAgent).toHaveBeenCalledWith('tenant-a','MKT-CMO-001','Launch');
  expect(payload.knowledgeContext.untrustedDataNotInstructions).toBe(true);
  expect(payload.knowledgeContext.results[0].citationRef).toMatch(/^kb:/);
 });
});
