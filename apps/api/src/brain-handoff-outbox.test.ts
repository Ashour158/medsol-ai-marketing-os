import {describe,it,expect,vi} from 'vitest';
import {BrainRunLedgerService} from './brain-run-ledger.service.js';
function fixture(last:boolean){
 const steps=last?[
  {id:'s0',agentId:'MKT-CMO-001',stage:'STRATEGY',ordinal:0,status:'COMPLETED'},
  {id:'s1',agentId:'MKT-SCI-001',stage:'GOVERNANCE',ordinal:1,status:'PENDING'}
 ]:[
  {id:'s0',agentId:'MKT-CMO-001',stage:'STRATEGY',ordinal:0,status:'PENDING'},
  {id:'s1',agentId:'MKT-SCI-001',stage:'GOVERNANCE',ordinal:1,status:'PENDING'}
 ];
 const tx:any={
  brainRun:{findFirst:vi.fn().mockResolvedValue({id:'run',organizationId:'tenant',correlationId:'corr',status:'RUNNING',steps}),updateMany:vi.fn().mockResolvedValue({count:1})},
  brainRunStep:{updateMany:vi.fn().mockResolvedValue({count:1})},
  agentExecution:{findFirst:vi.fn().mockResolvedValue({id:'ex',startedAt:new Date()})},
  outboxEvent:{create:vi.fn().mockResolvedValue({})}
 };
 const db:any={$transaction:vi.fn(async(cb:any)=>cb(tx))};
 return{tx,ledger:new BrainRunLedgerService(db)};
}
describe('brain nervous system transactional handoff',()=>{
 it('saves step completion and next handoff in the same DB transaction',async()=>{
  const {tx,ledger}=fixture(false);
  const result=await ledger.checkpoint('tenant','run','MKT-CMO-001','ex');
  expect(result.completed).toBe(false);
  expect(tx.outboxEvent.create).toHaveBeenCalledTimes(1);
  expect(tx.outboxEvent.create).toHaveBeenCalledWith({data:expect.objectContaining({
   organizationId:'tenant',eventType:'BRAIN_AGENT_STEP_COMPLETED',aggregateId:'run',correlationId:'corr',
   payload:expect.objectContaining({nextAgentId:'MKT-SCI-001',externalEffectsAuthorized:false})
  })});
 });
 it('emits a separate final human-review event, not an approved publication',async()=>{
  const {tx,ledger}=fixture(true);
  const result=await ledger.checkpoint('tenant','run','MKT-SCI-001','ex');
  expect(result.completed).toBe(true);
  expect(tx.outboxEvent.create).toHaveBeenCalledTimes(2);
  expect(tx.outboxEvent.create).toHaveBeenCalledWith({data:expect.objectContaining({
   eventType:'BRAIN_RUN_REVIEW_REQUIRED',payload:expect.objectContaining({approved:false,externalEffectsAuthorized:false})
  })});
 });
 it('fails closed before publishing any event when execution proof is missing',async()=>{
  const {tx,ledger}=fixture(false);
  tx.agentExecution.findFirst.mockResolvedValueOnce(null);
  await expect(ledger.checkpoint('tenant','run','MKT-CMO-001','ex')).rejects.toThrow('No completed');
  expect(tx.outboxEvent.create).not.toHaveBeenCalled();
 });
});
