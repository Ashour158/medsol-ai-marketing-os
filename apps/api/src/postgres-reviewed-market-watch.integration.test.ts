import {describe,it,expect} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {MarketingLearningService} from './marketing-learning.service.js';
import {withMarketingTenant} from './prisma.service.js';
import {permissionForMarketingRoute} from './marketing-permissions.js';
const enabled=process.env.MARKETING_DB_INTEGRATION==='1';
describe('T1 durable reviewed-evidence watch',()=>{
 it('requires review authority and exposes no crawler',()=>{
  expect(permissionForMarketingRoute('GET','/marketing/learning/watches')).toBe('READ_AUDIT');
  expect(permissionForMarketingRoute('POST','/marketing/learning/watches')).toBe('DECIDE_APPROVAL');
  expect(permissionForMarketingRoute('POST','/marketing/learning/watches/watch-1/transition')).toBe('DECIDE_APPROVAL');
  expect(()=>permissionForMarketingRoute('POST','/marketing/learning/watches/watch-1/crawl')).toThrow();
 });
 it.skipIf(!enabled)('persists a due baseline and evidence delta, prevents early or stale evaluations and isolates tenants',async()=>{
  const db=new PrismaClient(),org='watch-'+randomUUID(),foreign='watch-other-'+randomUUID();
  const actor=(organizationId:string,role:string)=>{const userId=randomUUID();return{organizationId,
   userId,role,subject:'oidc-'+userId,email:userId+'@example.invalid'};};
  const manager=actor(org,'ADMIN'),other=actor(foreign,'ADMIN'),viewer=actor(org,'VIEWER');
  try{
   await db.organization.createMany({data:[{id:org,name:'Watch test'},{id:foreign,name:'Other watch'}]});
   await db.user.createMany({data:[manager,other,viewer].map(a=>({id:a.userId,organizationId:a.organizationId,
    role:a.role,oidcSubject:a.subject,email:a.email,name:'Test actor'}))});
   const service=new MarketingLearningService(db as any);
   const input={topic:'Genomics',sector:'Life Sciences',intervalHours:24};
   const a=await service.createReviewedWatch(org,manager,input);
   expect(a).toMatchObject({version:1,due:true,topic:'genomics',sector:'life sciences',replayed:false});
   expect(await service.createReviewedWatch(org,manager,{...input,topic:'GENOMICS'})).toMatchObject({watchId:a.watchId,replayed:true});
   await expect(service.createReviewedWatch(org,manager,{...input,intervalHours:72})).rejects.toThrow('different interval');
   await expect(service.createReviewedWatch(org,viewer,input)).rejects.toThrow('Marketing permission denied');
   await expect(service.listReviewedWatches(org,other)).rejects.toThrow('Verified tenant watch');
   expect((await service.listReviewedWatches(foreign,other)).watches).toEqual([]);
   const add=async(status:string,topic='Genomics',tenant=org)=>{
    const id=randomUUID();
    await withMarketingTenant(db,tenant,tx=>tx.learningSignal.create({data:{
     id,organizationId:tenant,fingerprint:randomUUID(),topic,sector:'Life Sciences',sourceUrl:'https://example.org/'+id,
     sourceTitle:'Synthetic source',observedAt:new Date(Date.now()-1000),evidence:{summary:'Synthetic test evidence'},status
    }}));return id;
   };
   const first=await add('REVIEWED');
   await add('QUARANTINED');await add('REVIEWED','Unrelated');await add('REVIEWED','Genomics',foreign);
   const change=(action:string,expectedVersion:number)=>service.transitionReviewedWatch(org,manager,a.watchId,{action,expectedVersion});
   const baseline=await change('EVALUATE_DUE',1);
   expect(baseline).toMatchObject({version:2,due:false,lastEvaluation:{status:'BASELINE',evidenceCount:1,addedCount:1,
    addedSignalIds:[first],independentVerification:false}});
   await expect(change('EVALUATE_DUE',2)).rejects.toThrow('not due');
   await expect(change('PAUSE',1)).rejects.toThrow('revision changed');
   expect(await change('PAUSE',2)).toMatchObject({status:'PAUSED',version:3});
   await expect(change('EVALUATE_DUE',3)).rejects.toThrow('not due');
   const second=await add('REVIEWED');
   expect(await change('RESUME',3)).toMatchObject({version:4,due:true});
   const delta=await change('EVALUATE_DUE',4);
   expect(delta).toMatchObject({version:5,lastEvaluation:{status:'EVIDENCE_CHANGED',evidenceCount:2,addedCount:1,
    removedCount:0,addedSignalIds:[second]},externalAcquisitionEnabled:false,automaticExecutionEnabled:false});
   expect((await new MarketingLearningService(db as any).listReviewedWatches(org,manager)).watches[0]).toMatchObject({version:5});
   await expect(service.transitionReviewedWatch(foreign,other,a.watchId,{action:'PAUSE',expectedVersion:5})).rejects.toThrow('not found');
   await expect(withMarketingTenant(db,org,tx=>tx.marketingResearchWatch.update({where:{id:a.watchId},
    data:{topic:'different',version:6}}))).rejects.toThrow();
   const audit=await withMarketingTenant(db,org,tx=>tx.auditEvent.count({where:{organizationId:org,objectType:'MarketingResearchWatch',objectId:a.watchId}}));
   expect(audit).toBe(5);
   const role='watch_probe_'+randomUUID().replaceAll('-','').slice(0,16);
   await db.$executeRawUnsafe('CREATE ROLE "'+role+'" NOLOGIN');
   try{
    await db.$executeRawUnsafe('GRANT SELECT ON "MarketingResearchWatch" TO "'+role+'"');
    const result=await db.$transaction(async tx=>{
     await tx.$executeRawUnsafe('SET LOCAL ROLE "'+role+'"');
     const count=async()=>Number((await tx.$queryRaw<Array<{n:bigint}>>`SELECT count(*) AS n FROM "MarketingResearchWatch"`)[0]?.n);
     const absent=await count();
     await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id',${org},true)`;
     const own=await count();
     await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id',${foreign},true)`;
     return[absent,own,await count()];
    });expect(result).toEqual([0,1,0]);
   }finally{
    await db.$executeRawUnsafe('REVOKE SELECT ON "MarketingResearchWatch" FROM "'+role+'"');
    await db.$executeRawUnsafe('DROP ROLE "'+role+'"');
   }

   // Actual due evaluation must be opted-in, globally configured and authorized
   // by a currently active manager. Competing workers cannot duplicate it.
   const auto=await service.createReviewedWatch(org,manager,{topic:'Automation fixture',sector:'Life Sciences',intervalHours:24});
   const disabled=await service.createReviewedWatch(org,manager,{topic:'Manual only fixture',sector:'Life Sciences',intervalHours:24});
   const previousBrain=process.env.MARKETING_BRAIN_WORKER_ENABLED;
   const previousWatch=process.env.MARKETING_REVIEWED_WATCH_WORKER_ENABLED;
   try{
    process.env.MARKETING_BRAIN_WORKER_ENABLED='true';
    process.env.MARKETING_REVIEWED_WATCH_WORKER_ENABLED='false';
    expect(await service.runDueReviewedWatches(org)).toMatchObject({enabled:false,evaluated:0});
    const auth=await service.transitionReviewedWatch(org,manager,auto.watchId,{action:'ENABLE_AUTOMATION',expectedVersion:1});
    expect(auth).toMatchObject({version:2,automaticEvaluationAuthorized:true,automaticExecutionEnabled:false});
    process.env.MARKETING_REVIEWED_WATCH_WORKER_ENABLED='true';
    const runs=await Promise.all([service.runDueReviewedWatches(org),service.runDueReviewedWatches(org)]);
    expect(runs.reduce((n,x)=>n+x.evaluated,0)).toBe(1);
    const list=await service.listReviewedWatches(org,manager);
    expect(list.watches.find(x=>x.watchId===auto.watchId)).toMatchObject({version:3,due:false,lastEvaluation:{status:'BASELINE'}});
    expect(list.watches.find(x=>x.watchId===disabled.watchId)).toMatchObject({version:1,automaticEvaluationAuthorized:false,lastEvaluatedAt:null});
    const log=await withMarketingTenant(db,org,tx=>tx.auditEvent.findMany({where:{objectId:auto.watchId,action:'REVIEWED_WATCH_AUTOMATIC_EVALUATION'}}));
    expect(log).toHaveLength(1);expect(log[0]).toMatchObject({actorType:'SYSTEM',actorId:'market-watch-scheduler'});
    expect(await service.transitionReviewedWatch(org,manager,auto.watchId,{action:'DISABLE_AUTOMATION',expectedVersion:3}))
     .toMatchObject({version:4,automaticEvaluationAuthorized:false});
    const revoked=await service.createReviewedWatch(org,manager,{topic:'Revoked sponsor fixture',sector:'Life Sciences',intervalHours:24});
    await service.transitionReviewedWatch(org,manager,revoked.watchId,{action:'ENABLE_AUTOMATION',expectedVersion:1});
    await withMarketingTenant(db,org,tx=>tx.user.update({where:{id:manager.userId},data:{disabledAt:new Date()}}));
    expect(await service.runDueReviewedWatches(org)).toMatchObject({paused:1,evaluated:0});
    const stopped=await withMarketingTenant(db,org,tx=>tx.marketingResearchWatch.findFirstOrThrow({where:{id:revoked.watchId}}));
    expect(stopped).toMatchObject({status:'PAUSED',automaticAuthorizedBy:null,lastEvaluatedAt:null,version:3});
   }finally{
    if(previousBrain===undefined)delete process.env.MARKETING_BRAIN_WORKER_ENABLED;else process.env.MARKETING_BRAIN_WORKER_ENABLED=previousBrain;
    if(previousWatch===undefined)delete process.env.MARKETING_REVIEWED_WATCH_WORKER_ENABLED;else process.env.MARKETING_REVIEWED_WATCH_WORKER_ENABLED=previousWatch;
   }
  }finally{await db.$disconnect();}
 },90000);
});
