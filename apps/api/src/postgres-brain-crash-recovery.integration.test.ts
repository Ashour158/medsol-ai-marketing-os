import {describe,expect,it} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {BrainRunLedgerService} from './brain-run-ledger.service.js';

const enabled=process.env.MARKETING_DB_INTEGRATION==='1';
describe.skipIf(!enabled)('PostgreSQL Brain crash-window/fencing acceptance',()=>{
 it('T15-020 does not steal cross-run proof, recover on its own, or checkpoint after quarantine',async()=>{
  const db=new PrismaClient();
  const organizationId='recovery-test-'+randomUUID();
  const correlationId='crash-corr-'+randomUUID();
  const agentId='MKT-CMO-001';
  try{
   await db.$connect();
   await db.organization.create({data:{id:organizationId,name:'Crash-window test tenant'}});
   await db.agent.create({data:{id:agentId,organizationId,name:'CMO',capabilities:['ASSESS_OBJECTIVE']}});
   const ledger=new BrainRunLedgerService(db as any);
   const input={organizationId,correlationId,requestedOutcome:'Internal governed draft'};
   const current=await ledger.create(organizationId,input,'run-a-'+randomUUID());
   const other=await ledger.create(organizationId,input,'run-b-'+randomUUID());
   await db.brainRun.update({where:{id:current.id},data:{status:'RUNNING'}});
   const otherExecution=await db.agentExecution.create({data:{
    id:'other-'+randomUUID(),organizationId,agentId,correlationId,
    input:{brainRunId:other.id,upstreamExecutionId:null},status:'COMPLETED',completedAt:new Date()
   }});
   // Exact ID, tenant, agent and correlation match; only the originating Brain run differs.
   await expect(ledger.checkpoint(organizationId,current.id,agentId,otherExecution.id))
    .rejects.toThrow('No completed matching');
   expect(await db.outboxEvent.count({where:{organizationId,aggregateId:current.id}})).toBe(0);
   const execution=await db.agentExecution.create({data:{
    id:'exec-'+randomUUID(),organizationId,agentId,correlationId,
    input:{brainRunId:current.id,upstreamExecutionId:null},status:'COMPLETED',completedAt:new Date()
   }});
   await db.modelUsage.create({data:{organizationId,agentId,
    requestId:execution.id+':draft',reservedMicros:900n,status:'RESERVED'}});
   const report=await ledger.recoveryEvidence(organizationId,current.id);
   expect(report).toMatchObject({
    evidenceStatus:'ONE_COMPLETED_UNCHECKPOINTED',automaticReplayAllowed:false,
    modelReconciliation:{reserved:1,unverifiedSettled:0},candidateCountAtLeast:1
   });
   await db.brainRun.update({where:{id:current.id},data:{
    status:'RUNNING',updatedAt:new Date(Date.now()-31*60_000)
   }});
   await ledger.quarantineAbandoned(organizationId,current.id,'operator-1',
    'Worker died after remote response and before durable Brain checkpoint');
   await expect(ledger.checkpoint(organizationId,current.id,agentId,execution.id)).rejects.toThrow('not eligible');
   expect(await db.brainRunStep.count({where:{organizationId,runId:current.id,status:'COMPLETED'}})).toBe(0);
   expect(await db.outboxEvent.count({where:{organizationId,aggregateId:current.id}})).toBe(0);
   expect(await db.modelUsage.findUnique({
    where:{organizationId_requestId:{organizationId,requestId:execution.id+':draft'}}
   })).toMatchObject({status:'RESERVED'});
   await expect(ledger.get('another-tenant',current.id)).rejects.toThrow('not found');
  }finally{
   await db.modelUsage.deleteMany({where:{organizationId}});
   await db.outboxEvent.deleteMany({where:{organizationId}});
   await db.auditEvent.deleteMany({where:{organizationId}});
   await db.brainRunStep.deleteMany({where:{organizationId}});
   await db.brainRun.deleteMany({where:{organizationId}});
   await db.agentExecution.deleteMany({where:{organizationId}});
   await db.agent.deleteMany({where:{organizationId}});
   await db.organization.deleteMany({where:{id:organizationId}});
   await db.$disconnect();
  }
 },45000);
 it('atomically stores a fenced checkpoint and never emits a second event for the same step',async()=>{
  const db=new PrismaClient();
  const organizationId='checkpoint-test-'+randomUUID();
  const agentId='MKT-CMO-001';
  const correlationId='checkpoint-corr-'+randomUUID();
  try{
   await db.$connect();
   await db.organization.create({data:{id:organizationId,name:'Atomic checkpoint tenant'}});
   await db.agent.create({data:{id:agentId,organizationId,name:'CMO',capabilities:['ASSESS_OBJECTIVE']}});
   const ledger=new BrainRunLedgerService(db as any);
   const run=await ledger.create(organizationId,{organizationId,correlationId,
    requestedOutcome:'Internal campaign evidence'},'checkpoint-'+randomUUID());
   await db.brainRun.update({where:{id:run.id},data:{status:'RUNNING'}});
   const execution=await db.agentExecution.create({data:{
    id:'execution-'+randomUUID(),organizationId,agentId,correlationId,
    input:{brainRunId:run.id,upstreamExecutionId:null},status:'COMPLETED',
    completedAt:new Date()
   }});
   const result=await ledger.checkpoint(organizationId,run.id,agentId,execution.id);
   expect(result.completed).toBe(false);
   expect(await db.brainRunStep.count({where:{runId:run.id,organizationId,status:'COMPLETED'}})).toBe(1);
   expect(await db.outboxEvent.count({where:{organizationId,aggregateId:run.id}})).toBe(1);
   await expect(ledger.checkpoint(organizationId,run.id,agentId,execution.id)).rejects.toThrow('Out-of-order');
   expect(await db.outboxEvent.count({where:{organizationId,aggregateId:run.id}})).toBe(1);
   expect((await ledger.recoveryEvidence(organizationId,run.id)).completedSteps).toBe(1);
  }finally{
   await db.outboxEvent.deleteMany({where:{organizationId}});
   await db.brainRunStep.deleteMany({where:{organizationId}});
   await db.brainRun.deleteMany({where:{organizationId}});
   await db.agentExecution.deleteMany({where:{organizationId}});
   await db.agent.deleteMany({where:{organizationId}});
   await db.organization.deleteMany({where:{id:organizationId}});
   await db.$disconnect();
  }
 },45000);
});
