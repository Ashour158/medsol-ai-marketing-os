import {BadRequestException,ConflictException,ForbiddenException,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma,type SocialCommunityCase} from '@prisma/client';
import {createHash,randomUUID} from 'node:crypto';
import {triageSocialDiscussion} from '@medsol/agent-runtime';
import {PrismaService,withMarketingTenant} from './prisma.service.js';
import {type MarketingPermission} from './marketing-permissions.js';
import {assertActorPermissionInTenantTransaction} from './tenant-role-policy.service.js';
import type {VerifiedIdentity} from './oidc-identity.js';
import {communityReviewScope,communityReviewMatches,COMMUNITY_REVIEW_OBJECT} from './community-review-scope.js';

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
const slaHours=(priority:string)=>priority==='URGENT'?1:priority==='HIGH'?4:priority==='NORMAL'?24:72;
const slaDeadline=(priority:string,now:Date)=>new Date(now.getTime()+slaHours(priority)*3600000);
export const crisisSlaWorkerConfigured=()=>process.env.MARKETING_BRAIN_WORKER_ENABLED==='true'&&process.env.MARKETING_CRISIS_SLA_WORKER_ENABLED==='true';
type ReviewProjection={escalation:string;approvalId:string|null;decision:string};
const projection=(row:SocialCommunityCase,specialistReviews:ReviewProjection[]=[])=>({
 caseId:row.id,brandId:row.brandId,discussionId:row.discussionId,
 disposition:row.disposition,escalations:row.escalations,priority:row.priority,status:row.status,
 version:row.version,reviewRound:row.reviewRound,specialistReviews,
 slaDueAt:row.slaDueAt?.toISOString()??null,slaEscalatedAt:row.slaEscalatedAt?.toISOString()??null,
 slaOverdue:row.status!=='RESOLVED_INTERNAL'&&!!row.slaDueAt&&row.slaDueAt<=new Date(),
 slaWorkerConfigured:crisisSlaWorkerConfigured(),
 internalSpecialistReviewComplete:row.reviewRound!==null&&row.escalations.every(e=>specialistReviews.some(r=>r.escalation===e&&r.decision==='APPROVED')),
 createdBy:row.createdBy,assignedTo:row.assignedTo,closedBy:row.closedBy,
 closedAt:row.closedAt?.toISOString()??null,updatedAt:row.updatedAt.toISOString(),
 syntheticOnly:true as const,externalEffectsAuthorized:false as const,
 specialistApprovalVerified:false as const,externalResolutionVerified:false as const
});
type Tx=Prisma.TransactionClient;
@Injectable()
export class SocialCommunityCaseService{
 constructor(private readonly db:PrismaService){}
 private async actor(tx:Tx,org:string,identity:VerifiedIdentity|undefined,permission:MarketingPermission){
  if(!identity||identity.organizationId!==org||!identity.subject)
   throw new ForbiddenException('Verified community operator required');
  await assertActorPermissionInTenantTransaction(tx,identity,permission);
  return identity.userId;
 }
 private async brand(tx:Tx,org:string,brandId:string){
  const row=await tx.brand.findFirst({where:{organizationId:org,id:brandId,status:'ACTIVE'},select:{id:true}});
  if(!row)throw new NotFoundException('Active tenant brand not found');
 }
 private async views(tx:Tx,rows:SocialCommunityCase[]){
  const digests=rows.flatMap(row=>row.reviewRound?row.escalations.map(e=>communityReviewScope(row,e).scopeDigest):[]);
  const approvals=digests.length?await tx.approval.findMany({where:{organizationId:rows[0]!.organizationId,
   objectType:COMMUNITY_REVIEW_OBJECT,scopeDigest:{in:digests}}}):[];
  return rows.map(row=>projection(row,row.reviewRound?row.escalations.map(escalation=>{
   const expected=communityReviewScope(row,escalation),matches=approvals.filter(x=>x.scopeDigest===expected.scopeDigest&&communityReviewMatches(row,x));
   if(matches.length!==1)return{escalation,approvalId:null,decision:'MISSING_OR_AMBIGUOUS'};
   const a=matches[0]!;
   const valid=a.decision!=='APPROVED'||!!a.decidedBy&&a.decidedBy!==row.createdBy&&a.decidedBy!==row.assignedTo;
   return{escalation,approvalId:a.id,decision:valid?a.decision:'INVALID_REVIEWER'};
  }):[]));
 }
 private async view(tx:Tx,row:SocialCommunityCase){return (await this.views(tx,[row]))[0]!;}
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
    return{...await this.view(tx,existing),replayed:true};
   }
   const now=new Date();
   const row=await tx.socialCommunityCase.create({data:{id:randomUUID(),organizationId:org,brandId,
    discussionId,discussionDigest,disposition:triage.disposition,escalations:triage.escalations,
    priority,createdBy:actor,createdAt:now,updatedAt:now,slaDueAt:slaDeadline(priority,now)}});
   await tx.auditEvent.create({data:{organizationId:org,actorType:'HUMAN',actorId:actor,
    action:'SOCIAL_CASE_CREATED',objectType:'SocialCommunityCase',objectId:row.id,
    correlationId:row.id,after:projection(row)}});
   return{...await this.view(tx,row),replayed:false};
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
   return{cases:await this.views(tx,rows.slice(0,100)),windowCapped:rows.length>100,syntheticOnly:true,
    externalEffectsAuthorized:false};
  });
 }
 /** Existing worker calls this bounded internal-only scan. No email, webhook
  * or public response is emitted. The case queue and audit are authoritative. */
 async escalateDueCases(org:string){
  if(!crisisSlaWorkerConfigured())return{enabled:false,escalated:0,conflicted:0,failed:0};
  const candidates=await withMarketingTenant(this.db,org,tx=>tx.socialCommunityCase.findMany({
   where:{organizationId:org,status:{in:['OPEN','PENDING_REVIEW']},slaDueAt:{lte:new Date()},slaEscalatedAt:null},
   orderBy:[{slaDueAt:'asc'},{id:'asc'}],take:10,select:{id:true,version:true}}));
  let escalated=0,conflicted=0,failed=0;
  for(const candidate of candidates){
   try{
    const changed=await withMarketingTenant(this.db,org,async tx=>{
     const now=new Date();
     const row=await tx.socialCommunityCase.findFirst({where:{organizationId:org,id:candidate.id,
      version:candidate.version,status:{in:['OPEN','PENDING_REVIEW']},slaDueAt:{lte:now},slaEscalatedAt:null}});
     if(!row)return false;
     const result=await tx.socialCommunityCase.updateMany({where:{organizationId:org,id:row.id,version:row.version,
      slaEscalatedAt:null,status:row.status},data:{version:{increment:1},slaEscalatedAt:now}});
     if(result.count!==1)return false;
     await tx.auditEvent.create({data:{organizationId:org,actorType:'SYSTEM',actorId:'community-sla-scheduler',
      action:'SOCIAL_CASE_SLA_ESCALATED',objectType:'SocialCommunityCase',objectId:row.id,correlationId:row.id,
      after:{priority:row.priority,status:row.status,reviewRound:row.reviewRound,version:row.version+1,
       dueAt:row.slaDueAt!.toISOString(),escalatedAt:now.toISOString(),syntheticOnly:true,externalEffectsAuthorized:false}}});
     return true;
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
    if(changed)escalated++;else conflicted++;
   }catch(e){if(e instanceof Prisma.PrismaClientKnownRequestError&&e.code==='P2034')conflicted++;else failed++;}
  }
  return{enabled:true,escalated,conflicted,failed};
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
     changes={status:'PENDING_REVIEW',reviewRound:row.version+1};break;
    case 'CLOSE_INTERNAL':
     if(row.status!=='PENDING_REVIEW'||!row.assignedTo)throw new ConflictException('Case must await review');
     if(actor===row.createdBy||actor===row.assignedTo)throw new ForbiddenException('Independent manager required; no self-closure');
     // Existing ApprovalService owns individual decisions. Closure requires
     // every exact-round independent review, never a professional credential assertion.
     if(row.escalations.length&&!(await this.view(tx,row)).internalSpecialistReviewComplete)
      throw new ConflictException('Required independent community reviews not satisfied');
     changes={status:'RESOLVED_INTERNAL',closedBy:actor,closedAt:new Date()};break;
    case 'REOPEN':
     if(!['PENDING_REVIEW','RESOLVED_INTERNAL'].includes(row.status))
      throw new ConflictException('Only pending or internally resolved case can reopen');
     {const now=new Date();changes={status:'OPEN',assignedTo:null,closedBy:null,closedAt:null,reviewRound:null,
      updatedAt:now,slaDueAt:slaDeadline(row.priority,now),slaEscalatedAt:null};}break;
    default:throw new BadRequestException('Unknown case action');
   }
   const updated=await tx.socialCommunityCase.updateMany({where:{organizationId:org,id,version:row.version},
    data:{...changes,version:{increment:1}}});
   if(updated.count!==1)throw new ConflictException('Case revision changed; refresh before action');
   const next=await tx.socialCommunityCase.findFirstOrThrow({where:{organizationId:org,id}});
   if(r.action==='SUBMIT_REVIEW'){
    for(const escalation of next.escalations){
     const exact=communityReviewScope(next,escalation);
     await tx.approval.create({data:{id:randomUUID(),organizationId:org,objectType:COMMUNITY_REVIEW_OBJECT,objectId:id,
      requiredAuthority:exact.requiredAuthority,riskLevel:next.priority==='URGENT'?'R3':'R2',
      requestedBy:actor,scopeDigest:exact.scopeDigest,scope:exact.scope}});
    }
   }
   const after=await this.view(tx,next);
   await tx.auditEvent.create({data:{organizationId:org,actorType:'HUMAN',actorId:actor,
    action:'SOCIAL_CASE_'+String(r.action),objectType:'SocialCommunityCase',objectId:id,
    correlationId:id,before:projection(row),after}});
   return after;
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});}
  catch(e){if(e instanceof Prisma.PrismaClientKnownRequestError&&e.code==='P2034')
   throw new ConflictException('Concurrent case action; refresh before retry');throw e;}
 }
}
