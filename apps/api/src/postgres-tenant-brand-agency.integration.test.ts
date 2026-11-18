import {describe,expect,it} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {TenantBrandService} from './tenant-brand.service.js';
const enabled=process.env.MARKETING_DB_INTEGRATION==='1';
describe.skipIf(!enabled)('PostgreSQL R1 tenant, brand and agency grant authority',()=>{
 it('keeps client brands, agency users, scopes, revocation and audit isolated',async()=>{
  const db=new PrismaClient();
  const clientId='r1-client-'+randomUUID();
  const agencyId='r1-agency-'+randomUUID();
  const clientAdmin='admin-'+randomUUID();
  const agencyUser='delegate-'+randomUUID();
  try{
   await db.$connect();
   await db.organization.createMany({data:[
    {id:clientId,name:'Test client'},
    {id:agencyId,name:'Test agency'}
   ]});
   await db.user.create({data:{id:agencyUser,organizationId:agencyId,
    email:'agency-test@example.invalid',name:'Agency Admin',role:'ADMIN'}});
   const svc=new TenantBrandService(db as any);
   const clientBrand=await svc.createBrand(clientId,clientAdmin,{slug:'medical-products',name:'Medical Products'});
   const agencyBrand=await svc.createBrand(agencyId,agencyUser,{slug:'agency-brand',name:'Agency brand'});
   expect((await svc.listBrands(clientId)).map(x=>x.id)).toEqual([clientBrand.id]);
   expect((await svc.listBrands(agencyId)).map(x=>x.id)).toEqual([agencyBrand.id]);
   expect(await svc.listClientGrants(clientId)).toEqual([]);
   await expect(svc.grantAgency(clientId,clientAdmin,{agencyOrganizationId:agencyId,
    brandId:agencyBrand.id,actions:['CAMPAIGN_READ'],
    expiresAt:new Date(Date.now()+7*86400_000).toISOString()})).rejects.toThrow('not found');
   const grant=await svc.grantAgency(clientId,clientAdmin,{agencyOrganizationId:agencyId,
    brandId:clientBrand.id,actions:['CAMPAIGN_READ','REVIEW_COMMENT'],
    expiresAt:new Date(Date.now()+7*86400_000).toISOString()});
   expect(grant.status).toBe('ACTIVE');
   expect((await svc.listClientGrants(clientId))).toHaveLength(1);
   expect(await svc.listClientGrants(agencyId)).toEqual([]);
   expect(await svc.resolveAgencyReadScope(agencyId,clientId,clientBrand.id,
    agencyUser,'CAMPAIGN_READ')).toMatchObject({authorized:true,externalEffectsAuthorized:false});
   expect(await svc.resolveAgencyReadScope(agencyId,clientId,clientBrand.id,
    agencyUser,'PAID_MEDIA_SPEND')).toEqual({authorized:false});
   expect(await svc.resolveAgencyReadScope(agencyId,clientId,agencyBrand.id,
    agencyUser,'CAMPAIGN_READ')).toEqual({authorized:false});
   expect(await svc.resolveAgencyReadScope(agencyId,clientId,clientBrand.id,
    'not-a-member','CAMPAIGN_READ')).toEqual({authorized:false});
   await expect(svc.grantAgency(clientId,clientAdmin,{agencyOrganizationId:agencyId,
    brandId:clientBrand.id,actions:['CAMPAIGN_READ'],
    expiresAt:new Date(Date.now()+7*86400_000).toISOString()})).rejects.toThrow('Existing agency relationship');
   expect(await svc.revokeAgency(clientId,clientAdmin,grant.id,
    'Agency project completed and access should be removed')).toMatchObject({
     revoked:true,replay:false,authorityChanged:true});
   expect(await svc.resolveAgencyReadScope(agencyId,clientId,clientBrand.id,
    agencyUser,'CAMPAIGN_READ')).toEqual({authorized:false});
   expect(await svc.revokeAgency(clientId,clientAdmin,grant.id,
    'Agency project completed and access should be removed')).toMatchObject({replay:true});
   await expect(svc.revokeAgency(agencyId,agencyUser,grant.id,
    'Attempted foreign client scope revocation')).rejects.toThrow('not found');
   const audited=await db.auditEvent.findMany({where:{organizationId:clientId},
    orderBy:{occurredAt:'asc'}});
   expect(audited.map(x=>x.action)).toEqual(['BRAND_REGISTERED','AGENCY_GRANT_CREATED','AGENCY_GRANT_REVOKED']);
  }finally{
   await db.agencyGrant.deleteMany({where:{clientOrganizationId:clientId}});
   await db.auditEvent.deleteMany({where:{organizationId:{in:[clientId,agencyId]}}});
   await db.brand.deleteMany({where:{organizationId:{in:[clientId,agencyId]}}});
   await db.user.deleteMany({where:{organizationId:agencyId}});
   await db.organization.deleteMany({where:{id:{in:[clientId,agencyId]}}});
   await db.$disconnect();
  }
 },60000);
});
