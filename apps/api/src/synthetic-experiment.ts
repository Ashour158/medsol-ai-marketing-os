import {BadRequestException,ConflictException,NotFoundException} from '@nestjs/common';
import {type Prisma,type Approval} from '@prisma/client';
import {createHash} from 'node:crypto';
export const SYNTHETIC_EXPERIMENT='SyntheticExperimentPlan';
const hash=(value:unknown)=>'sha256:'+createHash('sha256').update(canonical(value)).digest('hex');
function canonical(value:unknown):string{
 if(value===null||typeof value!=='object')return JSON.stringify(value)??'null';
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 const r=value as Record<string,unknown>;
 return '{'+Object.keys(r).sort().map(k=>JSON.stringify(k)+':'+canonical(r[k])).join(',')+'}';
}
function object(v:unknown){if(!v||typeof v!=='object'||Array.isArray(v))throw new BadRequestException('Bounded synthetic experiment object required');return v as Record<string,unknown>;}
function id(v:unknown,label:string){if(typeof v!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(v))throw new BadRequestException('Invalid '+label);return v;}
export function normalizeExperimentInput(raw:unknown){
 const r=object(raw);
 if(Object.keys(r).length!==6||Object.keys(r).some(k=>!['experimentKey','campaignId','formAId','formBId','contactIds','endsAt'].includes(k)))
  throw new BadRequestException('Only bounded synthetic experiment fields required');
 const experimentKey=id(r.experimentKey,'experiment key'),campaignId=id(r.campaignId,'campaign'),
  formAId=id(r.formAId,'form A'),formBId=id(r.formBId,'form B');
 if(!/^fixture-[A-Za-z0-9_-]{8,100}$/.test(experimentKey)||formAId===formBId)
  throw new BadRequestException('Fixture experiment key and two different form revisions required');
 if(!Array.isArray(r.contactIds)||r.contactIds.length<4||r.contactIds.length>100)
  throw new BadRequestException('Select 4–100 distinct existing synthetic contacts');
 const contactIds=r.contactIds.map(v=>id(v,'synthetic contact')).sort();
 if(new Set(contactIds).size!==contactIds.length)throw new BadRequestException('Duplicate synthetic contact');
 if(typeof r.endsAt!=='string'||!Number.isFinite(Date.parse(r.endsAt))||new Date(r.endsAt).toISOString()!==r.endsAt)
  throw new BadRequestException('Exact UTC ISO experiment end required');
 return{experimentKey,campaignId,formAId,formBId,contactIds,endsAt:r.endsAt};
}
type Input=ReturnType<typeof normalizeExperimentInput>;
type Tx=Prisma.TransactionClient;
type Member={contactId:string;consentEventId:string;arm:'A'|'B'};
export function assignSyntheticExperiment(org:string,input:Input,consentIds:ReadonlyMap<string,string>):Member[]{
 const ranked=input.contactIds.map(contactId=>({contactId,score:hash(['synthetic-experiment-v1',org,input.campaignId,input.experimentKey,contactId])}))
  .sort((a,b)=>a.score.localeCompare(b.score)||a.contactId.localeCompare(b.contactId));
 return ranked.map(({contactId},i)=>{
  const consentEventId=consentIds.get(contactId);
  if(!consentEventId)throw new ConflictException('Every assigned contact requires current synthetic consent');
  return{contactId,consentEventId,arm:i%2===0?'A':'B'};
 });
}
async function target(tx:Tx,org:string,input:Input){
 const campaign=await tx.campaign.findFirst({where:{organizationId:org,id:input.campaignId,status:'APPROVED'}});
 if(!campaign||!campaign.brandId)throw new ConflictException('Current approved brand campaign required');
 const brand=await tx.brand.findFirst({where:{organizationId:org,id:campaign.brandId,status:'ACTIVE'}});
 const campaignApproval=await tx.approval.findFirst({where:{organizationId:org,objectType:'Campaign',objectId:campaign.id,decision:'APPROVED',decidedBy:{not:null}}});
 if(!brand||!campaignApproval?.decidedBy||campaignApproval.requestedBy===campaignApproval.decidedBy)
  throw new ConflictException('Current independently approved campaign and active brand required');
 const forms=await tx.marketingConversionForm.findMany({where:{organizationId:org,id:{in:[input.formAId,input.formBId]},
  campaignId:campaign.id,brandId:brand.id,campaignVersion:campaign.version},include:{approval:true}});
 const a=forms.find(x=>x.id===input.formAId),b=forms.find(x=>x.id===input.formBId);
 if(!a||!b||forms.some(f=>f.approval.objectType!=='MarketingConversionForm'||f.approval.objectId!==f.id||
  f.approval.scopeDigest!==f.contentDigest||f.approval.decision!=='APPROVED'||!f.approval.decidedBy||
  f.approval.requestedBy!==f.createdBy||f.approval.decidedBy===f.createdBy))
  throw new ConflictException('Two exact independently approved current form revisions required');
 if(a.contentDigest===b.contentDigest)throw new ConflictException('Experiment arms require different immutable content');
 const contacts=await tx.marketingSyntheticContact.findMany({where:{organizationId:org,brandId:brand.id,id:{in:input.contactIds}},
  include:{consentEvents:{where:{channel:'EMAIL'},orderBy:{sequence:'desc'},take:1}}});
 const suppressed=await tx.marketingSyntheticConsent.findMany({where:{organizationId:org,contactId:{in:input.contactIds},channel:'EMAIL',
  action:{in:['SIMULATED_HARD_BOUNCE','SIMULATED_COMPLAINT']}},select:{contactId:true},distinct:['contactId']});
 if(contacts.length!==input.contactIds.length||suppressed.length||contacts.some(c=>c.consentEvents[0]?.action!=='SIMULATED_OPT_IN'))
  throw new ConflictException('Every selected contact must be a currently eligible same-brand synthetic contact');
 const prior=await tx.marketingConversionSubmission.count({where:{organizationId:org,
  formId:{in:[input.formAId,input.formBId]},contactId:{in:input.contactIds}}});
 if(prior)throw new ConflictException('Assigned contacts must not have prior submissions on either form');
 const consentIds=new Map(contacts.map(c=>[c.id,c.consentEvents[0]!.id]));
 return{brandId:brand.id,campaignVersion:campaign.version,formADigest:a.contentDigest,formBDigest:b.contentDigest,
  assignments:assignSyntheticExperiment(org,input,consentIds)};
}
export async function buildSyntheticExperiment(tx:Tx,org:string,requester:string,input:Input){
 const current=await target(tx,org,input);
 const scope={policy:'SYNTHETIC_EXPERIMENT_V1' as const,organizationId:org,requestedBy:requester,input,
  ...current,syntheticOnly:true as const,actualExposureVerified:false as const,externalEffectsAuthorized:false as const};
 return{scope,scopeDigest:hash(scope)};
}
type Scope=Awaited<ReturnType<typeof buildSyntheticExperiment>>['scope'];
/** Historical projection: verify scope shape and deterministic assignment independently of later consent changes. */
export function readSyntheticExperiment(a:Approval):Scope{
 try{
  const r=object(a.scope),input=normalizeExperimentInput(r.input);
  if(a.objectType!==SYNTHETIC_EXPERIMENT||a.organizationId!==r.organizationId||a.objectId!==input.experimentKey||
   a.requestedBy!==r.requestedBy||!a.requestedBy||a.requiredAuthority!=='HUMAN_MARKETING_AUTHORITY'||
   a.scopeExpiresAt?.toISOString()!==input.endsAt||a.scopeDigest!==hash(r)||r.policy!=='SYNTHETIC_EXPERIMENT_V1'||
   r.syntheticOnly!==true||r.actualExposureVerified!==false||r.externalEffectsAuthorized!==false||
   !Array.isArray(r.assignments)||r.assignments.length!==input.contactIds.length||!Number.isSafeInteger(r.campaignVersion)||
   typeof r.brandId!=='string'||!/^sha256:[a-f0-9]{64}$/.test(String(r.formADigest))||
   !/^sha256:[a-f0-9]{64}$/.test(String(r.formBDigest)))throw Error('invalid');
  const consentIds=new Map<string,string>();
  for(const raw of r.assignments){const m=object(raw);consentIds.set(id(m.contactId,'contact'),id(m.consentEventId,'consent'));}
  const assignments=assignSyntheticExperiment(a.organizationId,input,consentIds);
  const expected={policy:'SYNTHETIC_EXPERIMENT_V1',organizationId:a.organizationId,requestedBy:a.requestedBy,input,
   brandId:r.brandId,campaignVersion:r.campaignVersion,formADigest:r.formADigest,formBDigest:r.formBDigest,
   assignments,syntheticOnly:true,actualExposureVerified:false,externalEffectsAuthorized:false};
  if(hash(expected)!==a.scopeDigest)throw Error('changed');
  return expected as Scope;
 }catch{throw new ConflictException('Exact synthetic experiment scope invalid');}
}
export async function validateSyntheticExperimentApproval(tx:Tx,a:Approval,now:Date){
 const scope=readSyntheticExperiment(a);
 if(!a.scopeExpiresAt||a.scopeExpiresAt<=now)throw new ConflictException('Synthetic experiment scope expired');
 const current=await buildSyntheticExperiment(tx,a.organizationId,a.requestedBy!,scope.input);
 if(current.scopeDigest!==a.scopeDigest)throw new ConflictException('Experiment campaign, form or original consent scope changed');
 return scope;
}
type Recorded={contactId:string;formId:string;consentEventId:string;createdAt:Date};
export function evaluateSyntheticExperiment(scope:Scope,approvedAt:Date,rows:readonly Recorded[]){
 const end=new Date(scope.input.endsAt);
 const members=new Map(scope.assignments.map(m=>[m.contactId,m]));
 const seenA=new Set<string>(),seenB=new Set<string>(),crossover=new Set<string>(),consentChanged=new Set<string>();
 for(const r of rows){
  const m=members.get(r.contactId);
  if(!m||r.createdAt<approvedAt||r.createdAt>end||![scope.input.formAId,scope.input.formBId].includes(r.formId))continue;
  if(r.consentEventId!==m.consentEventId){consentChanged.add(r.contactId);continue;}
  const assigned=m.arm==='A'?scope.input.formAId:scope.input.formBId;
  if(r.formId!==assigned){crossover.add(r.contactId);continue;}
  (m.arm==='A'?seenA:seenB).add(r.contactId);
 }
 const contaminated=new Set([...crossover,...consentChanged]);
 const arms=(['A','B'] as const).map(arm=>{
  const assigned=scope.assignments.filter(m=>m.arm===arm).length;
  const valid=[...(arm==='A'?seenA:seenB)].filter(x=>!contaminated.has(x)).length;
  return{arm,assigned,recordedAssignedFormSubmissions:valid,
   recordedSubmissionRatePercent:Math.floor(valid*10000/assigned)/100};
 });
 return{status:contaminated.size?'CONTAMINATED_SYNTHETIC_EVIDENCE':'RECORDED_SYNTHETIC_EVIDENCE',
  arms,crossoverContacts:crossover.size,changedConsentContacts:consentChanged.size,
  actualExposureVerified:false as const,causalLiftValidated:false as const,realLeadsVerified:false as const,externalEffectsAuthorized:false as const};
}
