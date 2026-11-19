import {describe,expect,it} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {MarketingWorkflowService} from './marketing-workflow.service.js';
import {permissionForMarketingRoute} from './marketing-permissions.js';
import {simulateBlueprintDraft} from '@medsol/contracts';

const enabled=process.env.MARKETING_DB_INTEGRATION==='1';
const validDraft=()=>({
 id:'brand-campaign-review',version:1,
 nodes:[
  {id:'start',type:'TRIGGER'},
  {id:'strategy',type:'AGENT_TASK',agentId:'MKT-CMO-001',maxSeconds:60},
  {id:'fanout',type:'PARALLEL'},
  {id:'copy',type:'AGENT_TASK',agentId:'MKT-CONT-001',maxSeconds:60},
  {id:'creative',type:'AGENT_TASK',agentId:'MKT-CREATIVE-001',maxSeconds:60},
  {id:'join',type:'JOIN'}, {id:'maker-checker',type:'APPROVAL'},
  {id:'schedule',type:'SCHEDULE'},{id:'end',type:'END'}
 ],
 edges:[
  {from:'start',to:'strategy'},{from:'strategy',to:'fanout'},
  {from:'fanout',to:'copy'},{from:'fanout',to:'creative'},
  {from:'copy',to:'join'},{from:'creative',to:'join'},
  {from:'join',to:'maker-checker'},{from:'maker-checker',to:'schedule'},
  {from:'schedule',to:'end'}
 ]
});
describe('R3 virtual Blueprint Studio uses canonical workflow ledger',()=>{
 it.skipIf(!enabled)('persists tenant-scoped DAG trace exactly once with zero actual model, tools or external effects',async()=>{
  const db=new PrismaClient(),org='r3-studio-'+randomUUID(),
   foreign='r3-foreign-'+randomUUID(),actorId='r3-admin-'+randomUUID(),
   subject='oidc-r3-'+randomUUID();
  try{
   await db.$connect();
   await db.organization.createMany({data:[
    {id:org,name:'R3 test tenant'},{id:foreign,name:'R3 other tenant'}
   ]});
   await db.user.create({data:{id:actorId,organizationId:org,
    email:actorId+'@example.invalid',name:'R3 Reviewer',role:'ADMIN',
    oidcSubject:subject}});
   const workflows=new MarketingWorkflowService(db as any,{} as any,
    {} as any,{} as any);
   const identity={userId:actorId,organizationId:org,role:'ADMIN',
    subject,email:actorId+'@example.invalid'};
   const draft=validDraft(),requestKey='r3-'+randomUUID();
   const result=await workflows.simulateBlueprint(org,identity,{draft,requestKey});
   expect(result).toMatchObject({status:'SIMULATED',saved:true,
    replayed:false,externalEffectsAuthorized:false,
    preview:{status:'SIMULATED',stepCount:9,virtualAgentTasks:3,
     humanDecisionNodes:1,virtualWaitNodes:1,
     realAgentExecutions:0,actualMcpCalls:0,actualModelCalls:0,
     actualDomainWrites:0,providerRequestsMade:0,externalEffectsAuthorized:false}});
   if(!result.workflowExecutionId)throw new Error('Expected durable virtual workflow ID');
   const wfId=result.workflowExecutionId;
   const persisted=await db.workflowExecution.findUniqueOrThrow({where:{id:wfId}});
   expect(persisted).toMatchObject({organizationId:org,
    workflowType:'BLUEPRINT_VIRTUAL_SIMULATION',status:'COMPLETED',
    currentStep:'SIMULATED_END'});
   const steps=await db.workflowStepExecution.findMany({where:{
    organizationId:org,workflowExecutionId:wfId},orderBy:{startedAt:'asc'}});
   expect(steps).toHaveLength(9);
   expect(steps.every(s=>s.status==='COMPLETED')).toBe(true);
   expect(await db.agentExecution.count({where:{organizationId:org}})).toBe(0);
   expect(await db.modelUsage.count({where:{organizationId:org}})).toBe(0);
   expect(await db.auditEvent.count({where:{organizationId:org,
    objectType:'WorkflowExecution',objectId:wfId,
    action:'BLUEPRINT_VIRTUAL_SIMULATION_COMPLETED'}})).toBe(1);
   expect(await db.outboxEvent.count({where:{organizationId:org,
    aggregateId:wfId,eventType:'BlueprintVirtualSimulationCompletedInternal'}})).toBe(1);
   const replay=await workflows.simulateBlueprint(org,identity,{draft,requestKey});
   expect(replay).toMatchObject({workflowExecutionId:wfId,replayed:true,saved:true});
   await expect(workflows.simulateBlueprint(org,identity,{requestKey,
    draft:{...draft,version:2}})).rejects.toThrow('another draft');
   await expect(workflows.simulateBlueprint(foreign,identity,{
    requestKey:'foreign-'+randomUUID(),draft
   })).rejects.toThrow('tenant workflow operator');
   await expect(workflows.simulateBlueprint(org,{
    ...identity,subject:'forged-oidc'
   },{draft,requestKey:'forged-'+randomUUID()}))
    .rejects.toThrow('Active OIDC tenant operator');
   await expect(workflows.simulateBlueprint(org,{
    ...identity,role:'VIEWER'
   },{draft,requestKey:'viewer-'+randomUUID()}))
    .rejects.toThrow('tenant workflow operator');
   const unsafe=validDraft();
   unsafe.nodes[1]={id:'strategy',type:'MCP_TOOL'} as any;
   expect(simulateBlueprintDraft(unsafe).status).toBe('BLOCKED');
   const rejected=await workflows.simulateBlueprint(org,identity,{
    draft:unsafe,requestKey:'unsafe-'+randomUUID()
   });
   expect(rejected).toMatchObject({status:'BLOCKED',saved:false,
    workflowExecutionId:null,
    preview:{stepCount:0,realAgentExecutions:0,actualMcpCalls:0}});
   expect(await db.workflowExecution.count({where:{
    organizationId:org,workflowType:'BLUEPRINT_VIRTUAL_SIMULATION'
   }})).toBe(1);
   expect(await db.workflowExecution.count({where:{
    organizationId:foreign,workflowType:'BLUEPRINT_VIRTUAL_SIMULATION'
   }})).toBe(0);
  }finally{await db.$disconnect();}
 },90000);
 it('permits only authorized simulation and not blueprint deployment',()=>{
  expect(permissionForMarketingRoute('POST',
   '/marketing/architecture/blueprint/simulate')).toBe('EXECUTE_WORKFLOW');
  expect(permissionForMarketingRoute('GET',
   '/marketing/architecture/blueprint')).toBe('READ_AUDIT');
  expect(()=>permissionForMarketingRoute('POST',
   '/marketing/architecture/blueprint/deploy')).toThrow('not in the permission registry');
  expect(()=>permissionForMarketingRoute('POST',
   '/marketing/architecture/blueprint')).toThrow('not in the permission registry');
 });
});
