import {describe,it,expect,vi} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {withMarketingTenant} from './prisma.service.js';
import {OutboxPublisherService,MAX_DELIVERY_ATTEMPTS} from './outbox-publisher.service.js';
import {DeliveryOperationsService} from './delivery-operations.service.js';
import {OutboxService} from './outbox.service.js';

const enabled=process.env.MARKETING_DB_INTEGRATION==='1';
const org=(name:string)=>'r3t-'+name+'-'+randomUUID();
const KIND='R3T_INTERNAL_PROBE';
async function seed(db:PrismaClient,tenant:string,attempts=0){
 await db.organization.create({data:{id:tenant,name:'Synthetic outbox isolation tenant'}});
 return withMarketingTenant(db,tenant,tx=>tx.outboxEvent.create({data:{
  organizationId:tenant,eventId:randomUUID(),eventType:KIND,
  aggregateType:'SyntheticProbe',aggregateId:randomUUID(),
  attempts,correlationId:randomUUID(),
  payload:{simulationOnly:true,customerPublishingAuthorized:false}
 }}));
}
function tenantOnlyProxy(db:PrismaClient,ids:string[]){
 const sorted=[...ids].sort();
 // Only override organizational discovery; real PostgreSQL transactions
 // still execute through the canonical Prisma client and FORCE RLS.
 return {$transaction:db.$transaction.bind(db),
  organization:{findMany:vi.fn(async ({where}:any)=>sorted.filter(id=>
   !where?.id?.gt||id>where.id).map(id=>({id})))}} as any;
}
describe.skipIf(!enabled)('R3-T real PostgreSQL complete tenant FORCE RLS and scoped durable outbox dispatcher',()=>{
 it('T01-016 non-BYPASSRLS outbox denies unset context, foreign reads/writes and deletion',async()=>{
  const db=new PrismaClient(),a=org('left'),b=org('right');
  const role='r3t_probe_'+randomUUID().replaceAll('-','').slice(0,14);
  let created=false;
  try{
   await db.$connect();await seed(db,a);await seed(db,b);
   await db.$executeRawUnsafe('CREATE ROLE "'+role+'" NOLOGIN');created=true;
   await db.$executeRawUnsafe('GRANT SELECT,INSERT,UPDATE,DELETE ON "OutboxEvent" TO "'+role+'"');
   const counts=async(tenant:string|null)=>db.$transaction(async tx=>{
    await tx.$executeRawUnsafe('SET LOCAL ROLE "'+role+'"');
    if(tenant)await tx.$queryRawUnsafe("SELECT set_config('app.marketing_tenant_id',$1,true)",tenant);
    const rows=await tx.$queryRawUnsafe<Array<{n:number}>>(
      'SELECT count(*)::int n FROM "OutboxEvent"');
    return rows[0]?.n??-1;
   });
   expect(await counts(null)).toBe(0);
   expect(await counts(a)).toBe(1);
   expect(await counts(b)).toBe(1);
   expect(await counts(null)).toBe(0);
   const [foreignWrite,foreignDelete,ownDelete]=await db.$transaction(async tx=>{
    await tx.$executeRawUnsafe('SET LOCAL ROLE "'+role+'"');
    await tx.$queryRawUnsafe("SELECT set_config('app.marketing_tenant_id',$1,true)",a);
    const change=await tx.$executeRawUnsafe('UPDATE "OutboxEvent" SET "attempts"=99 WHERE "organizationId"=$1',b);
    const eraseOther=await tx.$executeRawUnsafe('DELETE FROM "OutboxEvent" WHERE "organizationId"=$1',b);
    const eraseMine=await tx.$executeRawUnsafe('DELETE FROM "OutboxEvent" WHERE "organizationId"=$1',a);
    return [change,eraseOther,eraseMine];
   });
   expect([foreignWrite,foreignDelete,ownDelete]).toEqual([0,0,0]);
   await expect(db.$transaction(async tx=>{
    await tx.$executeRawUnsafe('SET LOCAL ROLE "'+role+'"');
    return tx.$executeRawUnsafe(
     'INSERT INTO "OutboxEvent"("id","organizationId","eventId","eventType","aggregateType","aggregateId","correlationId","payload") VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)',
     randomUUID(),a,randomUUID(),KIND,'SyntheticProbe',randomUUID(),
     randomUUID(),JSON.stringify({forged:true}));
   })).rejects.toThrow();
  }finally{
   if(created){
    await db.$executeRawUnsafe('REVOKE ALL ON "OutboxEvent" FROM "'+role+'"');
    await db.$executeRawUnsafe('DROP ROLE IF EXISTS "'+role+'"');
   }
   await db.$disconnect();
  }
 },90000);
 it('T15-027 real scoped CAS publisher handles two synthetic tenants exactly once and no external messages',async()=>{
  const db=new PrismaClient(),a=org('dispatch-a'),b=org('dispatch-b');
  try{
   await db.$connect();
   const [eventA,eventB]=await Promise.all([seed(db,a),seed(db,b)]);
   const received:string[]=[];
   const publisher=new OutboxPublisherService(tenantOnlyProxy(db,[a,b]));
   const transport={publish:vi.fn(async(event:any)=>{
    expect(event.eventType).toBe(KIND);
    expect(event.payload).toMatchObject({
      simulationOnly:true,customerPublishingAuthorized:false});
    received.push(event.organizationId+':'+event.eventId);
   })};
   expect(await publisher.publishBatch(transport,2,[KIND])).toEqual({published:2,failed:0});
   expect(received.sort()).toEqual([a+':'+eventA.eventId,b+':'+eventB.eventId].sort());
   expect(transport.publish).toHaveBeenCalledTimes(2);
   expect(await publisher.publishBatch(transport,2,[KIND])).toEqual({published:0,failed:0});
   const monitor=new DeliveryOperationsService(db as any);
   expect(await monitor.summary(a)).toMatchObject({pending:0,retrying:0,deadLetters:0});
   expect(await monitor.summary(b)).toMatchObject({pending:0,retrying:0,deadLetters:0});
   expect(await new OutboxService(db as any).pending(a)).toEqual([]);
   expect(await db.publicationAttempt.count({where:{organizationId:{in:[a,b]},mode:'REMOTE'}})).toBe(0);
  }finally{await db.$disconnect();}
 },90000);
 it('T15-028 failed synthetic transport CAS dead-letters after bounded attempts and never silently replays',async()=>{
  const db=new PrismaClient(),a=org('dead-letter');
  try{
   await db.$connect();
   const row=await seed(db,a,MAX_DELIVERY_ATTEMPTS-1);
   const publisher=new OutboxPublisherService(tenantOnlyProxy(db,[a]));
   const transport={publish:vi.fn(async()=>{throw new Error('synthetic unreachable transport');})};
   expect(await publisher.publishBatch(transport,1,[KIND])).toEqual({published:0,failed:1});
   const result=await withMarketingTenant(db,a,tx=>tx.outboxEvent.findUniqueOrThrow({where:{id:row.id}}));
   expect(result.attempts).toBe(MAX_DELIVERY_ATTEMPTS);
   expect(result.deadLetteredAt).toBeInstanceOf(Date);
   expect(result.publishedAt).toBeNull();
   expect(await publisher.publishBatch(transport,1,[KIND])).toEqual({published:0,failed:0});
   expect(transport.publish).toHaveBeenCalledTimes(1);
   expect(await new DeliveryOperationsService(db as any).summary(a)).toMatchObject({deadLetters:1,pending:0});
  }finally{await db.$disconnect();}
 },90000);
});
