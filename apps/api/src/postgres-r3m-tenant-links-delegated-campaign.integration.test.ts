import {describe,it,expect} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {TenantBrandService} from './tenant-brand.service.js';
import {TenantRolePolicyService} from './tenant-role-policy.service.js';
import {CampaignService} from './campaign.service.js';
import {OutboxService} from './outbox.service.js';
import {permissionForMarketingRoute} from './marketing-permissions.js';
const enabled=process.env.MARKETING_DB_INTEGRATION==='1';
const actor=(org:string,user:string)=>({
 organizationId:org,userId:user,subject:'oidc-'+user,
 role:'ADMIN',email:user+'@example.invalid'
});
const tenantContext=(tx:any,id:string)=>
 tx.$queryRawUnsafe("SELECT set_config('app.marketing_tenant_id', $1, true)",id);
describe.skipIf(!enabled)('R3-M real Postgres tenant and agency cross-engine acceptance',()=>{
 it('T01-003 rejects wrong-tenant campaign, workflow and brain foreign keys',async()=>{
  const db=new PrismaClient(),a='r3m-a-'+randomUUID(),b='r3m-b-'+randomUUID();
  try{
   await db.$connect();
   await db.organization.createMany({data:[{id:a,name:'R3M client'},{id:b,name:'R3M foreign'}]});
   const objective=await db.marketingObjective.create({data:{organizationId:a,name:'Objective A',description:'Offline'}});
   const foreign=await db.marketingObjective.create({data:{organizationId:b,name:'Objective B',description:'Offline'}});
   const product=await db.marketingProduct.create({data:{organizationId:b,code:'r3m-'+randomUUID(),name:'Synthetic product'}});
   await expect(db.campaign.create({data:{organizationId:a,code:'bad-objective-'+randomUUID(),
    name:'Mismatched objective',objectiveId:foreign.id}})).rejects.toThrow();
   await expect(db.campaign.create({data:{organizationId:a,code:'bad-product-'+randomUUID(),
    name:'Mismatched product',objectiveId:objective.id,productId:product.id}})).rejects.toThrow();
   const valid=await db.campaign.create({data:{organizationId:a,
    code:'valid-'+randomUUID(),name:'Valid campaign',objectiveId:objective.id}});
   expect(valid.organizationId).toBe(a);
   const wf=await db.workflowExecution.create({data:{organizationId:a,
    workflowType:'OFFLINE_REVIEW',currentStep:'review',
    correlationId:'wf-'+randomUUID(),input:{offline:true}}});
   await expect(db.workflowStepExecution.create({data:{organizationId:b,
    workflowExecutionId:wf.id,stepKey:'foreign',status:'RUNNING'}})).rejects.toThrow();
   await expect(db.approval.create({data:{organizationId:b,objectType:'Campaign',
    objectId:valid.id,requiredAuthority:'HUMAN_MARKETING_AUTHORITY',
    riskLevel:'R2',workflowExecutionId:wf.id}})).rejects.toThrow();
   const run=await db.brainRun.create({data:{organizationId:a,
    commandKey:'r3m-run-'+randomUUID(),correlationId:'r3m-corr-'+randomUUID(),input:{offline:true}}});
   await expect(db.brainRunStep.create({data:{organizationId:b,runId:run.id,
    agentId:'MKT-SCI-001',stage:'EVIDENCE',ordinal:1}})).rejects.toThrow();
   expect(await db.campaign.count({where:{organizationId:b}})).toBe(0);
   expect(await db.outboxEvent.count({where:{organizationId:{in:[a,b]}}})).toBe(0);
  }finally{await db.$disconnect();}
 },90000);
 it('T01-004 enforces owner/agency Brand FORCE RLS with a real non-BYPASSRLS role',async()=>{
  const db=new PrismaClient();
  const client='r3m-client-'+randomUUID(),agency='r3m-agency-'+randomUUID();
  const outsider='r3m-outside-'+randomUUID(),admin='admin-'+randomUUID();
  const role='r3m_probe_'+randomUUID().replaceAll('-','').slice(0,20);
  let roleCreated=false;
  try{
   await db.$connect();
   await db.organization.createMany({data:[{id:client,name:'RLS Client'},
    {id:agency,name:'RLS Agency'},{id:outsider,name:'RLS Outsider'}]});
   const svc=new TenantBrandService(db as any,new TenantRolePolicyService(db as any));
   const mine=await svc.createBrand(client,admin,{slug:'owned',name:'Client-owned brand'});
   const foreign=await svc.createBrand(outsider,admin,{slug:'foreign',name:'Other tenant brand'});
   const grant=await svc.grantAgency(client,admin,{brandId:mine.id,
    agencyOrganizationId:agency,actions:['CAMPAIGN_READ'],
    expiresAt:new Date(Date.now()+5*86400000).toISOString()});
   await db.$executeRawUnsafe('CREATE ROLE "'+role+'" NOLOGIN');roleCreated=true;
   await db.$executeRawUnsafe('GRANT SELECT,INSERT,UPDATE ON "Brand" TO "'+role+'"');
   await db.$executeRawUnsafe('GRANT SELECT ON "AgencyGrant" TO "'+role+'"');
   const see=(org:string|null)=>db.$transaction(async tx=>{
    await tx.$executeRawUnsafe('SET LOCAL ROLE "'+role+'"');
    if(org)await tenantContext(tx,org);
    return tx.$queryRawUnsafe<Array<{id:string}>>('SELECT "id" FROM "Brand" ORDER BY "id"');
   });
   const ids=(rows:{id:string}[])=>rows.map(x=>x.id);
   expect(ids(await see(null))).toEqual([]);
   expect(ids(await see(client))).toEqual([mine.id]);
   expect(ids(await see(agency))).toEqual([mine.id]);
   expect(ids(await see(outsider))).toEqual([foreign.id]);
   const forged=await db.$transaction(async tx=>{
    await tx.$executeRawUnsafe('SET LOCAL ROLE "'+role+'"');
    await tenantContext(tx,agency);
    return tx.$executeRawUnsafe('UPDATE "Brand" SET "name"=$1 WHERE "id"=$2',
     'Hijacked',mine.id);
   });
   expect(forged).toBe(0);
   await svc.revokeAgency(client,admin,grant.id,
    'Revoke client delegation and verify immediate agency brand invisibility');
   expect(await see(agency)).toEqual([]);
  }finally{
   if(roleCreated){
    await db.$executeRawUnsafe('REVOKE SELECT,INSERT,UPDATE ON "Brand" FROM "'+role+'"');
    await db.$executeRawUnsafe('REVOKE SELECT ON "AgencyGrant" FROM "'+role+'"');
    await db.$executeRawUnsafe('DROP ROLE IF EXISTS "'+role+'"');
   }
   await db.$disconnect();
  }
 },90000);
 it('T01-005 executes authenticated brand-scoped campaign creation, read and grant revocation',async()=>{
  const db=new PrismaClient();
  const client='r3m-client-'+randomUUID(),agency='r3m-agency-'+randomUUID();
  const actorId='agency-user-'+randomUUID(),admin='client-admin-'+randomUUID();
  const identity=actor(agency,actorId);
  try{
   await db.$connect();
   await db.organization.createMany({data:[{id:client,name:'Campaign Client'},{id:agency,name:'Campaign Agency'}]});
   await db.user.create({data:{id:actorId,organizationId:agency,
    name:'OIDC agency operator',email:identity.email,role:identity.role,oidcSubject:identity.subject}});
   const svc=new TenantBrandService(db as any,new TenantRolePolicyService(db as any));
   const campaignSvc=new CampaignService(db as any,new OutboxService(db as any));
   const brand=await svc.createBrand(client,admin,{slug:'approved',name:'Visible brand'});
   const hidden=await svc.createBrand(client,admin,{slug:'hidden',name:'Hidden client brand'});
   const objective=await db.marketingObjective.create({data:{organizationId:client,
    name:'Scientific launches',description:'Offline evidence only'}});
   const a=await campaignSvc.create({organizationId:client,
    commandId:'r3m-'+randomUUID(),correlationId:'r3m-'+randomUUID(),
    code:'visible-'+randomUUID(),name:'Visible campaign',objectiveId:objective.id,
    brandId:brand.id,riskLevel:'R2'});
   await campaignSvc.create({organizationId:client,
    commandId:'r3m-'+randomUUID(),correlationId:'r3m-'+randomUUID(),
    code:'hidden-'+randomUUID(),name:'Hidden campaign',objectiveId:objective.id,
    brandId:hidden.id,riskLevel:'R2'});
   const grant=await svc.grantAgency(client,admin,{brandId:brand.id,
    agencyOrganizationId:agency,actions:['CAMPAIGN_READ'],
    expiresAt:new Date(Date.now()+5*86400000).toISOString()});
   expect(permissionForMarketingRoute('GET',
    '/marketing/tenancy/clients/'+client+'/brands/'+brand.id+'/campaigns')).toBe('READ_PORTFOLIO');
   const response=await svc.delegatedCampaigns(identity,client,brand.id);
   expect(response).toMatchObject({grantId:grant.id,brandId:brand.id,
    readOnly:true,externalEffectsAuthorized:false,delegatedAction:'CAMPAIGN_READ'});
   expect(response.records.map(x=>x.id)).toEqual([a!.campaignId]);
   expect((await svc.delegatedCampaigns(identity,client,brand.id,a!.campaignId)).records).toHaveLength(1);
   await expect(svc.delegatedCampaigns(identity,client,hidden.id)).rejects.toThrow('No active');
   await expect(svc.delegatedCampaigns({...identity,subject:'oidc-spoof'},
    client,brand.id)).rejects.toThrow();
   await db.user.update({where:{id:actorId},data:{disabledAt:new Date()}});
   await expect(svc.delegatedCampaigns(identity,client,brand.id)).rejects.toThrow();
   await db.user.update({where:{id:actorId},data:{disabledAt:null}});
   await svc.revokeAgency(client,admin,grant.id,
    'Client terminates temporary delegated read-only campaign access');
   await expect(svc.delegatedCampaigns(identity,client,brand.id)).rejects.toThrow('No active');
   expect(await db.campaign.count({where:{organizationId:client}})).toBe(2);
   expect(await db.outboxEvent.count({where:{organizationId:client,eventType:'CampaignCreated'}})).toBe(2);
   expect(await db.modelUsage.count({where:{organizationId:client}})).toBe(0);
  }finally{await db.$disconnect();}
 },90000);
});
