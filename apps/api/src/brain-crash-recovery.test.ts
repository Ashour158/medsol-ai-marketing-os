import {describe,expect,it,vi} from 'vitest';
import {BrainRunLedgerService} from './brain-run-ledger.service.js';
import {BrainRunExecutorService} from './brain-run-executor.service.js';
import {hasMarketingPermission,permissionForMarketingRoute} from './marketing-permissions.js';

function runFixture(stepOrdinal=0){
 const updatedAt=new Date(Date.now()-31*60_000);
 const first={id:'step-0',runId:'run-1',agentId:'MKT-CMO-001',ordinal:0,stage:'STRATEGY',
  status:stepOrdinal===0?'PENDING':'COMPLETED',executionId:stepOrdinal===0?null:'prev-completed'};
 const second={id:'step-1',runId:'run-1',agentId:'MKT-STR-001',ordinal:1,stage:'STRATEGY',status:'PENDING',executionId:null};
 return {id:'run-1',organizationId:'tenant-a',status:'RUNNING',updatedAt,correlationId:'corr-1',
  steps:stepOrdinal===0?[first,second]:[first,second]};
}
function readFixture(options?:{attempts?:Array<{id:string;status:string;causationId:string|null}>;status?:string;stepOrdinal?:number}){
 const run=runFixture(options?.stepOrdinal??0);run.status=options?.status??'RUNNING';
 const attempts=(options?.attempts??[]).map(a=>({...a,startedAt:new Date(),completedAt:new Date()}));
 const db:any={
  $queryRaw:vi.fn().mockResolvedValue([]),
  brainRun:{findFirst:vi.fn().mockImplementation(async ({where}:any)=>where.organizationId==='tenant-a'?run:null)},
  agentExecution:{findMany:vi.fn().mockResolvedValue(attempts)},
  modelUsage:{findMany:vi.fn().mockResolvedValue(attempts.length?[{requestId:attempts[0]!.id+':draft',status:'RESERVED',billingStatus:'UNVERIFIED'}]:[])}
 };
 db.$transaction=vi.fn(async(cb:any)=>cb(db));
 return {db,ledger:new BrainRunLedgerService(db)};
}
function checkpointFixture(options?:{runChanged?:number;proofFound?:boolean;stepChanged?:number;stepOrdinal?:number}){
 const run=runFixture(options?.stepOrdinal??0);
 const tx:any={
  $queryRaw:vi.fn().mockResolvedValue([]),
  brainRun:{findFirst:vi.fn().mockResolvedValue(run),updateMany:vi.fn().mockResolvedValue({count:options?.runChanged??1})},
  agentExecution:{findFirst:vi.fn().mockResolvedValue(options?.proofFound===false?null:{id:'exec-1',startedAt:new Date()})},
  brainRunStep:{updateMany:vi.fn().mockResolvedValue({count:options?.stepChanged??1})},
  outboxEvent:{create:vi.fn().mockResolvedValue({})}
 };
 const db:any={$transaction:vi.fn(async (cb:any)=>cb(tx))};
 return {tx,ledger:new BrainRunLedgerService(db)};
}
describe('Brain worker crash-window evidence, no automatic replay',()=>{
 it('finds a completed but uncheckpointed execution without re-running an agent or settling its uncertain invoice',async()=>{
  const {db,ledger}=readFixture({attempts:[{id:'exec-1',status:'COMPLETED',causationId:null}]});
  const report=await ledger.recoveryEvidence('tenant-a','run-1');
  expect(report).toMatchObject({
   evidenceStatus:'ONE_COMPLETED_UNCHECKPOINTED',automaticReplayAllowed:false,
   automaticCheckpointAllowed:false,modelReconciliation:{reserved:1,unverifiedSettled:0},
   nextStep:{agentId:'MKT-CMO-001',ordinal:0}
  });
  expect(db.agentExecution.findMany).toHaveBeenCalledWith(expect.objectContaining({
   where:expect.objectContaining({organizationId:'tenant-a',agentId:'MKT-CMO-001',
    input:{path:['brainRunId'],equals:'run-1'}})
  }));
  expect(db.modelUsage.findMany).toHaveBeenCalledWith(expect.objectContaining({where:{
   organizationId:'tenant-a',requestId:{in:['exec-1:draft']}
  }}));
  expect(db.brainRun.updateMany).toBeUndefined();
 });
 it('flags multiple completed attempts instead of selecting one for silent replay',async()=>{
  const {ledger}=readFixture({attempts:[
   {id:'exec-1',status:'COMPLETED',causationId:null},
   {id:'exec-2',status:'COMPLETED',causationId:null}
  ]});
  const report=await ledger.recoveryEvidence('tenant-a','run-1');
  expect(report.evidenceStatus).toBe('MULTIPLE_EXECUTION_ATTEMPTS');
  expect(report.candidateExecutions).toHaveLength(2);
  expect(report.automaticReplayAllowed).toBe(false);
 });
 it('flags model outcome uncertainty or mismatched causation',async()=>{
  const running=readFixture({attempts:[{id:'exec-1',status:'RUNNING',causationId:null}]});
  expect((await running.ledger.recoveryEvidence('tenant-a','run-1')).evidenceStatus).toBe('AMBIGUOUS_AGENT_OUTCOME');
  const badCause=readFixture({attempts:[{id:'exec-1',status:'COMPLETED',causationId:'different'}],stepOrdinal:1});
  expect((await badCause.ledger.recoveryEvidence('tenant-a','run-1')).evidenceStatus).toBe('CONFLICTING_CAUSATION');
 });
 it('denies foreign tenant recovery lookups before exposing agent or billing records',async()=>{
  const {ledger,db}=readFixture();
  await expect(ledger.recoveryEvidence('tenant-b','run-1')).rejects.toThrow('not found');
  expect(db.agentExecution.findMany).not.toHaveBeenCalled();
  expect(db.modelUsage.findMany).not.toHaveBeenCalled();
 });
 it('enforces manager-only audit permissions without a mutation endpoint',()=>{
  const permission=permissionForMarketingRoute('GET','/marketing/brain/runs/run-1/recovery');
  expect(permission).toBe('READ_AUDIT');
  expect(hasMarketingPermission({role:'VIEWER'} as any,permission!)).toBe(false);
  expect(hasMarketingPermission({role:'MARKETING_DIRECTOR'} as any,permission!)).toBe(true);
  expect(()=>permissionForMarketingRoute('POST','/marketing/brain/runs/run-1/recovery')).toThrow();
 });
 it('refuses a stale checkpoint if an operator quarantine wins the run CAS race',async()=>{
  const {tx,ledger}=checkpointFixture({runChanged:0});
  await expect(ledger.checkpoint('tenant-a','run-1','MKT-CMO-001','exec-1')).rejects.toThrow('concurrency fence');
  expect(tx.brainRun.updateMany).toHaveBeenCalledWith(expect.objectContaining({
   where:expect.objectContaining({id:'run-1',organizationId:'tenant-a',status:'RUNNING',updatedAt:expect.any(Date)})
  }));
  expect(tx.brainRunStep.updateMany).not.toHaveBeenCalled();
  expect(tx.outboxEvent.create).not.toHaveBeenCalled();
 });
 it('rejects a completed execution with no proof of origin, tenant and upstream causation',async()=>{
  const {tx,ledger}=checkpointFixture({proofFound:false,stepOrdinal:1});
  await expect(ledger.checkpoint('tenant-a','run-1','MKT-STR-001','exec-1')).rejects.toThrow('No completed matching');
  expect(tx.agentExecution.findFirst).toHaveBeenCalledWith({where:expect.objectContaining({
   id:'exec-1',organizationId:'tenant-a',agentId:'MKT-STR-001',correlationId:'corr-1',
   causationId:'prev-completed',status:'COMPLETED',input:{path:['brainRunId'],equals:'run-1'}
  })});
  expect(tx.brainRun.updateMany).not.toHaveBeenCalled();
  expect(tx.outboxEvent.create).not.toHaveBeenCalled();
 });
 it('rolls back the run and step handoff when optimistic step claim fails',async()=>{
  const {tx,ledger}=checkpointFixture({stepChanged:0});
  await expect(ledger.checkpoint('tenant-a','run-1','MKT-CMO-001','exec-1')).rejects.toThrow('already claimed');
  expect(tx.outboxEvent.create).not.toHaveBeenCalled();
 });
 it('still checkpoints a valid completed execution once, generating a single internal event',async()=>{
  const {tx,ledger}=checkpointFixture();
  await expect(ledger.checkpoint('tenant-a','run-1','MKT-CMO-001','exec-1')).resolves.toMatchObject({
   completed:false,requiresHumanReview:true
  });
  expect(tx.brainRun.updateMany).toHaveBeenCalledTimes(1);
  expect(tx.brainRunStep.updateMany).toHaveBeenCalledTimes(1);
  expect(tx.outboxEvent.create).toHaveBeenCalledTimes(1);
  expect(tx.outboxEvent.create).toHaveBeenCalledWith(expect.objectContaining({
   data:expect.objectContaining({eventType:'BRAIN_AGENT_STEP_COMPLETED',
    payload:expect.objectContaining({externalEffectsAuthorized:false})})
  }));
 });
 it('executor still refuses any RUNNING replay even when internal checkpoint evidence exists',async()=>{
  const {ledger}=readFixture({attempts:[{id:'exec-1',status:'COMPLETED',causationId:null}]});
  const executor=new BrainRunExecutorService({} as any,{} as any,ledger);
  await expect(executor.execute('tenant-a','run-1')).rejects.toThrow('already claimed');
 });
});
