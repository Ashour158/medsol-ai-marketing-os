import {describe,expect,it,vi} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {withMarketingTenant} from './prisma.service.js';
import {OutboxPublisherService} from './outbox-publisher.service.js';
import {InboxService} from './inbox.service.js';
import {DeliveryOperationsService} from './delivery-operations.service.js';

const enabled=process.env.MARKETING_DB_INTEGRATION==='1';
const org=(x:string)=>'r3t-'+x+'-'+randomUUID();
async function seed(db:PrismaClient,organizationId:string,eventType:string){
 await db.organization.create({data:{id:organizationId,name:'Synthetic outbox tenant'}});
 return withMarketingTenant(db,organizationId,tx=>tx.outboxEvent.create({data:{
  organizationId,eventId:'r3t-event-'+randomUUID(),eventType,
  aggregateType:'InternalAcceptance',aggregateId:'r3t-source-'+randomUUID(),
  correlationId:randomUUID(),payload:{offline:true,externalEffectsAuthorized:false}
 }}));
}
describe.skipIf(!enabled)('R3-T actual PostgreSQL canonical outbox FORCE RLS and internal dispatch',()=>{
 it('T01-016 non-BYPASSRLS role denies no-context, cross-tenant write and DELETE',async()=>{
  const db=new PrismaClient(),a=org('a'),b=org('b'),
   role='r3t_probe_'+randomUUID().replaceAll('-','').slice(0,13),
   kind='R3T_RLS_PROBE';
  let created=false;
  const count=async(tenant:string|null)=>db.$transaction(async tx=>{
   await tx.$executeRawUnsafe('SET LOCAL ROLE "'+role+'"');
   if(tenant)await tx.$queryRawUnsafe(
    "SELECT set_config('app.marketing_tenant_id',$1,true)",tenant);
   const rows=await tx.$queryRawUnsafe<Array<{n:number}>>(
    'SELECT count(*)::int n FROM "OutboxEvent" WHERE "eventType"=$1',kind);
   return rows[0]?.n??-1;
  });
  try{
   await db.$connect();await seed(db,a,kind);await seed(db,b,kind);
   await db.$executeRawUnsafe('CREATE ROLE "'+role+'" NOLOGIN');created=true;
   await db.$executeRawUnsafe('GRANT SELECT,INSERT,UPDATE,DELETE ON "OutboxEvent" TO "'+role+'"');
   expect(await count(null)).toBe(0);
   expect(await count(a)).toBe(1);
   expect(await count(b)).toBe(1);
   expect(await count(null)).toBe(0);
   const denied=await db.$transaction(async tx=>{
    await tx.$executeRawUnsafe('SET LOCAL ROLE "'+role+'"');
    await tx.$queryRawUnsafe("SELECT set_config('app.marketing_tenant_id',$1,true)",a);
    return {
     crossTenant:await tx.$executeRawUnsafe(
      'UPDATE "OutboxEvent" SET attempts=100 WHERE "organizationId"=$1',b),
     deleteOwn:await tx.$executeRawUnsafe(
      'DELETE FROM "OutboxEvent" WHERE "organizationId"=$1',a)
    };
   });
   expect(denied).toEqual({crossTenant:0,deleteOwn:0});
   await expect(db.$transaction(async tx=>{
    await tx.$executeRawUnsafe('SET LOCAL ROLE "'+role+'"');
    return tx.$executeRawUnsafe(
     'INSERT INTO "OutboxEvent"("id","organizationId","eventId","eventType","aggregateType","aggregateId","payload","correlationId") VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)',
     randomUUID(),a,randomUUID(),kind,'Fake','x','{}',randomUUID());
   })).rejects.toThrow();
  }finally{
   if(created){
    await db.$executeRawUnsafe('REVOKE ALL ON "OutboxEvent" FROM "'+role+'"');
    await db.$executeRawUnsafe('DROP ROLE IF EXISTS "'+role+'"');
   }
   await db.$disconnect();
  }
 },90000);
 it('T15-026 two-tenant canonical publisher and InboxService deliver simulated events only',async()=>{
  const db=new PrismaClient(),a=org('worker-a'),b=org('worker-b');
  const kind='R3T_INTERNAL_'+randomUUID().replaceAll('-','');
  try{
   await db.$connect();
   const first=await seed(db,a,kind),second=await seed(db,b,kind);
   const inbox=new InboxService(db as any);
   const tenants=await db.organization.findMany({where:{id:{in:[a,b]}},
    select:{id:true},orderBy:{id:'asc'}});
   const scopedDb:any={$transaction:db.$transaction.bind(db),
    organization:{findMany:vi.fn(async(arg:any)=>tenants.filter(t=>
      !arg.where?.id?.gt||t.id>arg.where.id.gt).slice(0,arg.take))}};
   const publisher=new OutboxPublisherService(scopedDb);
   const receipts:string[]=[];
   const transport={publish:async(event:{eventId:string;organizationId:string})=>{
    const claimed=await inbox.begin(event.organizationId,'r3t-internal-test',event.eventId);
    if(!claimed.duplicate)await inbox.complete(event.organizationId,claimed.id);
    receipts.push(event.organizationId);
   }};
   const result=await publisher.publishBatch(transport,5,[kind]);
   expect(result).toEqual({published:2,failed:0});
   expect(receipts.sort()).toEqual([a,b].sort());
   expect(scopedDb.organization.findMany).toHaveBeenCalled();
   for(const {tenant,id} of [{tenant:a,id:first.id},{tenant:b,id:second.id}]){
    expect(await withMarketingTenant(db,tenant,tx=>tx.outboxEvent.count({
     where:{organizationId:tenant,id,publishedAt:{not:null}}}))).toBe(1);
    expect(await withMarketingTenant(db,tenant,tx=>tx.inboxEvent.count({
     where:{organizationId:tenant,consumerName:'r3t-internal-test',
      status:'PROCESSED'}}))).toBe(1);
    expect((await new DeliveryOperationsService(db as any).summary(tenant)).deadLetters).toBe(0);
   }
   expect(await db.publicationAttempt.count({where:{
    organizationId:{in:[a,b]},mode:'REMOTE'}})).toBe(0);
  }finally{await db.$disconnect();}
 },90000);
});
