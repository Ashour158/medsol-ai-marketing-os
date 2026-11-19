import {describe,expect,it} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {generateKeyPairSync,randomUUID,sign} from 'node:crypto';
import {MarketingWorkflowService} from './marketing-workflow.service.js';
import {AgentService} from './agent.service.js';
import {WorkflowLeaseService} from './workflow-lease.service.js';
import {ApprovalService} from './approval.service.js';
import {offlineDagDigest} from './r3g-offline-dag.js';
import {permissionForMarketingRoute} from './marketing-permissions.js';

const enabled=process.env.MARKETING_DB_INTEGRATION==='1';
const draft=(version=1)=>({id:'r3g-reviewed-campaign',version,nodes:[
 {id:'start',type:'TRIGGER'},{id:'fork',type:'PARALLEL'},
 {id:'cmo',type:'AGENT_TASK',agentId:'MKT-CMO-001',maxSeconds:45},
 {id:'science',type:'AGENT_TASK',agentId:'MKT-SCI-001',maxSeconds:45},
 {id:'join',type:'JOIN'},{id:'human',type:'APPROVAL'},{id:'end',type:'END'}
 ],edges:[{from:'start',to:'fork'},{from:'fork',to:'cmo'},
 {from:'fork',to:'science'},{from:'cmo',to:'join'},
 {from:'science',to:'join'},{from:'join',to:'human'},
 {from:'human',to:'end'}]});
const manifest=(version=1)=>({draft:draft(version),canaryPercent:100,
 maxSteps:16,executionMode:'DETERMINISTIC_NO_MODEL'});
describe('R3-G signed offline DAG and canonical PostgreSQL workflow acceptance',()=>{
 it.skipIf(!enabled)('reviews, activates, executes canonical agents, human waits, reruns, rolls back and revokes without egress',async()=>{
  const db=new PrismaClient(),org='r3g-'+randomUUID(),other='r3g-other-'+randomUUID(),
   maker='r3g-maker-'+randomUUID(),reviewer='r3g-reviewer-'+randomUUID(),
   subA='sub-'+randomUUID(),subB='sub-'+randomUUID();
  const pair=generateKeyPairSync('ed25519');
  const saved={key:process.env.MARKETING_DAG_TRUSTED_PUBLIC_KEY_PEM,
   id:process.env.MARKETING_DAG_TRUSTED_KEY_ID,
   enabled:process.env.MARKETING_DAG_OFFLINE_EXECUTION_ENABLED,
   model:process.env.MARKETING_AI_REASONING_ENABLED};
  process.env.MARKETING_DAG_TRUSTED_PUBLIC_KEY_PEM=pair.publicKey.export({
   type:'spki',format:'pem'}).toString();
  process.env.MARKETING_DAG_TRUSTED_KEY_ID='r3g-release-signer';
  process.env.MARKETING_DAG_OFFLINE_EXECUTION_ENABLED='true';
  delete process.env.MARKETING_AI_REASONING_ENABLED;
  const identity=(id:string,subject:string,organizationId=org)=>({
   userId:id,organizationId,subject,role:'ADMIN',
   email:id+'@example.invalid'});
  const author=identity(maker,subA),checker=identity(reviewer,subB);
  const signer=(m:ReturnType<typeof manifest>)=>sign(null,
   Buffer.from('medsol-r3g-dag-signature-v1\n'+offlineDagDigest(m)),
   pair.privateKey).toString('base64url');
  try{
   await db.$connect();
   await db.organization.createMany({data:[
    {id:org,name:'R3G tenant'},{id:other,name:'R3G foreign tenant'}]});
   await db.user.createMany({data:[
    {id:maker,organizationId:org,email:author.email,
     name:'Maker',role:'ADMIN',oidcSubject:subA},
    {id:reviewer,organizationId:org,email:checker.email,
     name:'Reviewer',role:'ADMIN',oidcSubject:subB}]});
   const flows=new MarketingWorkflowService(db as any,
    new AgentService(db as any),{} as any,new WorkflowLeaseService(db as any));
   const approvals=new ApprovalService(db as any,flows);
   const m1=manifest();
   const r1=await flows.dagPropose(org,author,{
    manifest:m1,signature:signer(m1),signerKeyId:'r3g-release-signer'});
   expect(r1).toMatchObject({status:'PROPOSED',revision:1,
    signatureTrusted:true,replayed:false});
   expect(await flows.dagPropose(org,author,{manifest:m1,
    signature:signer(m1),signerKeyId:'r3g-release-signer'}))
    .toMatchObject({id:r1.id,replayed:true});
   await expect(flows.dagPropose(other,author,{manifest:m1,
    signature:signer(m1),signerKeyId:'r3g-release-signer'}))
    .rejects.toThrow(/tenant/i);
   await expect(flows.dagApprove(org,author,r1.id,1))
    .rejects.toThrow('Independent');
   await expect(flows.dagApprove(org,identity(reviewer,'forged'),r1.id,1))
    .rejects.toThrow('Active matching');
   await expect(flows.dagActivate(org,checker,r1.id,0))
    .rejects.toThrow('approved');
   expect((await flows.dagApprove(org,checker,r1.id,1)).status).toBe('APPROVED');
   expect((await flows.dagActivate(org,checker,r1.id,0)).status).toBe('ACTIVE');
   const key='r3g-'+randomUUID();
   const started=await flows.dagLaunch(org,author,{blueprintId:m1.draft.id,
    requestKey:key,objective:'Review precise market claims',market:'MENA'});
   expect(started).toMatchObject({status:'RUNNING',replayed:false,
    externalEffectsAuthorized:false});
   expect(await flows.dagLaunch(org,author,{blueprintId:m1.draft.id,
    requestKey:key,objective:'Review precise market claims',market:'MENA'}))
    .toMatchObject({workflowExecutionId:started.workflowExecutionId,replayed:true});
   await expect(flows.dagLaunch(org,author,{blueprintId:m1.draft.id,
    requestKey:key,objective:'Different objective',market:'MENA'}))
    .rejects.toThrow('different input');
   const first=await flows.dagTick(org,author,started.workflowExecutionId);
   expect(first).toMatchObject({status:'WAITING_APPROVAL',stepKey:'human',
    externalEffectsAuthorized:false});
   const pending=await db.approval.findFirstOrThrow({where:{
    organizationId:org,workflowExecutionId:started.workflowExecutionId,
    objectType:'BlueprintWorkflowStep',decision:'PENDING'}});
   expect(await db.agentExecution.count({where:{organizationId:org}})).toBe(2);
   expect(await db.modelUsage.count({where:{organizationId:org}})).toBe(0);
   const reviewCmd={organizationId:org,commandId:randomUUID(),
    correlationId:randomUUID(),approvalId:pending.id,
    approverUserId:maker,decision:'APPROVED' as const,
    rationale:'Reviewed the offline scientific and brand recommendations'};
   await expect(approvals.approve(reviewCmd)).rejects.toThrow('Independent');
   const approved=await approvals.approve({...reviewCmd,
    approverUserId:reviewer,commandId:randomUUID()});
   expect(approved.decision).toBe('APPROVED');
   const finished=await flows.dagTick(org,author,started.workflowExecutionId);
   expect(finished).toMatchObject({status:'COMPLETED',externalEffectsAuthorized:false});
   expect(await db.workflowStepExecution.count({where:{
    organizationId:org,workflowExecutionId:started.workflowExecutionId,
    status:'COMPLETED'}})).toBe(7);
   expect(await db.agentExecution.count({where:{organizationId:org}})).toBe(2);
   const m2=manifest(2);
   const r2=await flows.dagPropose(org,author,{
    manifest:m2,signature:signer(m2),signerKeyId:'r3g-release-signer'});
   await flows.dagApprove(org,checker,r2.id,2);
   const switched=await flows.dagActivate(org,checker,r2.id,1);
   expect(switched.status).toBe('ACTIVE');
   expect((await flows.dagReleases(org,author,m1.draft.id))
    .find(x=>x.id===r1.id)?.status).toBe('SUPERSEDED');
   const rolled=await flows.dagActivate(org,checker,r1.id,2);
   expect(rolled.status).toBe('ACTIVE');
   expect((await flows.dagRevoke(org,checker,r1.id,
    'Emergency kill switch due to restricted workflow release')).status).toBe('REVOKED');
   await expect(flows.dagActivate(org,checker,r1.id,0))
    .rejects.toThrow('approved or superseded');
   await expect(flows.dagLaunch(org,author,{blueprintId:m1.draft.id,
    requestKey:'blocked-'+randomUUID(),objective:'This must be blocked'}))
    .rejects.toThrow('No active');
   expect(await db.auditEvent.count({where:{organizationId:org,
    action:'DAG_RELEASE_ROLLBACK'}})).toBe(1);
   // Test unprivileged FORCE RLS, not only application-side tenant filters.
   const role='r3g_role_'+randomUUID().replaceAll('-','').slice(0,18);
   await db.$executeRawUnsafe('CREATE ROLE "'+role+'" NOLOGIN');
   try{
    await db.$executeRawUnsafe('GRANT SELECT ON "BlueprintDeployment" TO "'+role+'"');
    const counts=await db.$transaction(async tx=>{
     await tx.$executeRawUnsafe('SET LOCAL ROLE "'+role+'"');
     const count=async()=>Number((await tx.$queryRaw<Array<{n:bigint}>>`
      SELECT count(*)::bigint AS n FROM "BlueprintDeployment"`)[0]?.n);
     const none=await count();
     await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${org}, true)`;
     const own=await count();
     await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${other}, true)`;
     const foreign=await count();
     return{none,own,foreign};
    });
    expect(counts).toEqual({none:0,own:2,foreign:0});
   }finally{
    await db.$executeRawUnsafe('REVOKE SELECT ON "BlueprintDeployment" FROM "'+role+'"');
    await db.$executeRawUnsafe('DROP ROLE "'+role+'"');
   }
  }finally{
   for(const [key,value] of Object.entries({
    MARKETING_DAG_TRUSTED_PUBLIC_KEY_PEM:saved.key,
    MARKETING_DAG_TRUSTED_KEY_ID:saved.id,
    MARKETING_DAG_OFFLINE_EXECUTION_ENABLED:saved.enabled,
    MARKETING_AI_REASONING_ENABLED:saved.model
   })){
    if(value===undefined)delete process.env[key];else process.env[key]=value;
   }
   await db.$disconnect();
  }
 },90000);
 it('permits only exact OIDC governance and step routes, never arbitrary egress',()=>{
  expect(permissionForMarketingRoute('GET','/marketing/architecture/deployments'))
   .toBe('READ_TENANCY');
  expect(permissionForMarketingRoute('POST','/marketing/architecture/deployments'))
   .toBe('MANAGE_TENANT');
  expect(permissionForMarketingRoute('POST','/marketing/architecture/deployments/release/activate'))
   .toBe('MANAGE_TENANT');
  expect(permissionForMarketingRoute('POST','/marketing/architecture/runs'))
   .toBe('EXECUTE_WORKFLOW');
  expect(permissionForMarketingRoute('POST','/marketing/architecture/runs/run/tick'))
   .toBe('EXECUTE_WORKFLOW');
  expect(()=>permissionForMarketingRoute('POST','/marketing/architecture/runs/run/remote'))
   .toThrow();
  expect(()=>permissionForMarketingRoute('POST','/marketing/architecture/blueprint/deploy'))
   .toThrow();
 });
});
