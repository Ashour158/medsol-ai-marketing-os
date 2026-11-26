import {BadRequestException,ConflictException,NotFoundException} from '@nestjs/common';
import {type Prisma,type Approval} from '@prisma/client';
import {createHash} from 'node:crypto';
import {reviewLeadQualification} from '@medsol/agent-runtime';
export const SYNTHETIC_LEAD_REVIEW='SyntheticLeadQualification';
const bantKeys=['budget','authority','need','timeline'] as const;
const icpKeys=['industry','companySize','role','geography'] as const;
const record=(raw:unknown)=>{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new BadRequestException('Bounded synthetic qualification object required');
 return raw as Record<string,unknown>;
};
function grades<K extends string>(raw:unknown,keys:readonly K[],min:number,max:number):Record<K,number>{
 const r=record(raw);
 if(Object.keys(r).length!==keys.length||Object.keys(r).some(k=>!keys.includes(k as K)))
  throw new BadRequestException('All qualification evidence grades are required; unknown is not zero');
 const values={} as Record<K,number>;
 for(const k of keys){
  const v=r[k];
  if(typeof v!=='number'||!Number.isSafeInteger(v)||v<min||v>max)
   throw new BadRequestException('Complete bounded synthetic qualification grades required');
  values[k]=v;
 }
 return values;
}
// Stable across JSONB key ordering; no user-controlled arbitrary strings or PII.
function canonical(value:unknown):string{
 if(value===null||typeof value!=='object')return JSON.stringify(value)??'null';
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 const r=value as Record<string,unknown>;
 return '{'+Object.keys(r).sort().map(k=>JSON.stringify(k)+':'+canonical(r[k])).join(',')+'}';
}
const digest=(value:unknown)=>'sha256:'+createHash('sha256').update(canonical(value)).digest('hex');
export async function currentSyntheticLeadTarget(tx:Prisma.TransactionClient,org:string,submissionId:string){
 const submission=await tx.marketingConversionSubmission.findFirst({where:{organizationId:org,id:submissionId},
  include:{form:{include:{approval:true}}}});
 if(!submission)throw new NotFoundException('Synthetic conversion submission not found');
 const form=submission.form;
 const [campaign,brand,contact,latest,suppressed]=await Promise.all([
  tx.campaign.findFirst({where:{organizationId:org,id:form.campaignId,brandId:form.brandId,version:form.campaignVersion,status:'APPROVED'}}),
  tx.brand.findFirst({where:{organizationId:org,id:form.brandId,status:'ACTIVE'}}),
  tx.marketingSyntheticContact.findFirst({where:{organizationId:org,id:submission.contactId,brandId:form.brandId}}),
  tx.marketingSyntheticConsent.findFirst({where:{organizationId:org,contactId:submission.contactId,channel:'EMAIL'},orderBy:{sequence:'desc'}}),
  tx.marketingSyntheticConsent.findFirst({where:{organizationId:org,contactId:submission.contactId,channel:'EMAIL',action:{in:['SIMULATED_HARD_BOUNCE','SIMULATED_COMPLAINT']}}})
 ]);
 const a=form.approval;
 if(!campaign||!brand||!contact||a.objectType!=='MarketingConversionForm'||a.objectId!==form.id||
    a.scopeDigest!==form.contentDigest||a.decision!=='APPROVED'||!a.decidedBy||
    a.decidedBy===form.createdBy||a.requestedBy!==form.createdBy)
  throw new ConflictException('Current exact independently approved form and active scope required');
 if(!latest||latest.id!==submission.consentEventId||latest.action!=='SIMULATED_OPT_IN'||suppressed)
  throw new ConflictException('Original synthetic opt-in is no longer current; review blocked');
 return submission;
}
type Target=Awaited<ReturnType<typeof currentSyntheticLeadTarget>>;
type ScopeTarget=Pick<Target,'id'|'organizationId'|'formId'|'payloadDigest'|'consentEventId'|'createdBy'|'outcome'> &
 {form:Pick<Target['form'],'brandId'|'campaignId'|'campaignVersion'|'contentDigest'>};
export function syntheticQualificationScope(target:ScopeTarget,requester:string,raw:unknown){
 const r=record(raw);
 if(Object.keys(r).some(k=>!['bant','icp'].includes(k)))throw new BadRequestException('Only anonymous numeric grades are permitted');
 const bant=grades(r.bant,bantKeys,1,5),icp=grades(r.icp,icpKeys,0,2);
 const assessment=reviewLeadQualification(target.organizationId,{organizationId:target.organizationId,
  brandId:target.form.brandId,sourceReference:'internal:synthetic-submission/'+target.id,
  sourceReviewed:true,purposeAllowed:true,bant,icp});
 const scope={policy:'SYNTHETIC_QUALIFICATION_V1',organizationId:target.organizationId,submissionId:target.id,
  formId:target.formId,brandId:target.form.brandId,campaignId:target.form.campaignId,campaignVersion:target.form.campaignVersion,
  formDigest:target.form.contentDigest,submissionDigest:target.payloadDigest,consentEventId:target.consentEventId,
  submissionCreatedBy:target.createdBy,requestedBy:requester,priorMockOutcome:target.outcome,bant,icp,assessment,
  syntheticOnly:true as const,realLeadVerified:false as const,externalEffectsAuthorized:false as const};
 return{scope,scopeDigest:digest(scope)};
}
export function matchSyntheticQualification(target:ScopeTarget,a:Approval){
 try{
  if(a.objectType!==SYNTHETIC_LEAD_REVIEW||a.organizationId!==target.organizationId||a.objectId!==target.id||
     !a.requestedBy||a.requiredAuthority!=='HUMAN_MARKETING_AUTHORITY'||!a.scopeDigest)return null;
  const r=record(a.scope),expected=syntheticQualificationScope(target,a.requestedBy,{bant:r.bant,icp:r.icp});
  if(expected.scopeDigest!==a.scopeDigest||digest(r)!==a.scopeDigest)return null;
  return expected;
 }catch{return null;}
}
