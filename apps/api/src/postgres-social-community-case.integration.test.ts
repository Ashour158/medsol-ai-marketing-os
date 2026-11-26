import {describe,it,expect} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {ApprovalService} from './approval.service.js';
import {SocialCommunityCaseService} from './social-community-case.service.js';
import {withMarketingTenant} from './prisma.service.js';
import {permissionForMarketingRoute} from './marketing-permissions.js';
const enabled=process.env.MARKETING_DB_INTEGRATION==='1';
describe('T1 durable offline community case lifecycle',()=>{
 it('registers only internal case operations, no autonomous reply',()=>{
  expect(permissionForMarketingRoute('GET','/marketing/social/cases')).toBe('ASSESS');
  expect(permissionForMarketingRoute('POST','/marketing/social/cases')).toBe('ASSESS');
  expect(permissionForMarketingRoute('POST','/marketing/social/cases/id-1/transition')).toBe('ASSESS');
  expect(()=>permissionForMarketingRoute('POST','/marketing/social/cases/id-1/reply')).toThrow();
 });
 it.skipIf(!enabled)('creates, deduplicates, assigns, independently closes and reopens in actual PostgreSQL',async()=>{
  const db=new PrismaClient(),org='community-'+randomUUID(),foreign='community-other-'+randomUUID(),
   brandId=randomUUID(),otherBrand=randomUUID();
  const actor=(organizationId:string,role:string)=>{const userId=randomUUID();return{
   organizationId,userId,subject:'oidc-'+userId,email:userId+'@example.invalid',role};};
  const author=actor(org,'ADMIN'),reviewer=actor(org,'ADMIN'),operator=actor(org,'MARKETING_SPECIALIST'),
   outsider=actor(foreign,'ADMIN'),viewer=actor(org,'VIEWER');
  try{
   await db.organization.createMany({data:[{id:org,name:'Synthetic community'},{id:foreign,name:'Other tenant'}]});
   await db.user.createMany({data:[author,reviewer,operator,outsider,viewer].map(x=>({
    id:x.userId,organizationId:x.organizationId,role:x.role,email:x.email,name:'Synthetic actor',oidcSubject:x.subject}))});
   await db.brand.createMany({data:[
    {id:brandId,organizationId:org,slug:'community',name:'Test brand',createdBy:author.userId},
    {id:otherBrand,organizationId:foreign,slug:'other',name:'Other brand',createdBy:outsider.userId}]});
   const service=new SocialCommunityCaseService(db as any);
   const approvals=new ApprovalService(db as any,{completeAfterApproval:async()=>{},blockAfterApprovalRejection:async()=>{}} as any);
   const raw={brandId,discussionId:'fixture-'+randomUUID(),
    text:'Could you explain whether this is a guaranteed clinical cure? private-mock-text-marker'};
   const row=await service.create(org,author,raw);
   expect(row).toMatchObject({version:1,status:'OPEN',assignedTo:null,priority:'HIGH',
    escalations:['SCIENTIFIC_REVIEW','BRAND_REVIEW'],replayed:false,syntheticOnly:true,
    externalEffectsAuthorized:false,specialistApprovalVerified:false});
   expect(JSON.stringify(row)).not.toContain('private-mock-text-marker');
   expect(await service.create(org,author,raw)).toMatchObject({caseId:row.caseId,replayed:true});
   await expect(service.create(org,author,{...raw,text:'Changed evidence'})).rejects.toThrow('different immutable evidence');
   await expect(service.create(org,viewer,raw)).rejects.toThrow('Marketing permission denied');
   await expect(service.create(org,author,{...raw,brandId:otherBrand})).rejects.toThrow('Active tenant brand');
   await expect(service.create(org,author,{...raw,discussionId:'real-provider-id'})).rejects.toThrow('fixture');
   await expect(service.create(org,author,{...raw,customerEmail:'person@example.invalid'})).rejects.toThrow('bounded');
   const foreignQueue=await service.list(foreign,outsider,otherBrand);
   expect(foreignQueue.cases).toEqual([]);
   expect(foreignQueue.queueSummary).toMatchObject({activeCount:0,overdueCount:0,escalatedCount:0,withoutDeadlineCount:0,externalNotificationAuthorized:false});
   const initialQueue=await service.list(org,author,brandId);
   expect(initialQueue.queueSummary).toMatchObject({activeCount:1,overdueCount:0,escalatedCount:0,withoutDeadlineCount:0});
   const transition=(identity:typeof author,action:string,expectedVersion:number)=>
    service.transition(identity.organizationId,identity,row.caseId,{action,expectedVersion});
   await expect(transition(outsider,'CLAIM',1)).rejects.toThrow('not found');
   await expect(transition(author,'CLOSE_INTERNAL',1)).rejects.toThrow('await review');
   const claimed=await transition(operator,'CLAIM',1);
   expect(claimed).toMatchObject({version:2,assignedTo:operator.userId,status:'OPEN'});
   await expect(transition(reviewer,'CLAIM',1)).rejects.toThrow('revision changed');
   await expect(transition(author,'SUBMIT_REVIEW',2)).rejects.toThrow('assigned operator');
   expect(await transition(operator,'SUBMIT_REVIEW',2)).toMatchObject({version:3,status:'PENDING_REVIEW'});
   await expect(transition(operator,'CLOSE_INTERNAL',3)).rejects.toThrow('Marketing permission denied');
   await expect(transition(author,'CLOSE_INTERNAL',3)).rejects.toThrow('Independent manager');
   await expect(transition(reviewer,'CLOSE_INTERNAL',3)).rejects.toThrow('Required independent community reviews');
   const pending=(await approvals.listPending(org)).filter(a=>a.objectId===row.caseId);
   expect(pending).toHaveLength(2);
   const decide=(approvalId:string,who:typeof author,decision:'APPROVED'|'REJECTED'='APPROVED')=>approvals.approve({
    organizationId:who.organizationId,approvalId,approverUserId:who.userId,commandId:randomUUID(),correlationId:randomUUID(),
    decision,rationale:'Independent internal synthetic risk review only'});
   await expect(decide(pending[0]!.id,author)).rejects.toThrow('Independent OIDC community review');
   await expect(decide(pending[0]!.id,outsider)).rejects.toThrow('not found');
   await decide(pending[0]!.id,reviewer);
   await expect(transition(reviewer,'CLOSE_INTERNAL',3)).rejects.toThrow('Required independent community reviews');
   await decide(pending[1]!.id,reviewer);
   expect((await service.list(org,author,brandId)).cases[0]).toMatchObject({internalSpecialistReviewComplete:true});
   expect(await transition(reviewer,'CLOSE_INTERNAL',3)).toMatchObject({version:4,status:'RESOLVED_INTERNAL',
    closedBy:reviewer.userId,specialistApprovalVerified:false,externalResolutionVerified:false});
   expect(await transition(reviewer,'REOPEN',4)).toMatchObject({version:5,status:'OPEN',assignedTo:null,closedBy:null});
   // Invalid direct writes cannot bypass the relational state machine.
   await expect(withMarketingTenant(db,org,tx=>tx.socialCommunityCase.update({where:{id:row.caseId},
    data:{status:'RESOLVED_INTERNAL',version:6,assignedTo:author.userId,closedBy:author.userId,closedAt:new Date()}}))).rejects.toThrow();
   await expect(withMarketingTenant(db,org,tx=>tx.socialCommunityCase.update({where:{id:row.caseId},
    data:{discussionDigest:'sha256:'+'f'.repeat(64),version:6,assignedTo:operator.userId}}))).rejects.toThrow();
   const audit=await withMarketingTenant(db,org,tx=>tx.auditEvent.findMany({where:{
    organizationId:org,objectType:'SocialCommunityCase',objectId:row.caseId},orderBy:{occurredAt:'asc'}}));
   expect(audit).toHaveLength(5);
   expect(JSON.stringify(audit)).not.toContain('private-mock-text-marker');
   expect(JSON.stringify(audit)).not.toContain('discussionDigest');
   expect((await service.list(org,author,brandId)).cases[0]).toMatchObject({version:5,status:'OPEN'});
   expect(await transition(operator,'CLAIM',5)).toMatchObject({version:6});
   const round2=await transition(operator,'SUBMIT_REVIEW',6);
   expect(round2).toMatchObject({version:7,reviewRound:7,internalSpecialistReviewComplete:false});
   const pending2=(await approvals.listPending(org)).filter(a=>a.objectId===row.caseId);
   expect(pending2).toHaveLength(2);expect(pending2.every(x=>!pending.some(a=>a.id===x.id))).toBe(true);
   await expect(transition(reviewer,'CLOSE_INTERNAL',7)).rejects.toThrow('Required independent community reviews');
   await transition(reviewer,'REOPEN',7);
   await expect(decide(pending2[0]!.id,reviewer)).rejects.toThrow('Current exact community review round');
   expect((await approvals.listPending(org)).filter(a=>a.objectId===row.caseId)).toEqual([]);

   // Prove RLS with a genuinely unprivileged role, not CI superuser.
   const role='community_probe_'+randomUUID().replaceAll('-','').slice(0,16);
   await db.$executeRawUnsafe('CREATE ROLE "'+role+'" NOLOGIN');
   try{
    await db.$executeRawUnsafe('GRANT SELECT ON "SocialCommunityCase" TO "'+role+'"');
    const counts=await db.$transaction(async tx=>{
     await tx.$executeRawUnsafe('SET LOCAL ROLE "'+role+'"');
     const count=async()=>Number((await tx.$queryRaw<Array<{n:bigint}>>`SELECT count(*) AS n FROM "SocialCommunityCase"`)[0]?.n);
     const absent=await count();
     await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id',${org},true)`;
     const own=await count();
     await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id',${foreign},true)`;
     return[absent,own,await count()];
    });
    expect(counts).toEqual([0,1,0]);
   }finally{
    await db.$executeRawUnsafe('REVOKE SELECT ON "SocialCommunityCase" FROM "'+role+'"');
    await db.$executeRawUnsafe('DROP ROLE "'+role+'"');
   }

   // Seed a disposable historical case using the same deadline invariant.
   // No real customer data, timer sleep or clock change is necessary.
   const past=new Date(Date.now()-5*3600000),due=new Date(past.getTime()+4*3600000),slaId=randomUUID();
   await withMarketingTenant(db,org,tx=>tx.socialCommunityCase.create({data:{
    id:slaId,organizationId:org,brandId,discussionId:'fixture-'+randomUUID(),
    discussionDigest:'sha256:'+'a'.repeat(64),disposition:'HUMAN_REVIEW_REQUIRED',escalations:['SCIENTIFIC_REVIEW'],
    priority:'HIGH',createdBy:author.userId,createdAt:past,updatedAt:past,slaDueAt:due}}));
   await service.transition(org,operator,slaId,{action:'CLAIM',expectedVersion:1});
   const slaRound=await service.transition(org,operator,slaId,{action:'SUBMIT_REVIEW',expectedVersion:2});
   expect(slaRound).toMatchObject({reviewRound:3,slaOverdue:true,slaEscalatedAt:null});
   const priorBrain=process.env.MARKETING_BRAIN_WORKER_ENABLED,priorSla=process.env.MARKETING_CRISIS_SLA_WORKER_ENABLED;
   try{
    process.env.MARKETING_BRAIN_WORKER_ENABLED='true';process.env.MARKETING_CRISIS_SLA_WORKER_ENABLED='false';
    expect(await service.escalateDueCases(org)).toMatchObject({enabled:false,escalated:0});
    process.env.MARKETING_CRISIS_SLA_WORKER_ENABLED='true';
    const outcomes=await Promise.all([service.escalateDueCases(org),service.escalateDueCases(org)]);
    expect(outcomes.reduce((n,x)=>n+x.escalated,0)).toBe(1);
    const queue=await service.list(org,reviewer,brandId);
    expect(queue.queueSummary).toMatchObject({activeCount:2,overdueCount:1,escalatedCount:1,withoutDeadlineCount:0});
    expect(queue.queueSummary.byPriority.find(x=>x.priority==='HIGH')).toEqual({priority:'HIGH',active:2,overdue:1,escalated:1,withoutDeadline:0});
    expect(queue.cases[0]?.caseId).toBe(slaId);
    const escalated=queue.cases.find(x=>x.caseId===slaId);
    expect(escalated).toMatchObject({status:'PENDING_REVIEW',version:4,reviewRound:3,slaOverdue:true});
    expect(escalated?.slaEscalatedAt).not.toBeNull();
    expect((await service.escalateDueCases(org)).escalated).toBe(0);
    const logs=await withMarketingTenant(db,org,tx=>tx.auditEvent.findMany({where:{objectId:slaId,action:'SOCIAL_CASE_SLA_ESCALATED'}}));
    expect(logs).toHaveLength(1);expect(logs[0]).toMatchObject({actorType:'SYSTEM',actorId:'community-sla-scheduler'});
    const req=(await approvals.listPending(org)).find(x=>x.objectId===slaId);
    expect(req).toBeDefined();await decide(req!.id,reviewer);
    await service.transition(org,reviewer,slaId,{action:'CLOSE_INTERNAL',expectedVersion:4});
    const closedQueue=await service.list(org,reviewer,brandId);
    expect(closedQueue.queueSummary).toMatchObject({activeCount:1,overdueCount:0,escalatedCount:0});
    expect(closedQueue.cases[0]?.caseId).toBe(row.caseId);
    const reopened=await service.transition(org,reviewer,slaId,{action:'REOPEN',expectedVersion:5});
    expect(reopened).toMatchObject({reviewRound:null,slaEscalatedAt:null,slaOverdue:false});
    expect(Date.parse(reopened.slaDueAt!)).toBeGreaterThan(Date.now());
   }finally{
    if(priorBrain===undefined)delete process.env.MARKETING_BRAIN_WORKER_ENABLED;else process.env.MARKETING_BRAIN_WORKER_ENABLED=priorBrain;
    if(priorSla===undefined)delete process.env.MARKETING_CRISIS_SLA_WORKER_ENABLED;else process.env.MARKETING_CRISIS_SLA_WORKER_ENABLED=priorSla;
   }
  }finally{await db.$disconnect();}
 },90000);
});
