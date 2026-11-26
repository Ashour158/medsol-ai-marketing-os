import {BadRequestException,ConflictException,ForbiddenException,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {PrismaService,withMarketingTenant} from './prisma.service.js';
import {ACTIVATION_REVIEW,activationReviewId,normalizeActivationInput,buildActivationReview,readActivationReview} from './customer-activation-review.js';
import {assertActorPermissionInTenantTransaction} from './tenant-role-policy.service.js';
import {TenantRolePolicyService} from './tenant-role-policy.service.js';
import type {VerifiedIdentity} from './oidc-identity.js';

const DELEGABLE=new Set(['CAMPAIGN_READ','ASSET_DRAFT','REVIEW_COMMENT','REPORT_READ']);
const AGENCY_ACTION_PERMISSION={
 CAMPAIGN_READ:'READ_PORTFOLIO',ASSET_DRAFT:'MANAGE_CAMPAIGN',
 REVIEW_COMMENT:'READ_APPROVALS',REPORT_READ:'READ_AUDIT'
} as const;
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
 constructor(private readonly db:PrismaService,
  private readonly roles:TenantRolePolicyService){}
 async requestActivationReview(org:string,identity:VerifiedIdentity,raw:unknown){
  if(!identity||identity.organizationId!==org||!identity.subject)throw new ForbiddenException('Verified tenant activation operator required');
  const input=normalizeActivationInput(raw),approvalId=activationReviewId(org,input.requestKey);
  for(let attempt=0;attempt<3;attempt++)try{
   return await withMarketingTenant(this.db,org,async tx=>{
    await assertActorPermissionInTenantTransaction(tx,identity,'MANAGE_TENANT');
    const prior=await tx.approval.findFirst({where:{organizationId:org,id:approvalId}});
    if(prior){
     const scope=readActivationReview(prior);
     if(scope.requestedBy!==identity.userId||JSON.stringify(scope.input)!==JSON.stringify(input))
      throw new ConflictException('Immutable activation review key already used');
     return{approvalId,decision:prior.decision,...scope,replayed:true,historicalOnly:true};
    }
    const {scope,scopeDigest}=await buildActivationReview(tx,org,identity.userId,input,new Date());
    await tx.approval.create({data:{id:approvalId,organizationId:org,objectType:ACTIVATION_REVIEW,objectId:input.brandId,
     requiredAuthority:'HUMAN_MARKETING_AUTHORITY',riskLevel:'R2',requestedBy:identity.userId,scope,scopeDigest,scopeExpiresAt:new Date(input.expiresAt)}});
    await tx.auditEvent.create({data:{organizationId:org,actorType:'HUMAN',actorId:identity.userId,action:'SYNTHETIC_ACTIVATION_REVIEW_REQUESTED',
     objectType:ACTIVATION_REVIEW,objectId:input.brandId,correlationId:approvalId,after:{scopeDigest,campaignId:input.campaignId,externalEffectsAuthorized:false}}});
    return{approvalId,decision:'PENDING',...scope,replayed:false,historicalOnly:true};
   },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  }catch(e){const code=(e as {code?:string})?.code;if(code==='P2034'&&attempt<2)continue;
   if(code==='P2034'||code==='P2002')throw new ConflictException('Concurrent activation review; refresh exact key');throw e;}
  throw new ConflictException('Activation review retry limit');
 }
 async activationReviews(org:string,identity:VerifiedIdentity){
  if(!identity||identity.organizationId!==org||!identity.subject)throw new ForbiddenException('Verified tenant activation reviewer required');
  return withMarketingTenant(this.db,org,async tx=>{
   await assertActorPermissionInTenantTransaction(tx,identity,'READ_TENANCY');
   const rows=await tx.approval.findMany({where:{organizationId:org,objectType:ACTIVATION_REVIEW},orderBy:[{createdAt:'desc'},{id:'asc'}],take:101});
   return{reviews:rows.slice(0,100).map(a=>({approvalId:a.id,decision:a.decision,...readActivationReview(a),expired:!!a.scopeExpiresAt&&a.scopeExpiresAt<=new Date(),historicalOnly:true})),windowCapped:rows.length>100,externalEffectsAuthorized:false};
  });
 }
 async createBrand(organizationId:string,actorId:string,raw:{slug?:unknown;name?:unknown}){
  id(organizationId,'tenant');id(actorId,'operator');
  const slug=str(raw?.slug,'brand slug',80).toLowerCase();
  if(!/^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/.test(slug))
   throw new BadRequestException('Brand slug must be lowercase, URL safe and bounded');
  const name=str(raw?.name,'brand name',150);
  try{
   return await this.db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${organizationId}, true)`;
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
  id(organizationId,'tenant');
  return this.db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${organizationId}, true)`;
   return tx.brand.findMany({where:{organizationId},take:100,
    orderBy:{createdAt:'desc'},select:{id:true,slug:true,name:true,status:true,createdAt:true}});
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
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
    await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${organizationId}, true)`;
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
  id(organizationId,'client tenant');
  return this.db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${organizationId}, true)`;
   return tx.agencyGrant.findMany({where:{clientOrganizationId:organizationId},
    select:{id:true,brandId:true,agencyOrganizationId:true,actions:true,status:true,expiresAt:true,
     revokedAt:true,version:true,createdAt:true},take:100,
    orderBy:{createdAt:'desc'}});
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
 }
 async revokeAgency(organizationId:string,actorId:string,grantId:string,reasonInput:unknown){
  id(organizationId,'client tenant');id(actorId,'operator');id(grantId,'grant');
  const reason=str(reasonInput,'revocation rationale',500);
  if(reason.length<12)throw new BadRequestException('Explain why delegated authority is revoked');
  return this.db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${organizationId}, true)`;
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
  * The only resource-specific agency CAMPAIGN_READ surface. The agency
  * identity/role and grant are canonical; the resource query happens IN
  * the same serializable transaction as the locked grant check.
  * Returns only bounded metadata, never publication/customer/PII/finance.
  */
 async delegatedCampaigns(actor:VerifiedIdentity,clientTenantId:string,
  brandId:string,campaignId?:string){
  if(!actor?.organizationId||!actor.userId||!actor.subject||!actor.email||
     actor.organizationId===clientTenantId)
   throw new ForbiddenException('Verified agency identity required');
  id(actor.organizationId,'agency tenant');
  id(clientTenantId,'client tenant');id(brandId,'brand');
  if(campaignId!==undefined)id(campaignId,'campaign');
  await this.roles.assertActorPermission(actor,'READ_PORTFOLIO');
  return this.db.$transaction(async tx=>{
   const org=actor.organizationId;
   await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${org}, true)`;
   // FOR SHARE freezes any revocation until the read transaction commits.
   // A concurrent revoked-grant transaction will serialize before or after
   // this read; no post-revocation grant can be accepted by a later read.
   const grants=await tx.$queryRaw<Array<{id:string;version:number}>>`
    SELECT g."id",g."version" FROM "AgencyGrant" g
    WHERE g."agencyOrganizationId"=${org}
      AND g."clientOrganizationId"=${clientTenantId}
      AND g."brandId"=${brandId}
      AND g."status"='ACTIVE'
      AND g."expiresAt">CURRENT_TIMESTAMP
      AND g."actions" ? 'CAMPAIGN_READ'
    FOR SHARE
   `;
   const grant=grants[0];
   if(!grant)throw new ForbiddenException('No active campaign-read delegation');
   const brand=await tx.brand.findFirst({where:{
    id:brandId,organizationId:clientTenantId,status:'ACTIVE'
   },select:{id:true}});
   if(!brand)throw new NotFoundException('Delegated brand unavailable');
   const where={organizationId:clientTenantId,brandId,
    ...(campaignId?{id:campaignId}:{})};
   const rows=await tx.campaign.findMany({where,
    orderBy:{updatedAt:'desc'},take:campaignId?1:50,
    select:{id:true,code:true,name:true,brandId:true,status:true,
     riskLevel:true,version:true,updatedAt:true}});
   if(campaignId&&!rows.length)
    throw new NotFoundException('Campaign not found in delegated brand');
   return{
    clientOrganizationId:clientTenantId,brandId,
    delegatedAction:'CAMPAIGN_READ' as const,grantId:grant.id,
    grantRevision:grant.version,readOnly:true as const,
    externalEffectsAuthorized:false as const,records:rows
   };
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
 }
 /**
  * The ONLY delegation resolver. It consumes a verified, OIDC-bound agency
  * actor (not a caller-supplied agency user ID), the existing tenant-role
  * authority, and the canonical AgencyGrant row under tenant RLS.
  * A grant never permits remote publishing, provider accounts or model tools.
  */
 async resolveAgencyReadScope(actor:VerifiedIdentity,clientTenantId:string,
  brandId:string,action:unknown,asOf=new Date()){
  const agencyTenantId=actor?.organizationId;
  if(!actor||!actor.userId||!actor.subject||!actor.role||!actor.email||
     typeof agencyTenantId!=='string'||agencyTenantId===clientTenantId||
     !Object.hasOwn(AGENCY_ACTION_PERMISSION,String(action)))
   return{authorized:false as const};
  id(agencyTenantId,'agency tenant');id(clientTenantId,'client tenant');
  id(brandId,'brand');id(actor.userId,'agency actor');
  const permission=AGENCY_ACTION_PERMISSION[action as keyof typeof AGENCY_ACTION_PERMISSION];
  // Reuse the provisioned OIDC/tenant-role engine: it checks subject, user
  // disabledAt, current built-in role and any narrower custom tenant role.
  try{await this.roles.assertActorPermission(actor,permission);}
  catch(err){if(err instanceof ForbiddenException)
   return{authorized:false as const};throw err;}
  return this.db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${agencyTenantId}, true)`;
   const grant=await tx.agencyGrant.findFirst({where:{
    agencyOrganizationId:agencyTenantId,clientOrganizationId:clientTenantId,
    brandId,status:'ACTIVE',expiresAt:{gt:asOf}},
    select:{id:true,actions:true,expiresAt:true,version:true}});
   if(!grant||!Array.isArray(grant.actions)||!grant.actions.includes(action as string))
    return{authorized:false as const};
   const brand=await tx.brand.findFirst({where:{
    id:brandId,organizationId:clientTenantId,status:'ACTIVE'},
    select:{id:true}});
   if(!brand)return{authorized:false as const};
   return{authorized:true as const,brandId,
    grantId:grant.id,grantRevision:grant.version,
    expiresAt:grant.expiresAt,
    delegatedAction:action as keyof typeof AGENCY_ACTION_PERMISSION,
    useForOneReadOnlyOperation:true as const,
    externalEffectsAuthorized:false as const};
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
 }

}
