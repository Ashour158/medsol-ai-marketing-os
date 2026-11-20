import {describe,expect,it} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {withMarketingTenant} from './prisma.service.js';
import {InboxService} from './inbox.service.js';
import {CampaignService} from './campaign.service.js';
import {OutboxService} from './outbox.service.js';

const enabled=process.env.MARKETING_DB_INTEGRATION==='1';
const org=(label:string)=>'r3s-'+label+'-'+randomUUID();
const TABLES=['AuditEvent','CommandReceipt','InboxEvent','IncidentResponse'] as const;
async function seed(db:PrismaClient,organizationId:string){
 await db.organization.create({data:{id:organizationId,name:'Synthetic event tenant'}});
 await withMarketingTenant(db,organizationId,async tx=>{
  await tx.auditEvent.create({data:{organizationId,actorType:'SYSTEM',actorId:'r3s-test',
   action:'SYNTHETIC_EVENT',objectType:'Test',objectId:randomUUID(),correlationId:randomUUID()}});
  await tx.commandReceipt.create({data:{organizationId,commandId:randomUUID(),
   commandType:'Offline',correlationId:randomUUID(),status:'COMPLETED'}});
  await tx.inboxEvent.create({data:{organizationId,consumerName:'synthetic',eventId:randomUUID()}});
  await tx.incidentResponse.create({data:{organizationId,kind:'BRAIN_NEEDS_INTERVENTION',
   sourceId:randomUUID(),occurrenceAt:new Date()}});
 });
}
async function inspect(db:PrismaClient,role:string,tenant:string|null){
 return db.$transaction(async tx=>{
  await tx.$executeRawUnsafe('SET LOCAL ROLE "'+role+'"');
  if(tenant)await tx.$queryRawUnsafe(
    "SELECT set_config('app.marketing_tenant_id',$1,true)",tenant);
  const counts:number[]=[];
  for(const table of TABLES){
   const rows=await tx.$queryRawUnsafe<Array<{n:number}>>('SELECT count(*)::int n FROM "'+table+'"');
   counts.push(rows[0]?.n??-1);
  }
  return counts;
 });
}
describe.skipIf(!enabled)('R3-S real PostgreSQL forensic events, command, inbox, incident FORCE RLS',()=>{
 it('T01-015 non-BYPASSRLS tenant A / tenant B / unset scope and immutable evidence',async()=>{
  const db=new PrismaClient(),a=org('a'),b=org('b');
  const role='r3s_probe_'+randomUUID().replaceAll('-','').slice(0,14);
  let created=false;
  try{
   await db.$connect();await seed(db,a);await seed(db,b);
   await db.$executeRawUnsafe('CREATE ROLE "'+role+'" NOLOGIN');created=true;
   for(const table of TABLES)await db.$executeRawUnsafe(
     'GRANT SELECT,INSERT,UPDATE,DELETE ON "'+table+'" TO "'+role+'"');
   expect(await inspect(db,role,null)).toEqual([0,0,0,0]);
   expect(await inspect(db,role,a)).toEqual([1,1,1,1]);
   expect(await inspect(db,role,b)).toEqual([1,1,1,1]);
   expect(await inspect(db,role,null)).toEqual([0,0,0,0]);
   const updated=await db.$transaction(async tx=>{
     await tx.$executeRawUnsafe('SET LOCAL ROLE "'+role+'"');
     await tx.$queryRawUnsafe("SELECT set_config('app.marketing_tenant_id',$1,true)",a);
     return tx.$executeRawUnsafe('UPDATE "IncidentResponse" SET "kind"=$1 WHERE "organizationId"=$2',
       'ATTACKER',b);
   });
   expect(updated).toBe(0);
   const deleted=await db.$transaction(async tx=>{
    await tx.$executeRawUnsafe('SET LOCAL ROLE "'+role+'"');
    await tx.$queryRawUnsafe("SELECT set_config('app.marketing_tenant_id',$1,true)",a);
    return tx.$executeRawUnsafe('DELETE FROM "AuditEvent" WHERE "organizationId"=$1',a);
   });
   expect(deleted).toBe(0);
   await expect(db.$transaction(async tx=>{
     await tx.$executeRawUnsafe('SET LOCAL ROLE "'+role+'"');
     return tx.$executeRawUnsafe(
       'INSERT INTO "InboxEvent"("id","organizationId","eventId","consumerName","status") VALUES ($1,$2,$3,$4,$5)',
       randomUUID(),a,randomUUID(),'attacker','RECEIVED');
   })).rejects.toThrow();
  }finally{
   if(created){
    for(const table of TABLES)await db.$executeRawUnsafe(
     'REVOKE ALL ON "'+table+'" FROM "'+role+'"');
    await db.$executeRawUnsafe('DROP ROLE IF EXISTS "'+role+'"');
   }
   await db.$disconnect();
  }
 },90000);
 it('T03-023 canonical idempotent campaign creation uses scoped CommandReceipt, immutable AuditEvent and internal Outbox',async()=>{
  const db=new PrismaClient(),a=org('campaign'),b=org('foreign');
  try{
   await db.$connect();await seed(db,a);await seed(db,b);
   const objective=await withMarketingTenant(db,a,tx=>tx.marketingObjective.create({data:{
     organizationId:a,name:'Offline objective',description:'Strict forensic replay'}}));
   const campaign=new CampaignService(db as any,new OutboxService(db as any));
   const cmd={organizationId:a,commandId:randomUUID(),correlationId:randomUUID(),
    objectiveId:objective.id,code:'R3S-'+randomUUID(),name:'Synthetic campaign',riskLevel:'R1' as const};
   const first=await campaign.create(cmd,'test-human');
   const second=await campaign.create(cmd,'test-human');
   expect(second).toEqual(first);
   const counts=await withMarketingTenant(db,a,async tx=>({
    command:await tx.commandReceipt.count({where:{organizationId:a,commandId:cmd.commandId}}),
    audit:await tx.auditEvent.count({where:{organizationId:a,action:'CAMPAIGN_CREATED',objectId:(first as {campaignId:string}).campaignId}}),
    outbox:await tx.outboxEvent.count({where:{organizationId:a,eventType:'CampaignCreated',
      aggregateId:(first as {campaignId:string}).campaignId}})
   }));
   expect(counts).toEqual({command:1,audit:1,outbox:1});
   expect(await withMarketingTenant(db,b,tx=>tx.commandReceipt.count({
    where:{organizationId:b,commandId:cmd.commandId}}))).toBe(0);
   expect(await db.publicationAttempt.count({where:{organizationId:a,mode:'REMOTE'}})).toBe(0);
  }finally{await db.$disconnect();}
 },90000);
 it('T15-025 inbox begin/duplicate/complete/fail always binds verified tenant and immutable event key',async()=>{
  const db=new PrismaClient(),a=org('consumer'),b=org('other');
  try{
   await db.$connect();await seed(db,a);await seed(db,b);
   const service=new InboxService(db as any),eventId=randomUUID();
   const first=await service.begin(a,'reliable-consumer',eventId);
   expect(first.duplicate).toBe(false);
   const dup=await service.begin(a,'reliable-consumer',eventId);
   expect(dup).toEqual({id:first.id,duplicate:true});
   await expect(service.complete(b,first.id)).rejects.toThrow('not claimable in tenant');
   await service.complete(a,first.id);
   await expect(service.complete(a,first.id)).rejects.toThrow('not claimable in tenant');
   const another=await service.begin(a,'reliable-consumer',randomUUID());
   await service.fail(a,another.id,new Error('offline-safe failure'));
   const records=await withMarketingTenant(db,a,tx=>tx.inboxEvent.findMany({
    where:{organizationId:a,id:{in:[first.id,another.id]}},orderBy:{id:'asc'}}));
   expect(records.map(x=>x.status).sort()).toEqual(['FAILED','PROCESSED']);
   expect(await withMarketingTenant(db,b,tx=>tx.inboxEvent.count({
    where:{organizationId:b,eventId}}))).toBe(0);
  }finally{await db.$disconnect();}
 },90000);
});
