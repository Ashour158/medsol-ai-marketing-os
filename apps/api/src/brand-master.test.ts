import {describe,expect,it,vi} from 'vitest';
import {BrandMasterService} from './brand-master.service.js';
import {BrainRunExecutorService} from './brain-run-executor.service.js';
import {permissionForMarketingRoute} from './marketing-permissions.js';

function setup(){
 const tx:any={
  $queryRaw:vi.fn().mockResolvedValue([]),
  brandMasterRevision:{
   findFirst:vi.fn().mockResolvedValue(null),
   create:vi.fn().mockImplementation(async ({data}:any)=>data),
   updateMany:vi.fn().mockResolvedValue({count:1})
  },
  auditEvent:{create:vi.fn().mockResolvedValue({})}
 };
 const db:any={...tx,$transaction:vi.fn(async(callback:any)=>callback(tx))};
 return{tx,db,service:new BrandMasterService(db)};
}
const rules={voice:'Clear scientific communications, no hype',primaryColor:'#125A83',prohibitedClaims:['Guaranteed cure'],requiredDisclaimers:['For research use only where applicable']};
describe('authoritative versioned Brand Master',()=>{
 it('requires independently approved source-backed revision',async()=>{
  const {tx,service}=setup();
  tx.brandMasterRevision.findFirst.mockResolvedValueOnce({version:2});
  const result=await service.propose('tenant','author',{sourceReference:'internal:approved-brand-guidelines-v1',rules});
  expect(result).toMatchObject({version:3,status:'DRAFT',releaseAuthorized:false});
  expect(tx.brandMasterRevision.create).toHaveBeenCalledWith({data:expect.objectContaining({organizationId:'tenant',version:3,status:'DRAFT',proposedBy:'author'})});
  expect(tx.auditEvent.create).toHaveBeenCalledWith({data:expect.objectContaining({action:'BRAND_MASTER_REVISION_PROPOSED'})});
 });
 it('retries aborted serializable Brand Master writes without duplicate audit evidence',async()=>{
  const {tx,db,service}=setup();
  db.$transaction.mockRejectedValueOnce(Object.assign(new Error('serialization conflict'),{code:'P2034'}));
  const result=await service.propose('tenant','author',{
   sourceReference:'internal:approved-brand-guidelines-v1',rules
  });
  expect(result).toMatchObject({version:1,status:'DRAFT'});
  expect(db.$transaction).toHaveBeenCalledTimes(2);
  expect(tx.brandMasterRevision.create).toHaveBeenCalledTimes(1);
  expect(tx.auditEvent.create).toHaveBeenCalledTimes(1);
 });
 it('fails closed after bounded serializable conflict retries, with no ghost audit',async()=>{
  const {tx,db,service}=setup();
  const conflict=Object.assign(new Error('transaction serialization'),{code:'P2034'});
  db.$transaction.mockRejectedValueOnce(conflict).mockRejectedValueOnce(conflict).mockRejectedValueOnce(conflict);
  await expect(service.propose('tenant','author',{
   sourceReference:'internal:approved-brand-guidelines-v1',rules
  })).rejects.toThrow('Concurrent brand revision');
  expect(db.$transaction).toHaveBeenCalledTimes(3);
  expect(tx.auditEvent.create).not.toHaveBeenCalled();
 });
 it('blocks unsupported styling and duplicate terms',async()=>{
  const {service}=setup();
  await expect(service.propose('tenant','author',{sourceReference:'http://insecure',rules})).rejects.toThrow('HTTPS');
  await expect(service.propose('tenant','author',{sourceReference:'internal:source',rules:{...rules,primaryColor:'red'}})).rejects.toThrow('hex');
 });
 it('requires a distinct independent reviewer and records decision',async()=>{
  const {tx,service}=setup();const revision={id:'rev-1',organizationId:'tenant',status:'DRAFT',version:3,proposedBy:'author'};
  tx.brandMasterRevision.findFirst.mockResolvedValueOnce(revision);
  await expect(service.decide('tenant','author','rev-1','APPROVE','Reviewed official branding guidelines')).rejects.toThrow('Independent');
  tx.brandMasterRevision.findFirst.mockResolvedValueOnce(revision).mockResolvedValueOnce({version:2});
  const result=await service.decide('tenant','other-reviewer','rev-1','APPROVE','Reviewed official branding guidelines');
  expect(result.status).toBe('APPROVED');
  expect(result.externalPublishingAuthorized).toBe(false);
  expect(tx.brandMasterRevision.updateMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({organizationId:'tenant',status:'DRAFT'})}));
 });
 it('cannot approve an obsolete revision',async()=>{
  const {tx,service}=setup();
  tx.brandMasterRevision.findFirst.mockResolvedValueOnce({id:'rev-1',organizationId:'tenant',status:'DRAFT',version:3,proposedBy:'author'})
    .mockResolvedValueOnce({version:4});
  await expect(service.decide('tenant','reviewer','rev-1','APPROVE','Reviewed official branding guidelines')).rejects.toThrow('older');
 });
 it('gates brand paths behind management authority',()=>{
  expect(permissionForMarketingRoute('POST','/marketing/brand/decide')).toBe('DECIDE_APPROVAL');
  expect(permissionForMarketingRoute('GET','/marketing/brand/active')).toBe('READ_AUDIT');
 });
});
describe('brain cannot fabricate brand or consent authority',()=>{
 it('overrides supplied brand and consent with approved authority',async()=>{
  const run={status:'PENDING',correlationId:'corr',input:{requestedOutcome:'Launch',brandMasterVersion:'v2',consentReference:'self-asserted'},steps:[{agentId:'MKT-CMO-001',status:'PENDING'}]};
  const db:any={brainRun:{updateMany:vi.fn().mockResolvedValue({count:1})}};
  db.$queryRaw=vi.fn().mockResolvedValue([]);
  db.$transaction=vi.fn(async(fn:any)=>fn(db));
  const agents:any={execute:vi.fn().mockResolvedValue({executionId:'ex',decision:{executionAllowed:true}})};
  const ledger:any={get:vi.fn().mockResolvedValueOnce(run).mockResolvedValueOnce({status:'REVIEW_REQUIRED'}),checkpoint:vi.fn().mockResolvedValue({})};
  const brand:any={active:vi.fn().mockResolvedValue({version:2,rules,sourceReference:'internal:approved',status:'APPROVED'})};
  await new BrainRunExecutorService(db,agents,ledger,undefined,undefined,brand).execute('tenant','run1');
  const input=agents.execute.mock.calls[0][1].input;
  expect(input.brandMasterVersion).toBe('v2');
  expect(input.brandContext.status).toBe('APPROVED');
  expect(input.consentReference).toBeUndefined();
 });
});
