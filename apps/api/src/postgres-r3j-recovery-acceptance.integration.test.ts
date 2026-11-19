import {describe,it,expect} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {generateKeyPairSync,randomUUID,sign} from 'node:crypto';
import {MarketingWorkflowService} from './marketing-workflow.service.js';
import {MarketingCommandCenterService} from './marketing-command-center.service.js';
import {AgentService} from './agent.service.js';
import {ApprovalService} from './approval.service.js';
import {WorkflowLeaseService} from './workflow-lease.service.js';
import {offlineDagDigest} from './r3g-offline-dag.js';
import {permissionForMarketingRoute} from './marketing-permissions.js';

const enabled=process.env.MARKETING_DB_INTEGRATION==='1';
const draft=()=>({id:'r3j-fenced-review',version:1,nodes:[
 {id:'start',type:'TRIGGER'},
 {id:'science',type:'AGENT_TASK',agentId:'MKT-SCI-001',maxSeconds:45},
 {id:'human',type:'APPROVAL'},
 {id:'end',type:'END'}
 ],edges:[{from:'start',to:'science'},{from:'science',to:'human'},
  {from:'human',to:'end'}]});
const manifest=()=>({draft:draft(),canaryPercent:100,maxSteps:10,
 executionMode:'DETERMINISTIC_NO_MODEL'});
describe('R3-J cross-engine offline recovery and release acceptance',()=>{
 it.skipIf(!enabled)('T04-002 fences two workers, rejects stale result after prior active check, denies revoked release approval and refuses certification',async()=>{
  const db=new PrismaClient();
  const org='r3j-'+randomUUID(),foreign='r3j-other-'+randomUUID();
  const maker='r3j-maker-'+randomUUID(),checker='r3j-checker-'+randomUUID();
  const s1='r3j-sub-'+randomUUID(),s2='r3j-sub-'+randomUUID();
  const actor=(id:string,subject:string,organizationId=org)=>({
   userId:id,subject,organizationId,role:'ADMIN',
   email:id+'@example.invalid'});
  const author=actor(maker,s1),reviewer=actor(checker,s2);
  const keys=generateKeyPairSync('ed25519');
  const original={
   trusted:process.env.MARKETING_DAG_TRUSTED_PUBLIC_KEY_PEM,
   keyId:process.env.MARKETING_DAG_TRUSTED_KEY_ID,
   enabled:process.env.MARKETING_DAG_OFFLINE_EXECUTION_ENABLED,
   model:process.env.MARKETING_AI_REASONING_ENABLED};
  process.env.MARKETING_DAG_TRUSTED_PUBLIC_KEY_PEM=keys.publicKey.export({
   format:'pem',type:'spki'}).toString();
  process.env.MARKETING_DAG_TRUSTED_KEY_ID='r3j-offline-trust';
  process.env.MARKETING_DAG_OFFLINE_EXECUTION_ENABLED='true';
  delete process.env.MARKETING_AI_REASONING_ENABLED;
  try{
   await db.$connect();
   await db.organization.createMany({data:[
    {id:org,name:'R3J acceptance tenant'},{id:foreign,name:'Foreign R3J tenant'}]});
   await db.user.createMany({data:[
    {id:maker,organizationId:org,email:author.email,
     name:'R3J maker',role:'ADMIN',oidcSubject:s1},
    {id:checker,organizationId:org,email:reviewer.email,
     name:'R3J independent reviewer',role:'ADMIN',oidcSubject:s2}
   ]});
   const baseAgent=new AgentService(db as any);
   const signer=(value:ReturnType<typeof manifest>)=>sign(null,
    Buffer.from('medsol-r3g-dag-signature-v1\n'+offlineDagDigest(value)),
    keys.privateKey).toString('base64url');
   const leases=new WorkflowLeaseService(db as any);
   const flow=new MarketingWorkflowService(db as any,baseAgent,
    {} as any,leases);
   const approval=new ApprovalService(db as any,flow);
   const m=manifest(),release=await flow.dagPropose(org,author,{
    manifest:m,signature:signer(m),signerKeyId:'r3j-offline-trust'});
   await flow.dagApprove(org,reviewer,release.id,1);
   await flow.dagActivate(org,reviewer,release.id,0);
   const run1=await flow.dagLaunch(org,author,{
    blueprintId:m.draft.id,requestKey:'race-'+randomUUID(),
    objective:'Review synthetic genomics research claims'});
   expect(run1.status).toBe('RUNNING');
   if(!run1.workflowExecutionId)throw Error('Run must persist');
   let injected=false,armAfterExecution=false;
   const proxyLeases=new WorkflowLeaseService(db as any);
   const originalAssert=proxyLeases.assertActive.bind(proxyLeases);
   proxyLeases.assertActive=async lease=>{
    await originalAssert(lease);
    if(armAfterExecution&&!injected){
     injected=true;armAfterExecution=false;
     // Simulate the exact TOCTOU window: a new worker obtains the lease
     // after the old worker's in-memory assertActive but BEFORE checkpoint.
     await db.workflowExecution.updateMany({where:{
      id:lease.workflowId,organizationId:org
     },data:{leaseOwner:'successor-'+randomUUID(),
      leaseGeneration:{increment:1},
      leaseExpiresAt:new Date(Date.now()+100000)}});
    }
   };
   const proxyAgent={
    execute:async (...args:Parameters<AgentService['execute']>)=>{
     const result=await baseAgent.execute(...args);
     armAfterExecution=true;
     return result;
    }
   };
   const competing=new MarketingWorkflowService(db as any,
    proxyAgent as AgentService,{} as any,proxyLeases);
   await expect(competing.dagTick(org,author,run1.workflowExecutionId))
    .rejects.toThrow(/lease|superseded|expired|fenc/i);
   expect(injected).toBe(true);
   const wf=await db.workflowExecution.findFirstOrThrow({where:{
    id:run1.workflowExecutionId,organizationId:org}});
   expect(wf.status).toBe('RUNNING');
   expect(await db.workflowStepExecution.count({where:{
    workflowExecutionId:run1.workflowExecutionId,organizationId:org,
    stepKey:'science',status:'RUNNING'}})).toBe(1);
   const staleEvidence=await flow.dagRecoveryEvidence(org,reviewer,
    run1.workflowExecutionId);
   expect(staleEvidence).toMatchObject({
    evidenceStatus:'UNCERTAIN_STEP_REVIEW_REQUIRED',
    automaticReplayAllowed:false,
    directStepResumeAllowed:false,
    externalEffectsAuthorized:false
   });
   expect(staleEvidence.agentProofs).toHaveLength(1);
   await expect(flow.dagRecoveryEvidence(foreign,reviewer,
    run1.workflowExecutionId)).rejects.toThrow(/tenant|authority|permission/i);
   // The successor must not replay an ambiguous agent task, even if it
   // possesses a new valid lease token. It blocks and awaits investigation.
   await db.workflowExecution.updateMany({where:{
    organizationId:org,id:run1.workflowExecutionId},
    data:{leaseExpiresAt:new Date(Date.now()-60000)}});
   const blocked=await flow.dagTick(org,author,run1.workflowExecutionId);
   expect(blocked).toMatchObject({status:'BLOCKED',
    externalEffectsAuthorized:false});
   expect(await db.agentExecution.count({where:{
    organizationId:org,causationId:run1.workflowExecutionId}})).toBe(1);
   expect(await db.auditEvent.count({where:{
    organizationId:org,action:'DAG_AGENT_FENCED_CHECKPOINT',
    objectId:run1.workflowExecutionId}})).toBe(0);

   // A second ordinary run can reach a reviewed human wait.
   const run2=await flow.dagLaunch(org,author,{
    blueprintId:m.draft.id,requestKey:'approval-'+randomUUID(),
    objective:'Evaluate synthetic scientific evidence safely'});
   if(!run2.workflowExecutionId)throw Error('Run 2 must persist');
   expect((await flow.dagTick(org,author,run2.workflowExecutionId)).status)
    .toBe('WAITING_APPROVAL');
   const waiting=await db.approval.findFirstOrThrow({where:{
    organizationId:org,workflowExecutionId:run2.workflowExecutionId,
    objectType:'BlueprintWorkflowStep',decision:'PENDING'}});
   // Simulate the real crash window where the canonical Approval command
   // transaction committed APPROVED, but the process died before workflow
   // reconciliation. Revocation must beat even replayed old command evidence.
   const run3=await flow.dagLaunch(org,author,{
    blueprintId:m.draft.id,requestKey:'receipt-race-'+randomUUID(),
    objective:'Quarantine orphaned approval command after a process crash'});
   if(!run3.workflowExecutionId)throw Error('Run 3 must persist');
   expect((await flow.dagTick(org,author,run3.workflowExecutionId)).status)
    .toBe('WAITING_APPROVAL');
   const receipt=await db.approval.findFirstOrThrow({where:{
    organizationId:org,workflowExecutionId:run3.workflowExecutionId,
    objectType:'BlueprintWorkflowStep',decision:'PENDING'}});
   await db.approval.updateMany({where:{id:receipt.id,organizationId:org,
    decision:'PENDING'},data:{
    decision:'APPROVED',decidedBy:checker,decidedAt:new Date(),
    rationale:'Simulated durable approval prior to crash and revocation'}});
   await flow.dagRevoke(org,reviewer,release.id,
    'Operator kill switch after adverse security review of release');
   await flow.completeAfterApproval(run3.workflowExecutionId,org,{
    approvalId:receipt.id,decision:'APPROVED'});
   const quarantined=await db.workflowExecution.findFirstOrThrow({where:{
    id:run3.workflowExecutionId,organizationId:org}});
   expect(quarantined.status).toBe('BLOCKED');
   expect(quarantined.currentStep).toBe('REVOKED_RELEASE_APPROVAL_RECONCILIATION');
   expect(await db.auditEvent.count({where:{organizationId:org,
    action:'DAG_APPROVAL_RECEIPT_QUARANTINED',
    objectId:run3.workflowExecutionId}})).toBe(1);
   const refused={organizationId:org,commandId:randomUUID(),
    correlationId:randomUUID(),approvalId:waiting.id,
    approverUserId:checker,decision:'APPROVED' as const,
    rationale:'Independent approval must not resurrect revoked signed release'};
   await expect(approval.approve(refused)).rejects.toThrow(/revoked|untrusted/i);
   expect((await db.approval.findFirstOrThrow({where:{
    id:waiting.id,organizationId:org}})).decision).toBe('PENDING');
   expect((await flow.dagRecoveryEvidence(org,reviewer,
    run2.workflowExecutionId)).evidenceStatus)
    .toBe('RELEASE_REVOKED_OR_UNTRUSTED');
   const closed=await approval.approve({...refused,
    commandId:randomUUID(),decision:'REJECTED',
    rationale:'Operator explicitly rejects after revoked release'});
   expect(closed).toMatchObject({decision:'REJECTED'});
   expect((await db.workflowExecution.findFirstOrThrow({where:{
    id:run2.workflowExecutionId,organizationId:org}})).status)
    .toBe('BLOCKED');

   // Two real PostgreSQL clients racing for one canonical workflow lease.
   const leaseWf=await db.workflowExecution.create({data:{
    organizationId:org,workflowType:'BLUEPRINT_OFFLINE_DAG',
    correlationId:'r3j-lease-'+randomUUID(),status:'RUNNING',
    currentStep:'QUEUED',input:{simulation:true}
   }});
   const [a,b]=await Promise.allSettled([
    leases.claim(org,leaseWf.id,30000),
    new WorkflowLeaseService(db as any).claim(org,leaseWf.id,30000)
   ]);
   expect([a,b].filter(x=>x.status==='fulfilled')).toHaveLength(1);
   const winner=([a,b].find(x=>x.status==='fulfilled') as
    PromiseFulfilledResult<Awaited<ReturnType<typeof leases.claim>>>).value;
   await leases.assertActive(winner);
   await expect(leases.claim(org,leaseWf.id,30000)).rejects.toThrow('active lease');
   await leases.release(winner);
   await expect(leases.assertActive(winner)).rejects.toThrow('stale');

   const report=new MarketingCommandCenterService(
    db as any,{} as any,{} as any,{} as any,
    {} as any,{} as any);
   const observed=await report.r3ReleaseReadiness(org);
   expect(observed).toMatchObject({
    verdict:'NOT_CERTIFIED',
    productionExternalEffectsAuthorized:false,
    certificationCanBeOverriddenByThisReport:false,
    acceptanceEvidence:{independentSecuritySignedOff:false,
     providerAcceptanceVerified:false,backupRestoreDrillVerified:false,
     independent500CaseE2eCertified:false}
   });
   expect(observed.counts.dagBlocked).toBeGreaterThanOrEqual(2);
   expect(observed.gates.find(g=>g.id==='R3_TOOL_GATEWAY')?.status)
    .toBe('BLOCKED_NO_REMOTE_GATEWAY');
   const foreignReport=await report.r3ReleaseReadiness(foreign);
   expect(foreignReport.counts.dagBlocked).toBe(0);
   expect(foreignReport.verdict).toBe('NOT_CERTIFIED');
   expect(await db.modelUsage.count({where:{organizationId:org}})).toBe(0);
  }finally{
   for(const [key,value] of Object.entries({
    MARKETING_DAG_TRUSTED_PUBLIC_KEY_PEM:original.trusted,
    MARKETING_DAG_TRUSTED_KEY_ID:original.keyId,
    MARKETING_DAG_OFFLINE_EXECUTION_ENABLED:original.enabled,
    MARKETING_AI_REASONING_ENABLED:original.model
   })){
    if(value===undefined)delete process.env[key];
    else process.env[key]=value;
   }
   await db.$disconnect();
  }
 },90000);
 it('T15-019 permits only read-only incident evidence, not recovery execution or release overrides',()=>{
  expect(permissionForMarketingRoute('GET',
   '/marketing/architecture/readiness')).toBe('READ_AUDIT');
  expect(permissionForMarketingRoute('GET',
   '/marketing/architecture/runs/my-run/recovery')).toBe('READ_AUDIT');
  for(const [method,path] of [
   ['POST','/marketing/architecture/readiness'],
   ['POST','/marketing/architecture/runs/my-run/recovery'],
   ['POST','/marketing/architecture/runs/my-run/replay'],
   ['POST','/marketing/architecture/certify'],
   ['POST','/marketing/email/send'],
   ['POST','/marketing/tools/execute']
  ])expect(()=>permissionForMarketingRoute(method!,path!)).toThrow(
   'not in the permission registry');
 });
});
