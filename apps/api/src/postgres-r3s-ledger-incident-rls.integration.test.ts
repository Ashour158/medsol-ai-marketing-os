import {describe,expect,it} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {withMarketingTenant} from './prisma.service.js';
import {CampaignService} from './campaign.service.js';
import {OutboxService} from './outbox.service.js';
import {MarketingIncidentResponseService,INCIDENT_ALERT_EVENT} from './marketing-incident-response.service.js';

const enabled=process.env.MARKETING_DB_INTEGRATION==='1';
const org=(x:string)=>'r3s-'+x+'-'+randomUUID();
const TABLES=['AuditEvent','CommandReceipt','IncidentResponse'] as const;
async function counts(db:PrismaClient,principal:string,tenant:string|null){
 return db.$transaction(async tx=>{
  await tx.$executeRawUnsafe('SET LOCAL ROLE "'+principal+'"');
  if(tenant)await tx.$queryRawUnsafe(
   "SELECT set_config('app.marketing_tenant_id',$1,true)",tenant);
  const found:number[]=[];
  for(const table of TABLES){
   const rows=await tx.$queryRawUnsafe<Array<{n:number}>>(
    'SELECT count(*)::int AS n FROM "'+table+'"');
   found.push(rows[0]?.n??-1);
  }
  return found;
 });
}
async function seed(db:PrismaClient,organizationId:string){
 await db.organization.create({data:{id:organizationId,name:'Synthetic ledger tenant'}});
 await withMarketingTenant(db,organizationId,async tx=>{
  await tx.auditEvent.create({data:{organizationId,
   actorType:'SYSTEM',actorId:'offline-fixture',action:'R3S_TEST_ONLY',
   objectType:'Fixture',objectId:'root',correlationId:randomUUID()}});
  await tx.commandReceipt.create({data:{organizationId,commandId:randomUUID(),
   commandType:'R3S_FIXTURE',correlationId:randomUUID(),status:'COMPLETED'}});
  await tx.incidentResponse.create({data:{organizationId,kind:'BRAIN_STALE',
   sourceId:'synthetic-'+randomUUID(),occurrenceAt:new Date()}});
 });
}
describe.skipIf(!enabled)('R3-S real PostgreSQL append-only events, command receipts, incidents',()=>{
 it('T01-015 FORCE RLS all three canonical tables under a non-BYPASSRLS role',async()=>{
  const db=new PrismaClient(),a=org('a'),b=org('b'),
   principal='r3s_low_'+randomUUID().replaceAll('-','').slice(0,17);
  let created=false;
  try{
   await db.$connect();await seed(db,a);await seed(db,b);
   await db.$executeRawUnsafe('CREATE ROLE "'+principal+'" NOLOGIN');created=true;
   for(const t of TABLES)await db.$executeRawUnsafe(
    'GRANT SELECT,INSERT,UPDATE,DELETE ON "'+t+'" TO "'+principal+'"');
   expect(await counts(db,principal,null)).toEqual([0,0,0]);
   expect(await counts(db,principal,a)).toEqual([1,1,1]);
   expect(await counts(db,principal,b)).toEqual([1,1,1]);
   expect(await counts(db,principal,null)).toEqual([0,0,0]);
   const blocked=await db.$transaction(async tx=>{
    await tx.$executeRawUnsafe('SET LOCAL ROLE "'+principal+'"');
    await tx.$queryRawUnsafe(
     "SELECT set_config('app.marketing_tenant_id',$1,true)",a);
    const foreignUpdate=await tx.$executeRawUnsafe(
     'UPDATE "IncidentResponse" SET "lastNotifiedLevel"=0 WHERE "organizationId"=$1',b);
    const deleteAudit=await tx.$executeRawUnsafe(
     'DELETE FROM "AuditEvent" WHERE "organizationId"=$1',a);
    const deleteReceipt=await tx.$executeRawUnsafe(
     'DELETE FROM "CommandReceipt" WHERE "organizationId"=$1',a);
    return {foreignUpdate,deleteAudit,deleteReceipt};
   });
   expect(blocked).toEqual({foreignUpdate:0,deleteAudit:0,deleteReceipt:0});
   await expect(db.$transaction(async tx=>{
    await tx.$executeRawUnsafe('SET LOCAL ROLE "'+principal+'"');
    return tx.$executeRawUnsafe('INSERT INTO "AuditEvent"("id","organizationId","actorType","actorId","action","objectType","objectId","correlationId") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
     randomUUID(),a,'SYSTEM','forged','UNSCOPED','Fixture','bad',randomUUID());
   })).rejects.toThrow();
  }finally{
   if(created){
    for(const t of TABLES)await db.$executeRawUnsafe(
     'REVOKE ALL ON "'+t+'" FROM "'+principal+'"');
    await db.$executeRawUnsafe('DROP ROLE IF EXISTS "'+principal+'"');
   }
   await db.$disconnect();
  }
 },90000);
 it('T03-023 canonical campaign idempotency does not rewrite audit or receipt',async()=>{
  const db=new PrismaClient(),a=org('campaign'),b=org('foreign');
  try{
   await db.$connect();await db.organization.createMany({data:[
    {id:a,name:'Audited campaign tenant'},{id:b,name:'Other tenant'}]});
   const objective=await withMarketingTenant(db,a,tx=>tx.marketingObjective.create({
    data:{organizationId:a,name:'Offline governed campaign',description:'R3S receipt acceptance'}}));
   const service=new CampaignService(db as any,new OutboxService(db as any));
   const cmd={commandId:'r3s-'+randomUUID(),correlationId:randomUUID(),
    organizationId:a,objectiveId:objective.id,code:'R3S-'+randomUUID(),
    name:'Verified offline campaign',riskLevel:'R1' as const};
   const first=await service.create(cmd,'synthetic-proposer') as {campaignId:string};
   const again=await service.create(cmd,'synthetic-proposer');
   expect(again).toEqual(first);
   expect(await withMarketingTenant(db,a,tx=>tx.commandReceipt.count({
    where:{organizationId:a,commandId:cmd.commandId}}))).toBe(1);
   expect(await withMarketingTenant(db,a,tx=>tx.auditEvent.count({
    where:{organizationId:a,action:'CAMPAIGN_CREATED',objectId:first.campaignId}}))).toBe(1);
   expect(await withMarketingTenant(db,b,tx=>tx.commandReceipt.count({
    where:{organizationId:b,commandId:cmd.commandId}}))).toBe(0);
   expect(await withMarketingTenant(db,a,tx=>tx.outboxEvent.count({
    where:{organizationId:a,eventType:'CampaignCreated',aggregateId:first.campaignId}}))).toBe(1);
  }finally{await db.$disconnect();}
 },90000);
 it('T15-025 incident response records independent acknowledgement once, no replay or provider dispatch',async()=>{
  const db=new PrismaClient(),a=org('incident');
  try{
   await db.$connect();await db.organization.create({data:{id:a,name:'Incident acceptance'}});
   const run=await withMarketingTenant(db,a,tx=>tx.brainRun.create({data:{
    organizationId:a,commandKey:'r3s-'+randomUUID(),correlationId:randomUUID(),
    input:{offline:true},status:'NEEDS_INTERVENTION'}}));
   const service=new MarketingIncidentResponseService(db as any);
   expect((await service.scan(50,a)).queued).toBe(1);
   expect((await service.scan(50,a)).queued).toBe(0);
   const ack=await service.acknowledge(a,'BRAIN_NEEDS_INTERVENTION',run.id,'synthetic-reviewer',
    'Reviewing offline intervention evidence; do not automatically replay');
   expect(ack).toMatchObject({replay:false,sourceStatusUnchanged:true});
   expect(await service.acknowledge(a,'BRAIN_NEEDS_INTERVENTION',run.id,'synthetic-reviewer',
    'Reviewing offline intervention evidence; do not automatically replay'))
    .toMatchObject({replay:true});
   expect(await withMarketingTenant(db,a,tx=>tx.incidentResponse.count({
    where:{organizationId:a,kind:'BRAIN_NEEDS_INTERVENTION',sourceId:run.id}}))).toBe(1);
   expect(await withMarketingTenant(db,a,tx=>tx.auditEvent.count({
    where:{organizationId:a,action:'MARKETING_INCIDENT_ACKNOWLEDGED',objectId:run.id}}))).toBe(1);
   expect(await withMarketingTenant(db,a,tx=>tx.outboxEvent.count({
    where:{organizationId:a,eventType:INCIDENT_ALERT_EVENT}}))).toBe(1);
   expect(await withMarketingTenant(db,a,tx=>tx.brainRun.findUnique({
    where:{id:run.id},select:{status:true}}))).toMatchObject({status:'NEEDS_INTERVENTION'});
   expect(await db.publicationAttempt.count({where:{organizationId:a,mode:'REMOTE'}})).toBe(0);
  }finally{await db.$disconnect();}
 },90000);
});
