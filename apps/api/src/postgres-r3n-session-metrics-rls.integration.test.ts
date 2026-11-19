import {describe,it,expect} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {AuthSessionService} from './auth-session.service.js';
import {MarketingPerformanceService} from './marketing-performance.service.js';
import {withMarketingTenant} from './prisma.service.js';

const enabled=process.env.MARKETING_DB_INTEGRATION==='1';
const org=(suffix:string)=>'r3n-'+suffix+'-'+randomUUID();
const later=()=>Date.now()+600000;
const when=()=>new Date(Date.now()-120000).toISOString();
async function campaign(db:PrismaClient,organizationId:string){
 await db.organization.create({data:{id:organizationId,name:'R3N synthetic tenant'}});
 const objective=await db.marketingObjective.create({data:{organizationId,
  name:'Synthetic scientific objective',description:'Offline evidence'}});
 return (await db.campaign.create({data:{organizationId,
  code:'r3n-'+randomUUID(),name:'Scientific review',
  objectiveId:objective.id}})).id;
}
async function cleanMetrics(db:PrismaClient,ids:string[]){
 await db.auditEvent.deleteMany({where:{organizationId:{in:ids}}});
 for(const id of ids)await withMarketingTenant(db,id,tx=>
  tx.marketingMetricObservation.deleteMany({where:{organizationId:id}}));
 await db.campaign.deleteMany({where:{organizationId:{in:ids}}});
 await db.marketingObjective.deleteMany({where:{organizationId:{in:ids}}});
 await db.organization.deleteMany({where:{id:{in:ids}}});
}
const input=(campaignId:string,sourceRecordId:string,time=when())=>({
 campaignId,sourceSystem:'MANUAL_EXPORT',sourceRecordId,metricKey:'clicks',
 value:17,observedAt:time,sourceReference:'internal:r3n-offline-evidence'
});
const setTenant=(tx:unknown,tenant:string)=>
 (tx as { $queryRawUnsafe:(sql:string,...args:unknown[])=>Promise<unknown>})
 .$queryRawUnsafe("SELECT set_config('app.marketing_tenant_id',$1,true)",tenant);

describe.skipIf(!enabled)('R3-N real PostgreSQL tenant isolation and RLS acceptance',()=>{
 it('T01-010 FORCE RLS hides unscoped and cross-tenant OIDC sessions and prevents reactivation',async()=>{
  const db=new PrismaClient(),a=org('auth-a'),b=org('auth-b');
  const role='r3n_auth_'+randomUUID().replaceAll('-','').slice(0,19);
  let roleCreated=false,seeded=false;
  try{
   await db.$connect();
   await db.organization.createMany({data:[{id:a,name:'Auth A'},{id:b,name:'Auth B'}]});
   seeded=true;
   const uA=await db.user.create({data:{organizationId:a,name:'OIDC A',role:'ADMIN',
    email:'a-'+randomUUID()+'@example.invalid',oidcSubject:'sub-'+randomUUID()}});
   const uB=await db.user.create({data:{organizationId:b,name:'OIDC B',role:'ADMIN',
    email:'b-'+randomUUID()+'@example.invalid',oidcSubject:'sub-'+randomUUID()}});
   const auth=new AuthSessionService(db as any);
   const sa=await auth.register(a,uA.id,later()),sb=await auth.register(b,uB.id,later());
   expect(await db.authSession.count()).toBe(0);
   await db.$executeRawUnsafe('CREATE ROLE "'+role+'" NOLOGIN');roleCreated=true;
   await db.$executeRawUnsafe('GRANT SELECT ON "AuthSession" TO "'+role+'"');
   const inspect=async(tenant:string|null)=>db.$transaction(async tx=>{
    await tx.$executeRawUnsafe('SET LOCAL ROLE "'+role+'"');
    if(tenant)await setTenant(tx,tenant);
    return tx.$queryRawUnsafe<Array<{id:string}>>('SELECT "id" FROM "AuthSession" ORDER BY "id"');
   });
   expect(await inspect(null)).toEqual([]);
   expect((await inspect(a)).map(x=>x.id)).toEqual([sa.sessionId]);
   expect((await inspect(b)).map(x=>x.id)).toEqual([sb.sessionId]);
   expect(await inspect(null)).toEqual([]);
   await expect(auth.revoke(b,uB.id,sa.sessionId)).rejects.toThrow('not active');
   await expect(withMarketingTenant(db,a,tx=>tx.authSession.update({
    where:{id:sa.sessionId},data:{expiresAt:new Date(Date.now()+300000)}})))
    .rejects.toThrow();
   await expect(auth.revoke(a,uA.id,sa.sessionId)).resolves.toEqual({revoked:true});
   await expect(auth.revoke(a,uA.id,sa.sessionId)).rejects.toThrow('not active');
   await expect(withMarketingTenant(db,a,tx=>tx.authSession.update({
    where:{id:sa.sessionId},data:{revokedAt:null}}))).rejects.toThrow();
   const old=await withMarketingTenant(db,a,tx=>tx.authSession.findUniqueOrThrow({
    where:{id:sa.sessionId}}));
   expect(old.revokedAt).toBeInstanceOf(Date);
  }finally{
   if(roleCreated){
    await db.$executeRawUnsafe('REVOKE SELECT ON "AuthSession" FROM "'+role+'"');
    await db.$executeRawUnsafe('DROP ROLE IF EXISTS "'+role+'"');
   }
   if(seeded){
    for(const tenant of [a,b])await withMarketingTenant(db,tenant,tx=>
     tx.authSession.deleteMany({where:{organizationId:tenant}}));
    await db.user.deleteMany({where:{organizationId:{in:[a,b]}}});
    await db.organization.deleteMany({where:{id:{in:[a,b]}}});
   }
   await db.$disconnect();
  }
 },90000);

 it('T13-002 FORCE RLS partitions metric evidence under a non-BYPASSRLS principal',async()=>{
  const db=new PrismaClient(),a=org('metric-a'),b=org('metric-b');
  const role='r3n_metric_'+randomUUID().replaceAll('-','').slice(0,19);
  let created=false,seeded=false;
  try{
   await db.$connect();
   const ca=await campaign(db,a),cb=await campaign(db,b);seeded=true;
   const metrics=new MarketingPerformanceService(db as any);
   const oa=await metrics.ingest(a,'author-a',input(ca,'shared-record'));
   const ob=await metrics.ingest(b,'author-b',input(cb,'shared-record'));
   expect(oa.observationId).not.toBe(ob.observationId);
   expect(await db.marketingMetricObservation.count()).toBe(0);
   await db.$executeRawUnsafe('CREATE ROLE "'+role+'" NOLOGIN');created=true;
   await db.$executeRawUnsafe('GRANT SELECT,UPDATE ON "MarketingMetricObservation" TO "'+role+'"');
   const inspect=async(tenant:string|null)=>db.$transaction(async tx=>{
    await tx.$executeRawUnsafe('SET LOCAL ROLE "'+role+'"');
    if(tenant)await setTenant(tx,tenant);
    return tx.$queryRawUnsafe<Array<{id:string}>>(
     'SELECT "id" FROM "MarketingMetricObservation" ORDER BY "id"');
   });
   expect(await inspect(null)).toEqual([]);
   expect((await inspect(a)).map(x=>x.id)).toEqual([oa.observationId]);
   expect((await inspect(b)).map(x=>x.id)).toEqual([ob.observationId]);
   expect(await inspect(null)).toEqual([]);
   const denied=await db.$transaction(async tx=>{
    await tx.$executeRawUnsafe('SET LOCAL ROLE "'+role+'"');
    await setTenant(tx,a);
    return tx.$executeRawUnsafe(
     'UPDATE "MarketingMetricObservation" SET "status"=$1,'+
     '"reviewedBy"=$2,"reviewedAt"=now() WHERE "id"=$3',
     'REVIEWED','forged-reviewer',ob.observationId);
   });
   expect(denied).toBe(0);
   expect((await metrics.list(a)).map(x=>x.id)).toEqual([oa.observationId]);
   expect((await metrics.list(b)).map(x=>x.id)).toEqual([ob.observationId]);
   expect((await metrics.summary(b,cb)).totals).toEqual({});
  }finally{
   if(created){
    await db.$executeRawUnsafe('REVOKE SELECT,UPDATE ON "MarketingMetricObservation" FROM "'+role+'"');
    await db.$executeRawUnsafe('DROP ROLE IF EXISTS "'+role+'"');
   }
   if(seeded)await cleanMetrics(db,[a,b]);
   await db.$disconnect();
  }
 },90000);

 it('T13-003 database refuses changed metrics, self-approval and post-review reassignment',async()=>{
  const db=new PrismaClient(),a=org('immutable');let seeded=false;
  try{
   await db.$connect();
   const ca=await campaign(db,a);seeded=true;
   const svc=new MarketingPerformanceService(db as any);
   const row=await svc.ingest(a,'author',input(ca,'review-evidence'));
   await expect(withMarketingTenant(db,a,tx=>
    tx.marketingMetricObservation.update({where:{id:row.observationId},
     data:{value:999n}}))).rejects.toThrow();
   await expect(withMarketingTenant(db,a,tx=>
    tx.marketingMetricObservation.update({where:{id:row.observationId},
     data:{status:'REVIEWED',reviewedBy:'author',reviewedAt:new Date()}})))
    .rejects.toThrow();
   await expect(svc.review(a,'author',row.observationId,
    'Invalid self-review of own source submission')).rejects.toThrow('Independent');
   expect(await svc.review(a,'independent-reviewer',row.observationId,
    'Compared source export and its campaign provenance')).toMatchObject({
     status:'REVIEWED',independentlyVerified:false,externalEffectsAuthorized:false});
   await expect(withMarketingTenant(db,a,tx=>
    tx.marketingMetricObservation.update({where:{id:row.observationId},
     data:{reviewedBy:'forged-reviewer'}}))).rejects.toThrow();
   await expect(withMarketingTenant(db,a,tx=>
    tx.marketingMetricObservation.update({where:{id:row.observationId},
     data:{value:100000n}}))).rejects.toThrow();
   expect((await svc.summary(a,ca)).totals.clicks).toBe('17');
   expect(await db.auditEvent.count({where:{organizationId:a,
    action:'MARKETING_METRIC_REVIEWED'}})).toBe(1);
   expect(await db.modelUsage.count({where:{organizationId:a}})).toBe(0);
  }finally{
   if(seeded)await cleanMetrics(db,[a]);
   await db.$disconnect();
  }
 },90000);

 it('T15-022 concurrent ingesters preserve one authoritative source receipt without provider effects',async()=>{
  const db=new PrismaClient(),a=org('metric-race');let seeded=false;
  try{
   await db.$connect();
   const ca=await campaign(db,a);seeded=true;
   const svc1=new MarketingPerformanceService(db as any);
   const svc2=new MarketingPerformanceService(db as any);
   const cmd=input(ca,'race-'+randomUUID());
   const settled=await Promise.allSettled(Array.from({length:8},(_,i)=>
    (i%2?svc1:svc2).ingest(a,'synthetic-submitter',cmd)));
   expect(settled.some(x=>x.status==='fulfilled')).toBe(true);
   expect(await withMarketingTenant(db,a,tx=>tx.marketingMetricObservation.count({
    where:{organizationId:a,sourceRecordId:cmd.sourceRecordId}}))).toBe(1);
   expect(await svc1.ingest(a,'synthetic-submitter',cmd))
    .toMatchObject({replayed:true,status:'QUARANTINED'});
   expect(await db.auditEvent.count({where:{organizationId:a}})).toBe(0);
   expect(await db.outboxEvent.count({where:{organizationId:a}})).toBe(0);
   expect(await db.modelUsage.count({where:{organizationId:a}})).toBe(0);
  }finally{
   if(seeded)await cleanMetrics(db,[a]);
   await db.$disconnect();
  }
 },90000);
});
