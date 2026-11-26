import {BadRequestException,ConflictException,ForbiddenException,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma,type MarketingConversionForm,type MarketingConversionSubmission} from '@prisma/client';
import {createHash,randomUUID} from 'node:crypto';
import {PrismaService,withMarketingTenant} from './prisma.service.js';
import {assertActorPermissionInTenantTransaction} from './tenant-role-policy.service.js';
import type {VerifiedIdentity} from './oidc-identity.js';
const digest=(v:unknown[])=>'sha256:'+createHash('sha256').update(JSON.stringify(v)).digest('hex');
function object(v:unknown,keys:readonly string[]){
 if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!keys.includes(k)))
  throw new BadRequestException('Bounded anonymous conversion fields only');
 return v as Record<string,unknown>;
}
function id(v:unknown,label:string){
 if(typeof v!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(v))throw new BadRequestException('Invalid '+label);
 return v;
}
function fixture(v:unknown){
 if(typeof v!=='string'||!/^fixture-[A-Za-z0-9_-]{8,100}$/.test(v))
  throw new BadRequestException('Synthetic fixture identifier required');
 return v;
}
function plain(v:unknown,max:number){
 if(typeof v!=='string'||!v.trim()||v.length>max||/[<>\u0000-\u001f\u007f]/.test(v))
  throw new BadRequestException('Bounded plain form draft text required');
 return v.trim();
}
const formView=(r:MarketingConversionForm,decision:string)=>({
 formId:r.id,campaignId:r.campaignId,brandId:r.brandId,campaignVersion:r.campaignVersion,
 formKey:r.formKey,headline:r.headline,cta:r.cta,contentDigest:r.contentDigest,approvalId:r.approvalId,
 approvalDecision:decision,syntheticOnly:true,publicFormHosted:false,externalEffectsAuthorized:false
});
const submissionView=(r:MarketingConversionSubmission)=>({
 submissionId:r.id,formId:r.formId,contactId:r.contactId,outcome:r.outcome,
 syntheticOnly:true,realConsentVerified:false,actualLeadsCreated:0,crmHandoffsExecuted:0,
 automaticRetryAuthorized:false,externalEffectsAuthorized:false
});
type Tx=Prisma.TransactionClient;
@Injectable()
export class SyntheticConversionService{
 constructor(private readonly db:PrismaService){}
 private transaction<T>(org:string,identity:VerifiedIdentity,permission:'READ_AUDIT'|'MANAGE_CAMPAIGN'|'SUBMIT_EVIDENCE',work:(tx:Tx)=>Promise<T>){
  if(!identity||identity.organizationId!==org)throw new ForbiddenException('Verified conversion actor required');
  return withMarketingTenant(this.db,org,async tx=>{
   await assertActorPermissionInTenantTransaction(tx,identity,permission);
   return work(tx);
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
 }
 private async campaign(tx:Tx,org:string,campaignId:string,brandId:string,version?:number){
  const c=await tx.campaign.findFirst({where:{organizationId:org,id:campaignId,brandId,status:'APPROVED',
   ...(version===undefined?{}:{version})},select:{id:true,version:true}});
  const b=await tx.brand.findFirst({where:{organizationId:org,id:brandId,status:'ACTIVE'},select:{id:true}});
  const approval=await tx.approval.findFirst({where:{organizationId:org,objectType:'Campaign',objectId:campaignId,
   decision:'APPROVED',decidedBy:{not:null}},select:{decidedBy:true,requestedBy:true}});
  if(!c||!b||!approval?.decidedBy||approval.decidedBy===approval.requestedBy)
   throw new ConflictException('Current approved same-brand campaign and independent approval required');
  return c;
 }
 async create(org:string,identity:VerifiedIdentity,raw:unknown){
  const r=object(raw,['campaignId','brandId','formKey','headline','cta']);
  const campaignId=id(r.campaignId,'campaign'),brandId=id(r.brandId,'brand'),formKey=fixture(r.formKey);
  const headline=plain(r.headline,120),cta=plain(r.cta,80);
  try{return await this.transaction(org,identity,'MANAGE_CAMPAIGN',async tx=>{
   const c=await this.campaign(tx,org,campaignId,brandId);
   const contentDigest=digest(['medsol-synthetic-form-v1',org,campaignId,brandId,c.version,headline,cta]);
   const prior=await tx.marketingConversionForm.findUnique({where:{organizationId_formKey:{organizationId:org,formKey}},include:{approval:true}});
   if(prior){
    if(prior.contentDigest!==contentDigest)throw new ConflictException('Form fixture reused for changed revision');
    return{...formView(prior,prior.approval.decision),replayed:true};
   }
   const formId=randomUUID(),approvalId=randomUUID();
   await tx.approval.create({data:{id:approvalId,organizationId:org,objectType:'MarketingConversionForm',objectId:formId,
    requiredAuthority:'HUMAN_MARKETING_AUTHORITY',riskLevel:'R2',requestedBy:identity.userId,scopeDigest:contentDigest,
    scope:{campaignId,brandId,campaignVersion:c.version,syntheticOnly:true,externalEffectsAuthorized:false}}});
   const row=await tx.marketingConversionForm.create({data:{id:formId,organizationId:org,campaignId,brandId,
    campaignVersion:c.version,formKey,headline,cta,contentDigest,approvalId,createdBy:identity.userId}});
   await tx.auditEvent.create({data:{organizationId:org,actorType:'HUMAN',actorId:identity.userId,action:'SYNTHETIC_FORM_PROPOSED',
    objectType:'MarketingConversionForm',objectId:formId,correlationId:formId,
    after:{campaignId,brandId,contentDigest,approvalId,externalEffectsAuthorized:false}}});
   return{...formView(row,'PENDING'),replayed:false};
  });}catch(e){if(e instanceof Prisma.PrismaClientKnownRequestError&&['P2002','P2034'].includes(e.code))
   throw new ConflictException('Concurrent form creation; refresh before retry');throw e;}
 }
 async list(org:string,identity:VerifiedIdentity,campaignIdInput:unknown){
  const campaignId=id(campaignIdInput,'campaign');
  return this.transaction(org,identity,'READ_AUDIT',async tx=>{
   const rows=await tx.marketingConversionForm.findMany({where:{organizationId:org,campaignId},orderBy:{createdAt:'desc'},
    take:51,include:{approval:{select:{decision:true}}}});
   const submissions=await tx.marketingConversionSubmission.findMany({where:{organizationId:org,form:{campaignId}},
    orderBy:{createdAt:'desc'},take:101});
   return{forms:rows.slice(0,50).map(x=>formView(x,x.approval.decision)),
    submissions:submissions.slice(0,100).map(submissionView),windowCapped:rows.length>50||submissions.length>100,
    syntheticOnly:true,externalEffectsAuthorized:false};
  });
 }
 async submit(org:string,identity:VerifiedIdentity,formIdInput:unknown,raw:unknown){
  const formId=id(formIdInput,'form'),r=object(raw,['contactId','requestKey','formDigest','mockCrmPurposeGranted','mockTransport']);
  const contactId=id(r.contactId,'synthetic contact'),requestKey=fixture(r.requestKey);
  if(typeof r.formDigest!=='string'||!/^sha256:[a-f0-9]{64}$/.test(r.formDigest)||r.mockCrmPurposeGranted!==true||
     !['ACCEPTED','REJECTED','OUTCOME_UNKNOWN'].includes(String(r.mockTransport)))
   throw new BadRequestException('Exact form digest, explicit mock CRM purpose and known mock transport required');
  const payloadDigest=digest(['medsol-synthetic-submission-v1',org,formId,contactId,r.formDigest,r.mockTransport]);
  try{return await this.transaction(org,identity,'SUBMIT_EVIDENCE',async tx=>{
   const prior=await tx.marketingConversionSubmission.findUnique({where:{organizationId_requestKey:{organizationId:org,requestKey}}});
   if(prior){
    if(prior.payloadDigest!==payloadDigest)throw new ConflictException('Submission key reused with changed evidence');
    return{...submissionView(prior),replayed:true};
   }
   const form=await tx.marketingConversionForm.findFirst({where:{organizationId:org,id:formId},include:{approval:true}});
   if(!form)throw new NotFoundException('Synthetic form not found');
   await this.campaign(tx,org,form.campaignId,form.brandId,form.campaignVersion);
   if(form.contentDigest!==r.formDigest||form.approval.objectType!=='MarketingConversionForm'||
     form.approval.objectId!==form.id||form.approval.scopeDigest!==form.contentDigest||
     form.approval.decision!=='APPROVED'||!form.approval.decidedBy||
     form.approval.decidedBy===form.createdBy||form.approval.requestedBy!==form.createdBy)
    throw new ConflictException('Current independently approved exact form required');
   const contact=await tx.marketingSyntheticContact.findFirst({where:{organizationId:org,id:contactId,brandId:form.brandId}});
   if(!contact)throw new NotFoundException('Same-brand synthetic contact required');
   const duplicate=await tx.marketingConversionSubmission.findUnique({where:{organizationId_formId_contactId:{organizationId:org,formId,contactId}}});
   if(duplicate)throw new ConflictException('Synthetic contact already submitted; no automatic retry');
   const latest=await tx.marketingSyntheticConsent.findFirst({where:{organizationId:org,contactId},orderBy:{sequence:'desc'}});
   const suppressed=await tx.marketingSyntheticConsent.findFirst({where:{organizationId:org,contactId,action:{in:['SIMULATED_HARD_BOUNCE','SIMULATED_COMPLAINT']}}});
   if(latest?.action!=='SIMULATED_OPT_IN'||suppressed)throw new ConflictException('Current synthetic opt-in and no suppression required');
   const outcome=r.mockTransport==='ACCEPTED'?'MOCK_ACCEPTED':r.mockTransport==='REJECTED'?'MOCK_REJECTED':'OUTCOME_UNKNOWN';
   const row=await tx.marketingConversionSubmission.create({data:{id:randomUUID(),organizationId:org,formId,contactId,
    requestKey,consentEventId:latest.id,payloadDigest,outcome,createdBy:identity.userId}});
   await tx.auditEvent.create({data:{organizationId:org,actorType:'HUMAN',actorId:identity.userId,
    action:'SYNTHETIC_CONVERSION_RECORDED',objectType:'MarketingConversionSubmission',objectId:row.id,
    correlationId:row.id,after:{formId,outcome,syntheticOnly:true,externalEffectsAuthorized:false,automaticRetryAuthorized:false}}});
   return{...submissionView(row),replayed:false};
  });}catch(e){if(e instanceof Prisma.PrismaClientKnownRequestError&&['P2002','P2034'].includes(e.code))
   throw new ConflictException('Concurrent submission; refresh before retry');throw e;}
 }
}
