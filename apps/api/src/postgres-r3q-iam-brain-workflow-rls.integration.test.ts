import {describe,expect,it,vi} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {withMarketingTenant} from './prisma.service.js';
import {BrainDispatchWorker} from './brain-dispatch.worker.js';
import {BrainRunLedgerService} from './brain-run-ledger.service.js';
import {WorkflowLeaseService} from './workflow-lease.service.js';

const enabled=process.env.MARKETING_DB_INTEGRATION==='1';
const TABLES=['User','Agent','AgentExecution','BrainRun','BrainRunStep',
 'WorkflowExecution','WorkflowStepExecution','Approval'] as const;
const org=(suffix:string)=>'r3q-'+suffix+'-'+randomUUID();
async function seeded(db:PrismaClient,organizationId:string){
 await db.organization.create({data:{id:organizationId,name:'Synthetic R3Q tenant'}});
 await withMarketingTenant(db,organizationId,async tx=>{
  await tx.user.create({data:{organizationId,name:'Human reviewer',role:'ADMIN',
   email:'review-'+randomUUID()+'@example.invalid',oidcSubject:'r3q-'+randomUUID()}});
  await tx.agent.create({data:{organizationId,id:'MKT-CMO-001',
   name:'Chief marketing reviewer',capabilities:['ASSESS_OBJECTIVE']}});
  const correlationId='corr-'+randomUUID();
  await tx.agentExecution.create({data:{organizationId,
   agentId:'MKT-CMO-001',correlationId,status:'COMPLETED',input:{offline:true}}});
  const brain=await tx.brainRun.create({data:{organizationId,
   commandKey:'cmd-'+randomUUID(),correlationId:randomUUID(),
   input:{requestedOutcome:'Offline proof'},status:'PENDING'}});
  await tx.brainRunStep.create({data:{organizationId,runId:brain.id,
   agentId:'MKT-CMO-001',stage:'ASSESS',ordinal:0,status:'PENDING'}});
  const workflow=await tx.workflowExecution.create({data:{organizationId,
   workflowType:'BLUEPRINT_VIRTUAL_SIMULATION',currentStep:'APPROVAL_GATE',
   correlationId:randomUUID(),input:{offline:true},status:'WAITING_APPROVAL'}});
  await tx.workflowStepExecution.create({data:{organizationId,
   workflowExecutionId:workflow.id,stepKey:'APPROVAL_GATE',status:'WAITING_APPROVAL'}});
  await tx.approval.create({data:{organizationId,objectType:'BlueprintWorkflowStep',
   objectId:'APPROVAL_GATE',riskLevel:'R2',requiredAuthority:'HUMAN',
   workflowExecutionId:workflow.id,requestedBy:'different-human',decision:'PENDING'}});
 });
}
async function role(db:PrismaClient,name:string){
 await db.$executeRawUnsafe('CREATE ROLE "'+name+'" NOLOGIN');
 for(const table of TABLES)
  await db.$executeRawUnsafe('GRANT SELECT,UPDATE,INSERT ON "'+table+'" TO "'+name+'"');
}
async function removeRole(db:PrismaClient,name:string){
 for(const table of TABLES)await db.$executeRawUnsafe(
  'REVOKE SELECT,UPDATE,INSERT ON "'+table+'" FROM "'+name+'"');
 await db.$executeRawUnsafe('DROP ROLE IF EXISTS "'+name+'"');
}
async function counts(db:PrismaClient,principal:string,tenant:string|null){
 return db.$transaction(async tx=>{
  await tx.$executeRawUnsafe('SET LOCAL ROLE "'+principal+'"');
  if(tenant)await tx.$queryRawUnsafe(
   "SELECT set_config('app.marketing_tenant_id',$1,true)",tenant);
  const rows:Record<string,number>={};
  for(const table of TABLES){
   const result=await tx.$queryRawUnsafe<Array<{n:number}>>(
    'SELECT count(*)::int AS n FROM "'+table+'"');
   rows[table]=result[0]?.n??-1;
  }
  return rows;
 });
}
describe.skipIf(!enabled)('R3-Q real PostgreSQL guarded IAM, agents, workflows and brain scheduler',()=>{
 it('T01-013 enforces FORCE RLS in all eight tables for non-BYPASSRLS principal and pooled null context',async()=>{
  const db=new PrismaClient(),a=org('a'),b=org('b');
  const principal='r3q_probe_'+randomUUID().replaceAll('-','').slice(0,14);
  let roleCreated=false;
  try{
   await db.$connect();await seeded(db,a);await seeded(db,b);
   await role(db,principal);roleCreated=true;
   const blank=await counts(db,principal,null);
   expect(Object.values(blank)).toEqual(Array(TABLES.length).fill(0));
   const left=await counts(db,principal,a);
   const right=await counts(db,principal,b);
   expect(Object.values(left)).toEqual(Array(TABLES.length).fill(1));
   expect(Object.values(right)).toEqual(Array(TABLES.length).fill(1));
   expect(await counts(db,principal,null)).toEqual(blank);
   const foreignMutation=await db.$transaction(async tx=>{
    await tx.$executeRawUnsafe('SET LOCAL ROLE "'+principal+'"');
    await tx.$queryRawUnsafe(
     "SELECT set_config('app.marketing_tenant_id',$1,true)",a);
    return tx.$executeRawUnsafe('UPDATE "Agent" SET "status"=$1 WHERE "organizationId"=$2',
     'PAUSED',b);
   });
   expect(foreignMutation).toBe(0);
   await expect(db.$transaction(async tx=>{
    await tx.$executeRawUnsafe('SET LOCAL ROLE "'+principal+'"');
    return tx.$executeRawUnsafe(
     'INSERT INTO "Agent" ("id","organizationId","name","capabilities") VALUES ($1,$2,$3,$4::jsonb)',
     'MKT-EXTRA-001',a,'Unsafe unscoped insert','[]');
   })).rejects.toThrow();
  }finally{
   if(roleCreated)await removeRole(db,principal);
   await db.$disconnect();
  }
 },90000);
 it('T04-034 canonical workflow lease and brain checkpoint operations remain tenant-scoped',async()=>{
  const db=new PrismaClient(),a=org('workflow'),b=org('foreign');
  try{
   await db.$connect();await seeded(db,a);await seeded(db,b);
   const wf=await withMarketingTenant(db,a,tx=>tx.workflowExecution.findFirstOrThrow({
    where:{organizationId:a},select:{id:true}}));
   const leases=new WorkflowLeaseService(db as any);
   // A WAITING_APPROVAL workflow cannot be claimed as RUNNING; no force-claim.
   await expect(leases.claim(a,wf.id)).rejects.toThrow('not executable');
   await expect(leases.claim(b,wf.id)).rejects.toThrow('not found in tenant');
   const run=await withMarketingTenant(db,a,tx=>tx.brainRun.findFirstOrThrow({
    where:{organizationId:a},select:{id:true}}));
   const ledger=new BrainRunLedgerService(db as any);
   await expect(ledger.get(b,run.id)).rejects.toThrow('Brain run not found');
   expect((await ledger.get(a,run.id)).steps).toHaveLength(1);
  }finally{await db.$disconnect();}
 },90000);
 it('T15-024 worker claims pending runs via tenant-specific queries, never global protected reads or provider calls',async()=>{
  const db=new PrismaClient(),a=org('scheduler-a'),b=org('scheduler-b');
  try{
   await db.$connect();await seeded(db,a);await seeded(db,b);
   const calls:Array<{organizationId:string;id:string}>=[];
   const executor:any={execute:vi.fn(async(organizationId:string,id:string)=>{
    calls.push({organizationId,id});
    await withMarketingTenant(db,organizationId,tx=>tx.brainRun.updateMany({
     where:{organizationId,id,status:'PENDING'},data:{status:'REVIEW_REQUIRED'}}));
    return{status:'REVIEW_REQUIRED'};
   })};
   let call=0;
   const observedClient:any={
    $transaction:db.$transaction.bind(db),
    organization:{findMany:vi.fn(async()=>{
     call++;
     if(call===1)return[{id:a},{id:b}];
     if(call===2)return[{id:a},{id:b}];
     return[];
    })}
   };
   const worker=new BrainDispatchWorker(observedClient,executor);
   const first=await worker.tick(),second=await worker.tick();
   worker.onModuleDestroy();
   expect(first).toMatchObject({claimed:true,status:'REVIEW_REQUIRED'});
   expect(second).toMatchObject({claimed:true,status:'REVIEW_REQUIRED'});
   expect(calls).toHaveLength(2);
   expect(new Set(calls.map(c=>c.organizationId))).toEqual(new Set([a,b]));
   expect(executor.execute).toHaveBeenCalledTimes(2);
   expect(await withMarketingTenant(db,a,tx=>tx.brainRun.count({
    where:{organizationId:a,status:'PENDING'}}))).toBe(0);
   expect(await withMarketingTenant(db,b,tx=>tx.brainRun.count({
    where:{organizationId:b,status:'PENDING'}}))).toBe(0);
   expect(await db.modelUsage.count({where:{organizationId:{in:[a,b]}}})).toBe(0);
   expect(await db.publicationAttempt.count({where:{organizationId:{in:[a,b]},mode:'REMOTE'}})).toBe(0);
  }finally{await db.$disconnect();}
 },90000);
});
