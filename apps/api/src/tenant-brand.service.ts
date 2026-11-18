import {BadRequestException,ConflictException,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {PrismaService} from './prisma.service.js';

const DELEGABLE=new Set(['CAMPAIGN_READ','ASSET_DRAFT','REVIEW_COMMENT','REPORT_READ']);
const AGENCY_OPERATOR_ROLES=new Set(['ADMIN','SUPER_ADMIN','MARKETING_DIRECTOR','MARKETING_MANAGER']);
function str(value:unknown,name:string,max=128):string{
 if(typeof value!=='string'||!value.trim()||value.length>max)throw new BadRequestException('Invalid '+name);
 return value.trim();
}
function id(value:unknown,name:string):string{
 const s=str(value,name);
 if(!/^[a-zA-Z0-9_-]{1,128}$/.test(s))throw new BadRequestException('Invalid '+name);
 return s;
}
function expiry(value:unknown):Date{
 const s=str(value,'grant expiry',40),date=new Date(s);
 if(!Number.isFinite(date.getTime())||date.getTime()<=Date.now()+3600000||
    date.getTime()>Date.now()+90*86400000)throw new BadRequestException('Agency grant must expire within 90 days and after one hour');
 return date;
}
function actions(value:unknown):string[]{
 if(!Array.isArray(value)||!value.length||value.length>DELEGABLE.size)
  throw new BadRequestException('Scoped delegated actions required');
 const items=value.map(x=>str(x,'delegated action',80));
 if(new Set(items).size!==items.length||items.some(x=>!DELEGABLE.has(x)))
  throw new BadRequestException('Only non-publishing delegated actions are supported');
 return items;
}
/**
 * R1 tenant-owned brand and agency grant authority.
 * Never creates another BrandMaster or user membership owner. The grant row is
 * insufficient for external effect permission and cannot select the tenant.
 */
@Injectable()
export class TenantBrandService{
 constructor(private readonly db:PrismaService){}
 async createBrand(organizationId:string,actorId:string,raw:{slug?:unknown;name?:unknown}){
  id(organizationId,'tenant');id(actorId,'operator');
  const slug=str(raw?.slug,'brand slug',80).toLowerCase();
  if(!/^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/.test(slug))
   throw new BadRequestException('Brand slug must be lowercase, URL safe and bounded');
  const name=str(raw?.name,'brand name',150);
  try{
   return await this.db.$transaction(async tx=>{
    const brand=await tx.brand.create({data:{id:randomUUID(),organizationId,slug,name,
     createdBy:actorId}});
    await tx.auditEvent.create({data:{organizationId,actorType:'HUMAN',actorId,
     action:'BRAND_REGISTERED',objectType:'Brand',objectId:brand.id,correlationId:brand.id,
     after:{slug,name,status:'ACTIVE',externalEffectsAuthorized:false}}});
    return{id:brand.id,organizationId,slug,name,status:'ACTIVE',externalEffectsAuthorized:false};
   },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  }catch(error){
   if((error as {code?:string})?.code==='P2002')throw new ConflictException('Brand slug already registered in tenant');
   throw error;
  }
 }
 listBrands(organizationId:string){
  return this.db.brand.findMany({where:{organizationId},take:100,
   orderBy:{createdAt:'desc'},select:{id:true,slug:true,name:true,status:true,createdAt:true}});
 }
 async grantAgency(organizationId:string,actorId:string,raw:{
  agencyOrganizationId?:unknown;brandId?:unknown;actions?:unknown;expiresAt?:unknown;
 }){
  id(organizationId,'client tenant');id(actorId,'operator');
  const agencyOrganizationId=id(raw?.agencyOrganizationId,'agency tenant');
  const brandId=id(raw?.brandId,'brand');
  const permittedActions=actions(raw?.actions),expiresAt=expiry(raw?.expiresAt);
  if(agencyOrganizationId===organizationId)
   throw new BadRequestException('Agency and client must be separate tenants');
  try{
   return await this.db.$transaction(async tx=>{
    const [brand,agency,existing]=await Promise.all([
     tx.brand.findFirst({where:{id:brandId,organizationId,status:'ACTIVE'},select:{id:true}}),
     tx.organization.findUnique({where:{id:agencyOrganizationId},select:{id:true}}),
     tx.agencyGrant.findUnique({where:{clientOrganizationId_agencyOrganizationId_brandId:{
      clientOrganizationId:organizationId,agencyOrganizationId,brandId}}})
    ]);
    if(!brand||!agency)throw new NotFoundException('Client brand or agency organization not found');
    if(existing)throw new ConflictException('Existing agency relationship must be reviewed; revoked grants cannot be silently restored');
    const grant=await tx.agencyGrant.create({data:{id:randomUUID(),clientOrganizationId:organizationId,
     agencyOrganizationId,brandId,actions:permittedActions,expiresAt,createdBy:actorId}});
    await tx.auditEvent.create({data:{organizationId,actorType:'HUMAN',actorId,
     action:'AGENCY_GRANT_CREATED',objectType:'AgencyGrant',objectId:grant.id,correlationId:grant.id,
     after:{agencyOrganizationId,brandId,actions:permittedActions,expiresAt:expiresAt.toISOString(),
      externalEffectsAuthorized:false}}});
    return{id:grant.id,brandId,agencyOrganizationId,actions:permittedActions,
     expiresAt,status:'ACTIVE',externalEffectsAuthorized:false};
   },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  }catch(error){
   if((error as {code?:string})?.code==='P2002'||(error as {code?:string})?.code==='P2034')
    throw new ConflictException('Concurrent grant change; refresh and retry');
   throw error;
  }
 }
 listClientGrants(organizationId:string){
  return this.db.agencyGrant.findMany({where:{clientOrganizationId:organizationId},
   select:{id:true,brandId:true,agencyOrganizationId:true,actions:true,status:true,expiresAt:true,
    revokedAt:true,version:true,createdAt:true},take:100,
   orderBy:{createdAt:'desc'}});
 }
 async revokeAgency(organizationId:string,actorId:string,grantId:string,reasonInput:unknown){
  id(organizationId,'client tenant');id(actorId,'operator');id(grantId,'grant');
  const reason=str(reasonInput,'revocation rationale',500);
  if(reason.length<12)throw new BadRequestException('Explain why delegated authority is revoked');
  return this.db.$transaction(async tx=>{
   const grant=await tx.agencyGrant.findFirst({where:{id:grantId,clientOrganizationId:organizationId}});
   if(!grant)throw new NotFoundException('Agency grant not found in client tenant');
   if(grant.status==='REVOKED')return{grantId,revoked:true,replay:true,authorityChanged:false};
   const updated=await tx.agencyGrant.updateMany({where:{id:grantId,clientOrganizationId:organizationId,
    status:'ACTIVE',version:grant.version},data:{status:'REVOKED',version:{increment:1},
     revokedBy:actorId,revokedAt:new Date()}});
   if(updated.count!==1)throw new ConflictException('Agency grant changed concurrently');
   await tx.auditEvent.create({data:{organizationId,actorType:'HUMAN',actorId,
    action:'AGENCY_GRANT_REVOKED',objectType:'AgencyGrant',objectId:grantId,correlationId:grantId,
    before:{status:grant.status,version:grant.version},
    after:{status:'REVOKED',version:grant.version+1,reason,externalEffectsAuthorized:false}}});
   return{grantId,revoked:true,replay:false,authorityChanged:true};
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
 }
 /**
  * Internal, read-only delegated scope check. Caller must supply actor identity
  * resolved from the OIDC session and agency User table, never HTTP body claims.
  * A success grants only the explicitly scoped internal read/draft/comment, NOT
  * publication, external messaging, platform privilege changes or model tools.
  */
 async resolveAgencyReadScope(agencyTenantId:string,clientTenantId:string,
  brandId:string,actorId:string,action:string,asOf=new Date()){
  if(!DELEGABLE.has(action)||agencyTenantId===clientTenantId)return{authorized:false};
  const member=await this.db.user.findFirst({where:{id:actorId,organizationId:agencyTenantId,
   disabledAt:null},select:{role:true}});
  if(!member||!AGENCY_OPERATOR_ROLES.has(member.role.toUpperCase()))
   return{authorized:false};
  const grant=await this.db.agencyGrant.findFirst({where:{
   agencyOrganizationId:agencyTenantId,clientOrganizationId:clientTenantId,
   brandId,status:'ACTIVE',expiresAt:{gt:asOf}},
   select:{id:true,actions:true,expiresAt:true}});
  if(!grant||!Array.isArray(grant.actions)||!grant.actions.includes(action))
   return{authorized:false};
  const brand=await this.db.brand.findFirst({where:{id:brandId,organizationId:clientTenantId,
   status:'ACTIVE'},select:{id:true}});
  return{authorized:!!brand,...(brand?{brandId}:{}),externalEffectsAuthorized:false};
 }
}
