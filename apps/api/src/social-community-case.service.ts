import {BadRequestException,ConflictException,ForbiddenException,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma,type SocialCommunityCase} from '@prisma/client';
import {createHash,randomUUID} from 'node:crypto';
import {triageSocialDiscussion} from '@medsol/agent-runtime';
import {PrismaService,withMarketingTenant} from './prisma.service.js';
import {hasMarketingPermission,type MarketingPermission} from './marketing-permissions.js';
import type {VerifiedIdentity} from './oidc-identity.js';

const identifier=(raw:unknown,label:string)=>{
 if(typeof raw!=='string'||! /^[A-Za-z0-9_-]{1,128}$/.test(raw))
  throw new BadRequestException('Invalid '+label);
 return raw;
};
const object=(raw:unknown,allowed:readonly string[])=>{
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>!allowed.includes(k)))
  throw new BadRequestException('Invalid bounded community case input');
 return raw as Record<string,unknown>;
};
const projection=(row:SocialCommunityCase)=>({
 caseId:row.id,brandId:row.brandId,discussionId:row.discussionId,
 disposition:row.disposition,escalations:row.escalations,priority:row.priority,status:row.status,
 version:row.version,createdBy:row.createdBy,assignedTo:row.assignedTo,closedBy:row.closedBy,
 closedAt:row.closedAt?.toISOString()??null,updatedAt:row.updatedAt.toISOString(),
 syntheticOnly:true as const,externalEffectsAuthorized:false as const,
 specialistApprovalVerified:false as const,externalResolutionVerified:false as const
});
type Tx=Prisma.TransactionClient;
@Injectable()
export class SocialCommunityCaseService{
 constructor(private readonly db:PrismaService){}
 private async actor(tx:Tx,org:string,identity:VerifiedIdentity|undefined,permission:MarketingPermission){
  if(!identity||identity.organizationId!==org||!identity.subject||
     !hasMarketingPermission(identity,permission))throw new ForbiddenException('Verified community operator required');
  const user=await tx.user.findFirst({where:{organizationId:org,id:identity.userId,
   oidcSubject:identity.subject,disabledAt:null},select:{role:true,tenantRoleDefinitionId:true}});
  if(!user||user.role.toUpperCase()!==identity.role.toUpperCase())
   throw new ForbiddenException('Active matching community operator required');
  if(user.tenantRoleDefinitionId){
   const role=await tx.tenantRoleDefinition.findFirst({where:{id:user.tenantRoleDefinitionId,
    organizationId:org,status:'ACTIVE'},select:{permissions:true}});
   if(!role||!Array.isArray(role.permissions)||!role.permissions.includes(permission))
    throw new ForbiddenException('Tenant role policy denies: '+permission);
  }else if(process.env.MARKETING_REQUIRE_TENANT_ROLE==='true'&&!['ADMIN','SUPER_ADMIN'].includes(user.role.toUpperCase()))
   throw new ForbiddenException('Explicit tenant role assignment required');
  return identity.userId;
 }
 private async brand(tx:Tx,org:string,brandId:string){
  const row=await tx.brand.findFirst({where:{organizationId:org,id:brandId,status:'ACTIVE'},select:{id:true}});
  if(!row)throw new NotFoundException('Active tenant brand not found');
 }
 async create(org:string,identity:VerifiedIdentity|undefined,raw:unknown){
  const r=object(raw,['brandId','discussionId','text','moderation']);
  const brandId=identifier(r.brandId,'brand');
  const discussionId=identifier(r.discussionId,'discussion');
  if(!/^fixture-[A-Za-z0-9_-]{8,100}$/.test(discussionId))
   throw new BadRequestException('Explicit synthetic fixture identifier required');
  let triage;
  try{triage=triageSocialDiscussion(org,{discussionId,text:r.text,status:'OPEN',moderation:r.moderation??'NORMAL'});}
  catch(e){throw new BadRequestException(e instanceof Error?e.message:'Invalid synthetic discussion');}
  // No raw discussion stored, returned or put in audit. Scoped digest is only
  // an immutable replay fingerprint, not anonymization of real customer data.
  const discussionDigest='sha256:'+createHash('sha256').update(JSON.stringify([
   'medsol-community-case-v1',org,brandId,discussionId,r.text,r.moderation??'NORMAL'
  ])).digest('hex');
  const priority=triage.escalations.includes('PRIVACY_REVIEW')?'URGENT':
   triage.escalations.length?'HIGH':triage.disposition==='HUMAN_REVIEW_REQUIRED'?'NORMAL':'LOW';
  try{return await withMarketingTenant(this.db,org,async tx=>{
   const actor=await this.actor(tx,org,identity,'ASSESS');
   await this.brand(tx,org,brandId);
   const existing=await tx.socialCommunityCase.findUnique({where:{
    organizationId_brandId_discussionId:{organizationId:org,brandId,discussionId}}});
   if(existing){
    if(existing.discussionDigest!==discussionDigest)throw new ConflictException('Fixture already has different immutable evidence');
    return{...projection(existing),replayed:true};
   }
   const row=await tx.socialCommunityCase.create({data:{id:randomUUID(),organizationId:org,brandId,
    discussionId,discussionDigest,disposition:triage.disposition,escalations:triage.escalations,
    priority,createdBy:actor}});
   await tx.auditEvent.create({data:{organizationId:org,actorType:'HUMAN',actorId:actor,
    action:'SOCIAL_CASE_CREATED',objectType:'SocialCommunityCase',objectId:row.id,
    correlationId:row.id,after:projection(row)}});
   return{...projection(row),replayed:false};
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});}
  catch(e){if(e instanceof Prisma.PrismaClientKnownRequestError&&['P2002','P2034'].includes(e.code))
   throw new ConflictException('Concurrent fixture creation; refresh and retry same fixture');throw e;}
 }
 async list(org:string,identity:VerifiedIdentity|undefined,brandIdInput:unknown){
  const brandId=identifier(brandIdInput,'brand');
  return withMarketingTenant(this.db,org,async tx=>{
   await this.actor(tx,org,identity,'ASSESS');
   await this.brand(tx,org,brandId);
   const rows=await tx.socialCommunityCase.findMany({where:{organizationId:org,brandId},
    orderBy:[{updatedAt:'desc'},{id:'asc'}],take:101});
   return{cases:rows.slice(0,100).map(projection),windowCapped:rows.length>100,syntheticOnly:true,
    externalEffectsAuthorized:false};
  });
 }
 async transition(org:string,identity:VerifiedIdentity|undefined,idInput:unknown,raw:unknown){
  const id=identifier(idInput,'case');
  const r=object(raw,['action','expectedVersion']);
  if(!['CLAIM','SUBMIT_REVIEW','CLOSE_INTERNAL','REOPEN'].includes(String(r.action))||
     typeof r.expectedVersion!=='number'||!Number.isSafeInteger(r.expectedVersion)||r.expectedVersion<1)
   throw new BadRequestException('Valid case action and expected version required');
  const managerAction=r.action==='CLOSE_INTERNAL'||r.action==='REOPEN';
  try{return await withMarketingTenant(this.db,org,async tx=>{
   const actor=await this.actor(tx,org,identity,managerAction?'DECIDE_APPROVAL':'ASSESS');
   const row=await tx.socialCommunityCase.findFirst({where:{organizationId:org,id}});
   if(!row)throw new NotFoundException('Community case not found');
   await this.brand(tx,org,row.brandId);
   if(row.version!==r.expectedVersion)throw new ConflictException('Case revision changed; refresh before action');
   let changes:Prisma.SocialCommunityCaseUpdateManyMutationInput;
   switch(r.action){
    case 'CLAIM':
     if(row.status!=='OPEN'||row.assignedTo!==null)throw new ConflictException('Only unassigned open case can be claimed');
     changes={assignedTo:actor};break;
    case 'SUBMIT_REVIEW':
     if(row.status!=='OPEN'||row.assignedTo!==actor)throw new ConflictException('Only assigned operator can submit open case');
     changes={status:'PENDING_REVIEW'};break;
    case 'CLOSE_INTERNAL':
     if(row.status!=='PENDING_REVIEW'||!row.assignedTo)throw new ConflictException('Case must await review');
     if(actor===row.createdBy||actor===row.assignedTo)throw new ForbiddenException('Independent manager required; no self-closure');
     // Specialist escalations remain visible, never claimed as professionally
     // verified. This action only closes internal handling of synthetic evidence.
     changes={status:'RESOLVED_INTERNAL',closedBy:actor,closedAt:new Date()};break;
    case 'REOPEN':
     if(!['PENDING_REVIEW','RESOLVED_INTERNAL'].includes(row.status))
      throw new ConflictException('Only pending or internally resolved case can reopen');
     changes={status:'OPEN',assignedTo:null,closedBy:null,closedAt:null};break;
    default:throw new BadRequestException('Unknown case action');
   }
   const updated=await tx.socialCommunityCase.updateMany({where:{organizationId:org,id,version:row.version},
    data:{...changes,version:{increment:1}}});
   if(updated.count!==1)throw new ConflictException('Case revision changed; refresh before action');
   const next=await tx.socialCommunityCase.findFirstOrThrow({where:{organizationId:org,id}});
   await tx.auditEvent.create({data:{organizationId:org,actorType:'HUMAN',actorId:actor,
    action:'SOCIAL_CASE_'+String(r.action),objectType:'SocialCommunityCase',objectId:id,
    correlationId:id,before:projection(row),after:projection(next)}});
   return projection(next);
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});}
  catch(e){if(e instanceof Prisma.PrismaClientKnownRequestError&&e.code==='P2034')
   throw new ConflictException('Concurrent case action; refresh before retry');throw e;}
 }
}
