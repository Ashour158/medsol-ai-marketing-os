import {describe,it,expect,vi} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {withMarketingTenant} from './prisma.service.js';
import {InboxService} from './inbox.service.js';
import {OutboxPublisherService} from './outbox-publisher.service.js';
import {DeliveryOperationsService} from './delivery-operations.service.js';
import {ModelBudgetService} from './model-budget.service.js';

const enabled=process.env.MARKETING_DB_INTEGRATION==='1';
const TABLES=['AuditEvent','CommandReceipt','InboxEvent','OutboxEvent',
 'ModelBudget','ModelUsage','IncidentResponse'] as const;
const org=(suffix:string)=>'r3q2-'+suffix+'-'+randomUUID();
async function seed(db:PrismaClient,tenant:string){
 await db.organization.create({data:{id:tenant,name:'R3Q2 disposable tenant'}});
 await withMarketingTenant(db,tenant,async tx=>{
  await tx.auditEvent.create({data:{organizationId:tenant,actorType:'SYSTEM',
   actorId:'synthetic-r3q2-test',action:'TENANT_RLS_INVENTORY',
   objectType:'SyntheticProbe',objectId:randomUUID(),correlationId:randomUUID(),
   after:{offlineOnly:true}}});
  await tx.commandReceipt.create({data:{organizationId:tenant,
   commandId:'offline-command-'+randomUUID(),commandType:'SyntheticProbe',
   correlationId:randomUUID(),status:'COMPLETED',
   response:{offlineOnly:true,externalEffectsAuthorized:false}}});
  await tx.inboxEvent.create({data:{organizationId:tenant,
   consumerName:'offline-rls-probe',eventId:randomUUID(),status:'RECEIVED'}});
  await tx.outboxEvent.create({data:{organizationId:tenant,
   eventId:'offline-event-'+randomUUID(),eventType:'R3Q2_INTERNAL_PROBE',
   aggregateType:'SyntheticProbe',aggregateId:randomUUID(),
   correlationId:randomUUID(),payload:{offlineOnly:true,externalEffectsAuthorized:false}}});
  await tx.modelBudget.create({data:{organizationId:tenant,limitMicros:5000n}});
  await tx.modelUsage.create({data:{organizationId:tenant,
   requestId:'offline-model-'+randomUUID(),agentId:'MKT-CMO-001',
   reservedMicros:0n,status:'RELEASED'}});
  await tx.incidentResponse.create({data:{organizationId:tenant,
   kind:'BRAIN_NEEDS_INTERVENTION',sourceId:'synthetic-'+randomUUID(),
   occurrenceAt:new Date(),lastNotifiedLevel:-1}});
 });
}
async function mkRole(db:PrismaClient,p:string){
 await db.$executeRawUnsafe('CREATE ROLE "'+p+'" NOLOGIN');
 for(const name of TABLES)await db.$executeRawUnsafe(
  'GRANT SELECT,INSERT,UPDATE ON "'+name+'" TO "'+p+'"');
}
async function dropRole(db:PrismaClient,p:string){
 for(const name of TABLES)await db.$executeRawUnsafe(
  'REVOKE ALL ON "'+name+'" FROM "'+p+'"');
 await db.$executeRawUnsafe('DROP ROLE IF EXISTS "'+p+'"');
}
async function counts(db:PrismaClient,p:string,tenant:string|null){
 return db.$transaction(async tx=>{
  await tx.$executeRawUnsafe('SET LOCAL ROLE "'+p+'"');
  if(tenant)await tx.$queryRawUnsafe(
   "SELECT set_config('app.marketing_tenant_id',$1,true)",tenant);
  const out:Record<string,number>={};
  for(const name of TABLES){
   const rows=await tx.$queryRawUnsafe<Array<{n:number}>>(
    'SELECT count(*)::int AS n FROM "'+name+'"');
   out[name]=rows[0]?.n??-1;
  }
  return out;
 });
}
describe.skipIf(!enabled)('R3-Q2 real PostgreSQL 46/46 tenant isolation & internal transport',()=>{
 it('T01-014 non-BYPASSRLS principal sees zero unscoped/foreign ledger and cannot rewrite audit/command receipts',async()=>{
  const db=new PrismaClient(),a=org('a'),b=org('b'),
   principal='r3q2_role_'+randomUUID().replaceAll('-','').slice(0,13);
  let grant=false;
  try{
   await db.$connect();await seed(db,a);await seed(db,b);
   await mkRole(db,principal);grant=true;
   expect(Object.values(await counts(db,principal,null)))
    .toEqual(Array(TABLES.length).fill(0));
   expect(Object.values(await counts(db,principal,a)))
    .toEqual(Array(TABLES.length).fill(1));
   expect(Object.values(await counts(db,principal,b)))
    .toEqual(Array(TABLES.length).fill(1));
   expect(Object.values(await counts(db,principal,null)))
    .toEqual(Array(TABLES.length).fill(0));
   const denies=await db.$transaction(async tx=>{
    await tx.$executeRawUnsafe('SET LOCAL ROLE "'+principal+'"');
    await tx.$queryRawUnsafe(
     "SELECT set_config('app.marketing_tenant_id',$1,true)",a);
    const r1=await tx.$executeRawUnsafe(
     'UPDATE "AuditEvent" SET "action"=$1 WHERE "organizationId"=$2',
     'FORGED_FOREIGN_AUDIT',b);
    const r2=await tx.$executeRawUnsafe(
     'UPDATE "CommandReceipt" SET "status"=$1 WHERE "organizationId"=$2',
     'FORGED_FOREIGN_RECEIPT',b);
    const r3=await tx.$executeRawUnsafe(
     'UPDATE "AuditEvent" SET "action"=$1 WHERE "organizationId"=$2',
     'FORGED_OWN_AUDIT',a);
    const r4=await tx.$executeRawUnsafe(
     'UPDATE "CommandReceipt" SET "status"=$1 WHERE "organizationId"=$2',
     'FORGED_OWN_RECEIPT',a);
    return[r1,r2,r3,r4];
   });
   expect(denies).toEqual([0,0,0,0]);
   await expect(db.$transaction(async tx=>{
    await tx.$executeRawUnsafe('SET LOCAL ROLE "'+principal+'"');
    await tx.$executeRawUnsafe(
     'INSERT INTO "CommandReceipt" ("id","organizationId","commandId","commandType","correlationId","status") VALUES ($1,$2,$3,$4,$5,$6)',
     randomUUID(),a,'forged-'+randomUUID(),'FORGED',randomUUID(),'COMPLETED');
   })).rejects.toThrow();
  }finally{if(grant)await dropRole(db,principal);await db.$disconnect();}
 },90000);

 it('T15-025 canonical event publisher, deduplicating inbox and human-facing delivery report remain scoped with zero remote effects',async()=>{
  const db=new PrismaClient(),a=org('deliver-a'),b=org('deliver-b');
  try{
   await db.$connect();await seed(db,a);await seed(db,b);
   const ids=[a,b].sort(),received:string[]=[];
   const dbProxy:any={
    $transaction:db.$transaction.bind(db),
    organization:{findMany:vi.fn(async()=>ids.map(id=>({id})))}
   };
   const publisher=new OutboxPublisherService(dbProxy);
   expect(await publisher.publishBatch({publish:async e=>{
    expect(e.eventType).toBe('R3Q2_INTERNAL_PROBE');
    expect(e.payload).toMatchObject({offlineOnly:true,
     externalEffectsAuthorized:false});
    received.push(e.organizationId);
   }},2)).toEqual({published:2,failed:0});
   expect(new Set(received)).toEqual(new Set([a,b]));
   expect((await new DeliveryOperationsService(db as any).summary(a)).pending).toBe(0);
   expect((await new DeliveryOperationsService(db as any).summary(b)).pending).toBe(0);
   const inbox=new InboxService(db as any);
   const receipt=await inbox.begin(a,'r3q2-no-egress','same-'+randomUUID());
   expect(receipt.duplicate).toBe(false);
   await expect(inbox.complete(b,receipt.id))
    .rejects.toThrow('not authorized');
   await inbox.complete(a,receipt.id);
   await expect(inbox.complete(a,receipt.id))
    .rejects.toThrow('already processed');
   const after=await withMarketingTenant(db,a,tx=>tx.inboxEvent.findUniqueOrThrow({
    where:{id:receipt.id}}));
   expect(after.status).toBe('PROCESSED');
   expect(await db.modelUsage.count({where:{organizationId:{in:[a,b]},status:'SETTLED'}})).toBe(0);
   expect(await db.providerCredential.count({where:{organizationId:{in:[a,b]}}})).toBe(0);
   expect(await db.publicationAttempt.count({where:{organizationId:{in:[a,b]},mode:'REMOTE'}})).toBe(0);
  }finally{await db.$disconnect();}
 },90000);

 it('T14-002 budget reservations are tenant-fenced and never labelled independently billed by offline simulations',async()=>{
  const db=new PrismaClient(),a=org('budget-a'),b=org('budget-b');
  try{
   await db.$connect();await seed(db,a);await seed(db,b);
   const svc=new ModelBudgetService(db as any);
   const r=await svc.reserve({organizationId:a,requestId:'budget-'+randomUUID(),
    agentId:'MKT-CMO-001',costMicros:400});
   expect(r).toMatchObject({status:'RESERVED',replay:false});
   await expect(svc.settle(b,r.id,{actualCostMicros:90,model:'OFFLINE_TEST',
    inputTokens:1,outputTokens:2})).rejects.toThrow('not found in tenant');
   const valid=await svc.settle(a,r.id,{
    actualCostMicros:90,model:'SYNTHETIC_EVIDENCE_NOT_PROVIDER_BILLING',
    inputTokens:1,outputTokens:2});
   expect(valid).toMatchObject({status:'SETTLED',replay:false});
   expect(await svc.summary(a)).toMatchObject({
    enabled:true,estimatedSpentMicros:'90',verifiedBilledMicros:'0',
    awaitingInvoiceCount:1,accountingStatus:'ESTIMATES_NOT_INVOICES'});
   expect(await svc.summary(b)).toMatchObject({
    enabled:true,estimatedSpentMicros:'0',verifiedBilledMicros:'0'});
   await expect(svc.reserve({organizationId:a,requestId:'budget-too-large-'+randomUUID(),
    agentId:'MKT-CMO-001',costMicros:999999}))
    .rejects.toThrow('budget exceeded');
   expect(await db.auditEvent.count({where:{organizationId:b,
    action:'MODEL_INVOICE_VERIFIED'}})).toBe(0);
  }finally{await db.$disconnect();}
 },90000);
});
