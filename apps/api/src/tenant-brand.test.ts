import {describe,expect,it,vi} from 'vitest';
import {TenantBrandService} from './tenant-brand.service.js';
import {permissionForMarketingRoute,hasMarketingPermission} from './marketing-permissions.js';
const future=()=>new Date(Date.now()+7*86400_000).toISOString();
function setup(){
 const tx:any={
  brand:{create:vi.fn().mockImplementation(async({data}:any)=>data),
   findFirst:vi.fn().mockResolvedValue({id:'brand-1'})},
  organization:{findUnique:vi.fn().mockResolvedValue({id:'agency-b'})},
  agencyGrant:{findUnique:vi.fn().mockResolvedValue(null),
   create:vi.fn().mockImplementation(async({data}:any)=>data),
   findFirst:vi.fn().mockResolvedValue({id:'grant-1',clientOrganizationId:'tenant-a',
    status:'ACTIVE',version:1}),
   updateMany:vi.fn().mockResolvedValue({count:1})},
  auditEvent:{create:vi.fn().mockResolvedValue({})}
 };
 const db:any={...tx,user:{findFirst:vi.fn().mockResolvedValue({role:'ADMIN'})},
  $transaction:vi.fn(async(cb:any)=>cb(tx))};
 return{tx,db,service:new TenantBrandService(db)};
}
describe('R1 authoritative brand and revocable agency scope',()=>{
 it('creates a brand only within trusted tenant scope and records its audit',async()=>{
  const {tx,service}=setup();
  const r=await service.createBrand('tenant-a','operator-1',{slug:'Research-Labs',name:'Research Labs'});
  expect(r).toMatchObject({organizationId:'tenant-a',slug:'research-labs',status:'ACTIVE',
   externalEffectsAuthorized:false});
  expect(tx.brand.create).toHaveBeenCalledWith({data:expect.objectContaining({
   organizationId:'tenant-a',createdBy:'operator-1'})});
  expect(tx.auditEvent.create).toHaveBeenCalledWith({data:expect.objectContaining({
   action:'BRAND_REGISTERED',organizationId:'tenant-a'})});
  await expect(service.createBrand('tenant-a','operator-1',{slug:'../../bad',name:'x'}))
   .rejects.toThrow('Brand slug');
 });
 it('limits agency rights to non-external, non-publishable actions with finite expiry',async()=>{
  const {tx,service}=setup();
  const r=await service.grantAgency('tenant-a','operator-1',{
   agencyOrganizationId:'agency-b',brandId:'brand-1',
   actions:['CAMPAIGN_READ','REVIEW_COMMENT'],expiresAt:future()});
  expect(r).toMatchObject({brandId:'brand-1',agencyOrganizationId:'agency-b',
   status:'ACTIVE',externalEffectsAuthorized:false});
  expect(tx.agencyGrant.create).toHaveBeenCalledWith({data:expect.objectContaining({
   clientOrganizationId:'tenant-a',agencyOrganizationId:'agency-b',brandId:'brand-1'})});
  await expect(service.grantAgency('tenant-a','operator-1',{agencyOrganizationId:'tenant-a',
   brandId:'brand-1',actions:['CAMPAIGN_READ'],expiresAt:future()}))
   .rejects.toThrow('separate tenants');
  await expect(service.grantAgency('tenant-a','operator-1',{agencyOrganizationId:'agency-b',
   brandId:'brand-1',actions:['PUBLISH_SOCIAL'],expiresAt:future()}))
   .rejects.toThrow('Only non-publishing');
 });
 it('rejects unknown agency or foreign brand without creating a permission',async()=>{
  const {tx,service}=setup();
  tx.brand.findFirst.mockResolvedValueOnce(null);
  await expect(service.grantAgency('tenant-a','operator-1',{agencyOrganizationId:'agency-b',
   brandId:'foreign-brand',actions:['CAMPAIGN_READ'],expiresAt:future()}))
   .rejects.toThrow('not found');
  expect(tx.agencyGrant.create).not.toHaveBeenCalled();
 });
 it('cannot silently restore a revoked historical relationship',async()=>{
  const {tx,service}=setup();
  tx.agencyGrant.findUnique.mockResolvedValueOnce({id:'grant-old',status:'REVOKED'});
  await expect(service.grantAgency('tenant-a','operator-1',{
   agencyOrganizationId:'agency-b',brandId:'brand-1',actions:['CAMPAIGN_READ'],
   expiresAt:future()})).rejects.toThrow('silently restored');
  expect(tx.agencyGrant.create).not.toHaveBeenCalled();
 });
 it('writes a CAS-fenced audited revocation and treats replay as no-op',async()=>{
  const {tx,service}=setup();
  const result=await service.revokeAgency('tenant-a','operator-1','grant-1',
   'Agency engagement ended by approved commercial decision');
  expect(result).toEqual({grantId:'grant-1',revoked:true,replay:false,authorityChanged:true});
  expect(tx.agencyGrant.updateMany).toHaveBeenCalledWith(expect.objectContaining({
   where:expect.objectContaining({clientOrganizationId:'tenant-a',status:'ACTIVE',version:1})}));
  tx.agencyGrant.findFirst.mockResolvedValueOnce({id:'grant-1',
   clientOrganizationId:'tenant-a',status:'REVOKED',version:2});
  expect(await service.revokeAgency('tenant-a','operator-1','grant-1',
   'Agency engagement ended by approved commercial decision')).toMatchObject({replay:true});
  expect(tx.auditEvent.create).toHaveBeenCalledTimes(1);
 });
 it('resolves narrow read-only agency scope only for an active member, approved role and live client brand',async()=>{
  const {db,service}=setup();
  db.agencyGrant.findFirst=vi.fn().mockResolvedValue({actions:['CAMPAIGN_READ'],
   expiresAt:new Date(Date.now()+86400_000)});
  db.brand.findFirst=vi.fn().mockResolvedValue({id:'brand-1'});
  expect(await service.resolveAgencyReadScope('agency-b','tenant-a','brand-1',
   'agency-user','CAMPAIGN_READ')).toMatchObject({authorized:true,
    brandId:'brand-1',externalEffectsAuthorized:false});
  expect(await service.resolveAgencyReadScope('agency-b','tenant-a','brand-1',
   'agency-user','PUBLISH_SOCIAL')).toEqual({authorized:false});
  db.user.findFirst.mockResolvedValueOnce({role:'VIEWER'});
  expect(await service.resolveAgencyReadScope('agency-b','tenant-a','brand-1',
   'agency-user','CAMPAIGN_READ')).toEqual({authorized:false});
  db.user.findFirst.mockResolvedValueOnce(null);
  expect(await service.resolveAgencyReadScope('agency-b','tenant-a','brand-1',
   'agency-user','CAMPAIGN_READ')).toEqual({authorized:false});
  expect(db.agencyGrant.findFirst).toHaveBeenCalledWith(expect.objectContaining({
   where:expect.objectContaining({agencyOrganizationId:'agency-b',
    clientOrganizationId:'tenant-a',brandId:'brand-1',status:'ACTIVE'})}));
 });
 it('permits only tenant admins to manage tenant/agency scopes',()=>{
  expect(permissionForMarketingRoute('POST','/marketing/tenancy/brands')).toBe('MANAGE_TENANT');
  expect(permissionForMarketingRoute('POST','/marketing/tenancy/agency-grants/grant-1/revoke'))
   .toBe('MANAGE_TENANT');
  expect(permissionForMarketingRoute('GET','/marketing/tenancy/agency-grants'))
   .toBe('READ_TENANCY');
  expect(hasMarketingPermission({role:'ADMIN'} as any,'MANAGE_TENANT')).toBe(true);
  expect(hasMarketingPermission({role:'MARKETING_DIRECTOR'} as any,'MANAGE_TENANT')).toBe(false);
  expect(hasMarketingPermission({role:'VIEWER'} as any,'READ_TENANCY')).toBe(false);
  expect(()=>permissionForMarketingRoute('DELETE','/marketing/tenancy/agency-grants/grant-1'))
   .toThrow('not in the permission registry');
 });
});
