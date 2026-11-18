import {BadRequestException,ConflictException,ForbiddenException,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {PrismaService} from './prisma.service.js';
import {exactCreativeScopeHash,isExactCreativeScope,type ExactCreativeScope} from './exact-creative-scope.js';

const clean=(v:unknown,name:string,max=150)=>{
 if(typeof v!=='string'||!v.trim()||v.trim().length>max)
  throw new BadRequestException('Invalid '+name);
 return v.trim();
};
const ident=(v:unknown,name:string)=>{
 const s=clean(v,name,128);
 if(!/^[A-Za-z0-9_-]{1,128}$/.test(s))throw new BadRequestException('Invalid '+name);
 return s;
};
const internalRef=(v:unknown,prefix:string,name:string)=>{
 const s=clean(v,name,240);
 if(!s.startsWith(prefix)||!/^[a-zA-Z0-9:/_-]+$/.test(s))
  throw new BadRequestException('Approved internal '+name+' reference required');
 return s;
};
const date=(v:unknown,name:string,days=365)=>{
 const s=clean(v,name,48);const d=new Date(s);
 if(!Number.isFinite(d.getTime())||d.getTime()<Date.now()+60_000||
   d.getTime()>Date.now()+days*86400_000)throw new BadRequestException('Invalid '+name+' window');
 return d;
};
/** Owns DAM metadata and approval requests; approval decisions still belong
 * exclusively to ApprovalService. There is no object download or publication.
 * Every query against RLS tables runs with transaction-local tenant context.
 */
@Injectable()
export class CreativeAssetService{
 constructor(private readonly db:PrismaService){}
 private scoped<T>(org:string,callback:(tx:Prisma.TransactionClient)=>Promise<T>):Promise<T>{
  ident(org,'tenant');
  return this.db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${org}, true)`;
   return callback(tx);
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
 }
 async create(organizationId:string,actorId:string,input:{brandId?:unknown;title?:unknown}){
  ident(actorId,'actor');const brandId=ident(input?.brandId,'brand');
  const title=clean(input?.title,'asset title',160);
  return this.scoped(organizationId,async tx=>{
   const brand=await tx.brand.findFirst({where:{id:brandId,organizationId,status:'ACTIVE'}});
   if(!brand)throw new NotFoundException('Active tenant brand not found');
   const asset=await tx.creativeAsset.create({data:{
    id:randomUUID(),organizationId,brandId,title,createdBy:actorId
   }});
   await tx.auditEvent.create({data:{organizationId,actorType:'HUMAN',actorId,
    action:'CREATIVE_ASSET_CREATED',objectType:'CreativeAsset',objectId:asset.id,
    correlationId:asset.id,after:{brandId,title,version:0}}});
   return{id:asset.id,brandId,title,version:0,status:'ACTIVE',externalEffectsAuthorized:false};
  });
 }
 async list(organizationId:string,brandIdInput?:unknown){
  const brandId=brandIdInput===undefined?undefined:ident(brandIdInput,'brand');
  return this.scoped(organizationId,tx=>tx.creativeAsset.findMany({
   where:{organizationId,...(brandId?{brandId}:{})},take:100,
   orderBy:{createdAt:'desc'},
   select:{id:true,brandId:true,title:true,version:true,status:true,createdAt:true}
  }));
 }
 async detail(organizationId:string,assetIdInput:unknown){
  const assetId=ident(assetIdInput,'asset');
  return this.scoped(organizationId,async tx=>{
   const asset=await tx.creativeAsset.findFirst({where:{id:assetId,organizationId},
    include:{revisions:{orderBy:{version:'desc'},take:30,select:{
     id:true,version:true,sourceKind:true,renditionDigest:true,
     rightsExpiresAt:true,rightsReviewedBy:true,rightsReviewedAt:true,createdAt:true
    }}}});
   if(!asset)throw new NotFoundException('Asset not found in tenant');
   const {revisions,...safe}=asset;
   return{...safe,revisions,externalEffectsAuthorized:false};
  });
 }
 async addRevision(organizationId:string,actorId:string,assetIdInput:unknown,input:{
  sourceKind?:unknown;sourceRef?:unknown;renditionDigest?:unknown;rightsExpiresAt?:unknown;
  expectedVersion?:unknown;
 }){
  ident(actorId,'actor');
  const assetId=ident(assetIdInput,'asset');
  const sourceKind=clean(input?.sourceKind,'source kind',40);
  if(!['EDITABLE_SOURCE','FLATTENED_EXPORT'].includes(sourceKind))
   throw new BadRequestException('Unsupported editable source/export classification');
  const sourceRef=internalRef(input?.sourceRef,'internal:creative-source/','source');
  const renditionDigest=clean(input?.renditionDigest,'SHA-256 digest',72);
  if(!/^sha256:[0-9a-f]{64}$/.test(renditionDigest))
   throw new BadRequestException('Exact rendition SHA-256 is required');
  const rightsExpiresAt=date(input?.rightsExpiresAt,'rights expiry',730);
  const expected=input?.expectedVersion;
  if(!Number.isSafeInteger(expected)||(expected as number)<0)
   throw new BadRequestException('Current asset version required');
  return this.scoped(organizationId,async tx=>{
   const asset=await tx.creativeAsset.findFirst({where:{organizationId,id:assetId,status:'ACTIVE'}});
   if(!asset)throw new NotFoundException('Active asset not found in tenant');
   if(asset.version!==expected)throw new ConflictException('Asset version has changed');
   const changed=await tx.creativeAsset.updateMany({
    where:{organizationId,id:assetId,status:'ACTIVE',version:asset.version},
    data:{version:{increment:1}}
   });
   if(changed.count!==1)throw new ConflictException('Concurrent asset revision');
   const revision=await tx.creativeAssetRevision.create({data:{
    id:randomUUID(),organizationId,assetId,version:asset.version+1,
    sourceKind,sourceRef,renditionDigest,rightsExpiresAt,createdBy:actorId
   }});
   await tx.auditEvent.create({data:{organizationId,actorType:'HUMAN',actorId,
    action:'CREATIVE_ASSET_REVISION_CREATED',objectType:'CreativeAssetRevision',objectId:revision.id,
    correlationId:revision.id,after:{assetId,version:revision.version,
     sourceKind,renditionDigest,rightsExpiresAt:revision.rightsExpiresAt.toISOString(),
     rightsVerified:false,publicationAuthorized:false}}});
   return{revisionId:revision.id,assetId,version:revision.version,rightsVerified:false,
    externalEffectsAuthorized:false};
  });
 }
 async reviewRights(organizationId:string,reviewerId:string,revisionIdInput:unknown,reasonRaw:unknown){
  ident(reviewerId,'reviewer');
  const revisionId=ident(revisionIdInput,'revision');
  const reason=clean(reasonRaw,'rights review rationale',500);
  if(reason.length<12)throw new BadRequestException('Rights review rationale must have 12+ characters');
  return this.scoped(organizationId,async tx=>{
   const revision=await tx.creativeAssetRevision.findFirst({where:{id:revisionId,organizationId}});
   if(!revision)throw new NotFoundException('Asset revision not found in tenant');
   const reviewer=await tx.user.findFirst({where:{id:reviewerId,organizationId,disabledAt:null},
    select:{role:true}});
   if(!reviewer||!['ADMIN','SUPER_ADMIN','MARKETING_DIRECTOR','CMO'].includes(reviewer.role.toUpperCase()))
    throw new ForbiddenException('Qualified independent reviewer required');
   const asset=await tx.creativeAsset.findFirst({where:{
    organizationId,id:revision.assetId}});
   if(!asset)throw new NotFoundException('Asset not found in tenant');
   if(revision.createdBy===reviewerId||asset.createdBy===reviewerId)
    throw new ForbiddenException('Asset creator cannot review own rights');
   if(revision.rightsReviewedAt)return{revisionId,alreadyReviewed:true,externalEffectsAuthorized:false};
   if(revision.rightsExpiresAt<=new Date())throw new ConflictException('Rights have expired');
   const changed=await tx.creativeAssetRevision.updateMany({
    where:{id:revisionId,organizationId,rightsReviewedAt:null},
    data:{rightsReviewedBy:reviewerId,rightsReviewedAt:new Date()}
   });
   if(changed.count!==1)throw new ConflictException('Rights review decided concurrently');
   await tx.auditEvent.create({data:{organizationId,actorType:'HUMAN',actorId:reviewerId,
    action:'CREATIVE_RIGHTS_REVIEWED',objectType:'CreativeAssetRevision',objectId:revisionId,
    correlationId:revisionId,after:{reviewerId,reason,rightsExpiresAt:revision.rightsExpiresAt.toISOString(),
     externalEffectsAuthorized:false}}});
   return{revisionId,rightsReviewed:true,externalEffectsAuthorized:false};
  });
 }
 async submitForApproval(organizationId:string,actorId:string,revisionIdInput:unknown,input:{
  channel?:unknown;destinationRef?:unknown;audienceRef?:unknown;
  policyVersion?:unknown;scheduledAt?:unknown;expiresAt?:unknown;
 }){
  ident(actorId,'actor');const revisionId=ident(revisionIdInput,'revision');
  const channel=clean(input?.channel,'channel',20);
  if(!['SOCIAL','EMAIL','WEB'].includes(channel))
   throw new BadRequestException('Supported campaign channel required');
  const destinationRef=internalRef(input?.destinationRef,'internal:connected-destination/','destination');
  const audienceRef=internalRef(input?.audienceRef,'internal:audience-snapshot/','audience');
  const policyVersion=clean(input?.policyVersion,'policy version',24);
  if(!/^v[0-9]{1,9}$/.test(policyVersion))throw new BadRequestException('Policy version required');
  const scheduledAt=date(input?.scheduledAt,'schedule',90);
  const expiresAt=date(input?.expiresAt,'approval expiry',30);
  if(expiresAt>scheduledAt)throw new BadRequestException('Approval expiry must be before scheduled time');
  return this.scoped(organizationId,async tx=>{
   const revision=await tx.creativeAssetRevision.findFirst({where:{id:revisionId,organizationId}});
   if(!revision)throw new NotFoundException('Asset revision not found in tenant');
   const asset=await tx.creativeAsset.findFirst({where:{id:revision.assetId,organizationId,status:'ACTIVE'}});
   const brand=asset&&await tx.brand.findFirst({where:{
    id:asset.brandId,organizationId,status:'ACTIVE'}});
   if(!asset||!brand||asset.version!==revision.version)
    throw new ConflictException('Current active brand/asset revision required');
   const brandMaster=await tx.brandMasterRevision.findFirst({where:{
    organizationId,status:'APPROVED'},orderBy:{version:'desc'},select:{version:true}});
   if(!brandMaster||policyVersion!=='v'+brandMaster.version)
    throw new ConflictException('Current approved Brand Master version required');
   if(!revision.rightsReviewedAt||revision.rightsExpiresAt<=scheduledAt)
    throw new ConflictException('Reviewed rights must cover the scheduled campaign');
   const scope:ExactCreativeScope={
    assetId:asset.id,revisionId,revisionVersion:revision.version,brandId:asset.brandId,
    renditionDigest:revision.renditionDigest,sourceRef:revision.sourceRef,
    channel:channel as ExactCreativeScope['channel'],destinationRef,audienceRef,
    policyVersion,scheduledAt:scheduledAt.toISOString(),expiresAt:expiresAt.toISOString()
   };
   if(!isExactCreativeScope(scope))throw new BadRequestException('Invalid immutable approval scope');
   const scopeDigest=exactCreativeScopeHash(scope);
   const pending=await tx.approval.findFirst({where:{
    organizationId,objectType:'CreativeAssetRevision',objectId:revision.id,decision:'PENDING'
   }});
   if(pending){
    if(pending.scopeDigest===scopeDigest)return{
     approvalId:pending.id,scopeDigest,replay:true,externalEffectsAuthorized:false};
    throw new ConflictException('A different pending approval scope already exists');
   }
   const approval=await tx.approval.create({data:{
    id:randomUUID(),organizationId,objectType:'CreativeAssetRevision',objectId:revision.id,
    creativeAssetRevisionId:revision.id,requiredAuthority:'HUMAN_CREATIVE_RELEASE',
    riskLevel:'R2',requestedBy:actorId,scopeDigest,scope,scopeExpiresAt:expiresAt
   }});
   await tx.auditEvent.create({data:{organizationId,actorType:'HUMAN',actorId,
    action:'CREATIVE_APPROVAL_REQUESTED',objectType:'CreativeAssetRevision',objectId:revision.id,
    correlationId:approval.id,after:{scopeDigest,approvalId:approval.id,
     brandId:asset.brandId,revisionVersion:revision.version,channel,
     externalEffectsAuthorized:false}}});
   return{approvalId:approval.id,scopeDigest,replay:false,externalEffectsAuthorized:false};
  });
 }
 async reviewApprovalState(organizationId:string,approvalIdInput:unknown){
  const approvalId=ident(approvalIdInput,'approval');
  return this.scoped(organizationId,async tx=>{
   const approval=await tx.approval.findFirst({where:{
    id:approvalId,organizationId,objectType:'CreativeAssetRevision'}});
   if(!approval||!approval.creativeAssetRevisionId)
    throw new NotFoundException('Creative approval not found');
   const revision=await tx.creativeAssetRevision.findFirst({where:{
    id:approval.creativeAssetRevisionId,organizationId}});
   const asset=revision&&await tx.creativeAsset.findFirst({where:{
    id:revision.assetId,organizationId,status:'ACTIVE'}});
   const scope=approval.scope;
   const brandMaster=await tx.brandMasterRevision.findFirst({where:{
    organizationId,status:'APPROVED'},orderBy:{version:'desc'},select:{version:true}});
   const brand=asset&&await tx.brand.findFirst({where:{
    id:asset.brandId,organizationId,status:'ACTIVE'},select:{id:true}});
   const current=!!revision&&!!asset&&!!brand&&!!brandMaster&&isExactCreativeScope(scope)&&
    scope.policyVersion==='v'+brandMaster.version&&
    asset.version===revision.version&&revision.rightsReviewedAt!==null&&
    revision.rightsExpiresAt>new Date()&&approval.scopeExpiresAt!==null&&
    approval.scopeExpiresAt>new Date()&&
    scope.revisionId===revision.id&&scope.brandId===asset.brandId&&
    scope.renditionDigest===revision.renditionDigest&&scope.sourceRef===revision.sourceRef&&
    scope.revisionVersion===revision.version&&
    exactCreativeScopeHash(scope)===approval.scopeDigest;
   return{approvalId,decision:approval.decision,scopeCurrent:current,
    humanDecisionValid:current&&approval.decision==='APPROVED',
    externallyExecutable:false,externalEffectsAuthorized:false};
  });
 }
}
