import {describe,it,expect} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {TenantBrandService} from './tenant-brand.service.js';
import {TenantRolePolicyService} from './tenant-role-policy.service.js';
import type {VerifiedIdentity} from './oidc-identity.js';

const enabled=process.env.MARKETING_DB_INTEGRATION==='1';
const grantDate=()=>new Date(Date.now()+4*86400000).toISOString();
const actor=(organizationId:string,userId:string,role='ADMIN'):VerifiedIdentity=>({
 organizationId,userId,role,subject:'oidc-'+userId,
 email:userId+'@example.invalid'
});
describe.skipIf(!enabled)('R3-L verified agency delegation, FORCE RLS and irreversible grants',()=>{
 it('T01-001 verified actor, brand, OIDC, role and revocation acceptance with no remote effects',async()=>{
  const db=new PrismaClient();
  const client='r3l-client-'+randomUUID();
  const another='r3l-other-'+randomUUID();
  const agency='r3l-agency-'+randomUUID();
  const clientAdmin='r3l-admin-'+randomUUID();
  const agencyAdmin='r3l-delegate-'+randomUUID();
  const identity=actor(agency,agencyAdmin);
  try{
   await db.$connect();
   await db.organization.createMany({data:[
    {id:client,name:'R3L client'},{id:another,name:'R3L other client'},
    {id:agency,name:'R3L agency'}]});
   await db.user.create({data:{
    id:agencyAdmin,organizationId:agency,
    email:identity.email,name:'R3L agency reviewer',
    role:'ADMIN',oidcSubject:identity.subject
   }});
   const svc=new TenantBrandService(db as any,
    new TenantRolePolicyService(db as any));
   const brand=await svc.createBrand(client,clientAdmin,{
    slug:'genomics-brand',name:'Synthetic Genomics Brand'});
   const foreignBrand=await svc.createBrand(another,clientAdmin,{
    slug:'foreign-brand',name:'Unrelated Client Brand'});
   const grant=await svc.grantAgency(client,clientAdmin,{
    agencyOrganizationId:agency,brandId:brand.id,
    actions:['CAMPAIGN_READ','ASSET_DRAFT','REVIEW_COMMENT','REPORT_READ'],
    expiresAt:grantDate()});
   const actions=['CAMPAIGN_READ','ASSET_DRAFT','REVIEW_COMMENT','REPORT_READ'];
   for(const action of actions){
    const scoped=await svc.resolveAgencyReadScope(identity,client,brand.id,action);
    expect(scoped).toMatchObject({authorized:true,
     brandId:brand.id,grantId:grant.id,grantRevision:1,
     delegatedAction:action,externalEffectsAuthorized:false});
   }
   const forbidden=['PUBLISH_SOCIAL','SEND_EMAIL','MANAGE_TENANT',
    'EXECUTE_WORKFLOW','MCP_EXECUTE','PROVIDER_DISPATCH','MODEL_INFERENCE',
    'BILLING_OVERRIDE','AGENCY_GRANT','PAID_MEDIA_SPEND'];
   for(const action of forbidden){
    expect(await svc.resolveAgencyReadScope(identity,client,brand.id,action))
     .toEqual({authorized:false});
   }
   const badIdentity=[
    {...identity,userId:'stolen-user-id'},
    {...identity,subject:'oidc-someone-else'},
    {...identity,role:'SUPER_ADMIN'},
    {...identity,organizationId:client},
    {...identity,organizationId:another},
    {...identity,subject:''}
   ];
   for(const forged of badIdentity)
    expect(await svc.resolveAgencyReadScope(forged,client,brand.id,
     'CAMPAIGN_READ')).toEqual({authorized:false});
   expect(await svc.resolveAgencyReadScope(identity,another,brand.id,'CAMPAIGN_READ'))
    .toEqual({authorized:false});
   expect(await svc.resolveAgencyReadScope(identity,client,foreignBrand.id,'CAMPAIGN_READ'))
    .toEqual({authorized:false});
   expect(await svc.resolveAgencyReadScope(identity,client,brand.id,'CAMPAIGN_READ',
    new Date(Date.now()+10*86400000))).toEqual({authorized:false});
   // The optional tenant custom role is a restrictive ceiling enforced by
   // the same TenantRolePolicyService used by the HTTP auth guard.
   const restrictive=await db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${agency}, true)`;
    return tx.tenantRoleDefinition.create({data:{
     organizationId:agency,key:'restricted_r3l',name:'Read-only agency',
     permissions:['READ_PORTFOLIO'],createdBy:agencyAdmin}});
   });
   await db.user.update({where:{id:agencyAdmin},
    data:{tenantRoleDefinitionId:restrictive.id}});
   expect((await svc.resolveAgencyReadScope(identity,client,brand.id,'CAMPAIGN_READ'))
    .authorized).toBe(true);
   for(const action of ['ASSET_DRAFT','REVIEW_COMMENT','REPORT_READ'])
    expect(await svc.resolveAgencyReadScope(identity,client,brand.id,action))
     .toEqual({authorized:false});
   await db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${agency}, true)`;
    await tx.tenantRoleDefinition.update({where:{id:restrictive.id},
     data:{status:'DISABLED'}});
   });
   expect(await svc.resolveAgencyReadScope(identity,client,brand.id,'CAMPAIGN_READ'))
    .toEqual({authorized:false});
   await db.user.update({where:{id:agencyAdmin},
    data:{tenantRoleDefinitionId:null,disabledAt:new Date()}});
   expect(await svc.resolveAgencyReadScope(identity,client,brand.id,'CAMPAIGN_READ'))
    .toEqual({authorized:false});
   await db.user.update({where:{id:agencyAdmin},data:{disabledAt:null}});
   expect((await svc.resolveAgencyReadScope(identity,client,brand.id,'CAMPAIGN_READ'))
    .authorized).toBe(true);
   const revoked=await svc.revokeAgency(client,clientAdmin,grant.id,
    'Terminate externally delegated read authority after end of program');
   expect(revoked.authorityChanged).toBe(true);
   for(const action of actions)
    expect(await svc.resolveAgencyReadScope(identity,client,brand.id,action))
     .toEqual({authorized:false});
   await expect(svc.grantAgency(client,clientAdmin,{
    agencyOrganizationId:agency,brandId:brand.id,
    actions:['CAMPAIGN_READ'],expiresAt:grantDate()}))
    .rejects.toThrow('silently restored');
   const proof=await db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${client}, true)`;
    return tx.agencyGrant.findFirstOrThrow({
     where:{id:grant.id,clientOrganizationId:client}});
   });
   expect(proof.status).toBe('REVOKED');
   expect(proof.version).toBe(2);
   expect(await db.auditEvent.count({where:{organizationId:client,
    action:'AGENCY_GRANT_REVOKED'}})).toBe(1);
   expect(await db.modelUsage.count({where:{organizationId:client}})).toBe(0);
  }finally{
   // Terminal agency history cannot be physically deleted by design.
   // All random-ID records live only in this disposable CI database.
   await db.$disconnect();
  }
 },90000);
 it('T01-002 client/agency SQL RLS and immutable grant acceptance against non-BYPASSRLS principal',async()=>{
  const db=new PrismaClient();
  const client='r3l-rls-client-'+randomUUID();
  const agency='r3l-rls-agency-'+randomUUID();
  const stranger='r3l-rls-stranger-'+randomUUID();
  const operator='operator-'+randomUUID();
  const role='r3l_probe_'+randomUUID().replaceAll('-','').slice(0,20);
  let created=false;
  try{
   await db.$connect();
   await db.organization.createMany({data:[
    {id:client,name:'R3L visibility client'},
    {id:agency,name:'R3L visibility agency'},
    {id:stranger,name:'R3L visibility stranger'}]});
   const svc=new TenantBrandService(db as any,
    new TenantRolePolicyService(db as any));
   const brand=await svc.createBrand(client,operator,{slug:'grant-rls',
    name:'RLS verification brand'});
   const grant=await svc.grantAgency(client,operator,{
    brandId:brand.id,agencyOrganizationId:agency,
    actions:['CAMPAIGN_READ'],expiresAt:grantDate()});
   await db.$executeRawUnsafe('CREATE ROLE "'+role+'" NOLOGIN');
   created=true;
   await db.$executeRawUnsafe('GRANT SELECT, UPDATE, DELETE ON "AgencyGrant" TO "'+role+'"');
   const inspect=async(tenant:string|null)=>{
    return db.$transaction(async tx=>{
     await tx.$executeRawUnsafe('SET LOCAL ROLE "'+role+'"');
     if(tenant)await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${tenant}, true)`;
     return tx.$queryRawUnsafe<Array<{clientOrganizationId:string;agencyOrganizationId:string;id:string}>>(
      'SELECT "id","clientOrganizationId","agencyOrganizationId" FROM "AgencyGrant" WHERE "id"=\''+
      grant.id+'\'');
    });
   };
   expect(await inspect(null)).toEqual([]);
   expect(await inspect(stranger)).toEqual([]);
   expect(await inspect(client)).toMatchObject([{id:grant.id}]);
   expect(await inspect(agency)).toMatchObject([{id:grant.id}]);
   const unauthorizedUpdate=async(tenant:string,sql:string)=>{
    return db.$transaction(async tx=>{
     await tx.$executeRawUnsafe('SET LOCAL ROLE "'+role+'"');
     await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${tenant}, true)`;
     return tx.$executeRawUnsafe(sql);
    });
   };
   const update= 'UPDATE "AgencyGrant" SET "status"=\'REVOKED\','+
    '"version"=2,"revokedBy"=\'forgery\',"revokedAt"=now() WHERE "id"=\''+
    grant.id+'\'';
   // Agency sees its delegated metadata but may never mutate the client's row.
   expect(await unauthorizedUpdate(agency,update)).toBe(0);
   expect(await unauthorizedUpdate(stranger,update)).toBe(0);
   // A client cannot rewrite the originally approved actions, dates or owners.
   const forgedActions='UPDATE "AgencyGrant" SET "actions"=\'[\"PUBLISH_SOCIAL\"]\'::jsonb'+
    ' WHERE "id"=\''+grant.id+'\'';
   await expect(unauthorizedUpdate(client,forgedActions)).rejects.toThrow(
    /Agency grants only permit terminal audited revocation/);
   await expect(unauthorizedUpdate(client,
    'DELETE FROM "AgencyGrant" WHERE "id"=\''+grant.id+'\''))
    .resolves.toBe(0);
   expect((await inspect(agency)).length).toBe(1);
   await svc.revokeAgency(client,operator,grant.id,
    'Client cancels active agency permission after compliance review');
   await expect(unauthorizedUpdate(client,
    'UPDATE "AgencyGrant" SET "status"=\'ACTIVE\' WHERE "id"=\''+grant.id+'\''))
    .rejects.toThrow(/Agency grants only permit terminal audited revocation/);
   const live=await db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${client}, true)`;
    return tx.agencyGrant.findFirstOrThrow({
     where:{id:grant.id,clientOrganizationId:client}});
   });
   expect(live.status).toBe('REVOKED');
  }finally{
   if(created){
    await db.$executeRawUnsafe('REVOKE SELECT, UPDATE, DELETE ON "AgencyGrant" FROM "'+role+'"');
    await db.$executeRawUnsafe('DROP ROLE IF EXISTS "'+role+'"');
   }
   await db.$disconnect();
  }
 },90000);
});
