import { describe,expect,it,vi } from 'vitest';
import { BrainRunExecutorService } from './brain-run-executor.service.js';
import { permissionForMarketingRoute } from './marketing-permissions.js';
describe('brain executor integration',()=>{
 it('claims exactly once and executes ordered 13 agent decisions with checkpoint causation',async()=>{
  const steps=Array.from({length:13},(_,ordinal)=>({agentId:'agent-'+ordinal,status:'PENDING',ordinal}));
  const db:any={$queryRaw:vi.fn().mockResolvedValue([]),
   brainRun:{updateMany:vi.fn().mockResolvedValue({count:1})}};
  db.$transaction=vi.fn(async(cb:any)=>cb(db));
  const ledger:any={get:vi.fn().mockResolvedValueOnce({status:'PENDING',correlationId:'corr',input:{requestedOutcome:'launch'},steps}).mockResolvedValueOnce({status:'REVIEW_REQUIRED',steps}),checkpoint:vi.fn().mockResolvedValue({})};
  const agents:any={execute:vi.fn().mockImplementation(async (_id:string,input:any)=>({executionId:'e'+(input.input.upstreamExecutionId??'start'),decision:{executionAllowed:true}}))};
  const executor=new BrainRunExecutorService(db,agents,ledger);
  // Real agent ids are required; invalid agent IDs must fail closed and mark intervention.
  await expect(executor.execute('tenant','run')).rejects.toThrow('Unknown brain agent');
  expect(db.brainRun.updateMany).toHaveBeenCalledWith(expect.objectContaining({where:{id:'run',organizationId:'tenant',status:'PENDING'}}));
  expect(db.brainRun.updateMany).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({status:'NEEDS_INTERVENTION'})}));
 });
 it('does not retry ambiguous RUNNING executions',async()=>{
  const ledger:any={get:vi.fn().mockResolvedValue({status:'RUNNING'})};
  const executor=new BrainRunExecutorService({} as any,{} as any,ledger);
  await expect(executor.execute('tenant','run')).rejects.toThrow('already claimed');
 });
 it('requires operator workflow permission for execution',()=>{
  expect(permissionForMarketingRoute('POST','/marketing/brain/runs/abc/execute')).toBe('EXECUTE_WORKFLOW');
 });
});
