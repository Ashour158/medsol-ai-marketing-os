import {BadRequestException,ConflictException,NotFoundException} from '@nestjs/common';
import type {Approval,Prisma} from '@prisma/client';
import {createHash} from 'node:crypto';
import {OFFLINE_CAMPAIGN_STAGE_KEYS} from '@medsol/contracts';
import {reviewCustomerActivation} from '@medsol/agent-runtime';
import {readOfflineJourneyInTransaction} from './marketing-read.service.js';
import {BUSINESS_PROFILE_PREFIX,decodeBusinessProfile} from './business-profile.js';
import {knowledgeSourceDigest} from './knowledge-retrieval.js';
import {parseRules} from './brand-master.service.js';
export const ACTIVATION_REVIEW='SyntheticCustomerActivationReview';
const canon=(v:unknown):string=>v===null||typeof v!=='object'?JSON.stringify(v)??'null':Array.isArray(v)?'['+v.map(canon).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canon((v as Record<string,unknown>)[k])).join(',')+'}';
const hash=(v:unknown)=>'sha256:'+createHash('sha256').update(canon(v)).digest('hex');
const id=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
export function normalizeActivationInput(raw:unknown){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new BadRequestException('Exact synthetic activation review required');
 const v=raw as Record<string,unknown>;
 if(Object.keys(v).sort().join(',')!=='brandId,campaignId,expiresAt,fixtureOnly,profileDocumentId,requestKey,targets'||
  !id(v.brandId)||!id(v.campaignId)||!id(v.profileDocumentId)||!id(v.requestKey)||!/^fixture-[A-Za-z0-9_-]{8,100}$/.test(v.requestKey)||
  v.fixtureOnly!==true||typeof v.expiresAt!=='string'||!Number.isFinite(Date.parse(v.expiresAt))||new Date(v.expiresAt).toISOString()!==v.expiresAt||
  !v.targets||typeof v.targets!=='object'||Array.isArray(v.targets))throw new BadRequestException('Invalid synthetic activation references');
 const t=v.targets as Record<string,unknown>;
 if(Object.keys(t).sort().join(',')!=='offlineGates,reviewedObservations,syntheticEmailRuns,virtualSocialRuns')throw new BadRequestException('Exact bounded internal value targets required');
 const count=(x:unknown,max:number)=>{if(typeof x!=='number'||!Number.isSafeInteger(x)||x<1||x>max)throw new BadRequestException('Invalid internal rehearsal target');return x;};
 return{requestKey:v.requestKey,brandId:v.brandId,campaignId:v.campaignId,profileDocumentId:v.profileDocumentId,expiresAt:v.expiresAt,fixtureOnly:true as const,
  targets:{offlineGates:count(t.offlineGates,10),reviewedObservations:count(t.reviewedObservations,100),syntheticEmailRuns:count(t.syntheticEmailRuns,20),virtualSocialRuns:count(t.virtualSocialRuns,20)}};
}
type Input=ReturnType<typeof normalizeActivationInput>;
export const activationReviewId=(org:string,key:string)=>'activation-'+hash([org,key]).slice(7);
export function compareActivationTargets(targets:Input['targets'],observed:Input['targets']){
 return Object.fromEntries((Object.keys(targets) as Array<keyof typeof targets>).sort().map(k=>[k,{target:targets[k],observed:observed[k],met:observed[k]>=targets[k]}]));
}
export async function buildActivationReview(tx:Prisma.TransactionClient,org:string,requester:string,input:Input,now:Date,lock=false){
 const expiry=new Date(input.expiresAt);
 if(expiry<=now||expiry.getTime()>now.getTime()+30*86400000)throw new BadRequestException('Activation review expires within 30 days');
 if(lock){
  await tx.$queryRaw`SELECT "id" FROM "Campaign" WHERE "organizationId"=${org} AND "id"=${input.campaignId} FOR SHARE`;
  await tx.$queryRaw`SELECT "id" FROM "Brand" WHERE "organizationId"=${org} AND "id"=${input.brandId} FOR SHARE`;
  await tx.$queryRaw`SELECT "id" FROM "KnowledgeDocument" WHERE "organizationId"=${org} AND "id"=${input.profileDocumentId} FOR SHARE`;
 }
 const brand=await tx.brand.findFirst({where:{organizationId:org,id:input.brandId,status:'ACTIVE'},select:{id:true,updatedAt:true}});
 if(!brand)throw new NotFoundException('Active tenant brand required');
 const journey=await readOfflineJourneyInTransaction(tx,org,input.campaignId);
 if(journey.campaign.brandId!==brand.id)throw new ConflictException('Activation campaign belongs to another brand');
 const doc=await tx.knowledgeDocument.findFirst({where:{organizationId:org,id:input.profileDocumentId,sourceKey:{startsWith:BUSINESS_PROFILE_PREFIX},status:'REVIEWED',sourceUrl:{not:null},expiresAt:{gt:expiry}},select:{id:true,contentDigest:true,createdBy:true,reviewedBy:true,expiresAt:true,title:true}});
 const chunks=doc?await tx.knowledgeChunk.findMany({where:{organizationId:org,documentId:doc.id},take:2,select:{ordinal:true,content:true,digest:true}}):[];
 const chunk=chunks[0],profile=chunk&&decodeBusinessProfile(chunk.content);
 if(!doc||!doc.reviewedBy||doc.reviewedBy===doc.createdBy||chunks.length!==1||chunk?.ordinal!==0||!profile||
  doc.title!=='Business profile · '+profile.name||knowledgeSourceDigest(chunk.content)!==doc.contentDigest||chunk.digest!==doc.contentDigest)
  throw new ConflictException('Current independently reviewed business profile required');
 const policy=await tx.brandMasterRevision.findFirst({where:{organizationId:org,status:'APPROVED'},orderBy:{version:'desc'},select:{id:true,version:true,rules:true,approvedBy:true,proposedBy:true,approvedAt:true}});
 if(policy?.approvedBy&&policy.approvedBy!==policy.proposedBy&&policy.approvedAt)parseRules(policy.rules);
 const policyReviewed=!!policy?.approvedBy&&policy.approvedBy!==policy.proposedBy&&!!policy.approvedAt;
 const user=await tx.user.findFirst({where:{organizationId:org,id:requester,disabledAt:null,oidcSubject:{not:null}},select:{id:true,role:true,tenantRoleDefinitionId:true}});
 if(!user)throw new ConflictException('Current provisioned activation operator required');
 const currentApproval=journey.campaignApprovals.find(a=>a.decision==='APPROVED'&&a.decidedBy&&a.decidedBy!==a.requestedBy);
 const stages=OFFLINE_CAMPAIGN_STAGE_KEYS.map(key=>({key,met:key==='campaignIndependentlyApproved'?journey.campaign.status==='APPROVED'&&!!currentApproval:journey.stages[key]===true}));
 // The timeline windows are bounded observations, not a complete population.
 const reviewed=journey.observations.filter(o=>o.status==='REVIEWED').map(o=>({id:o.id,key:o.metricKey,value:o.value,reviewedAt:o.reviewedAt?.toISOString()??null})).sort((a,b)=>a.id.localeCompare(b.id));
 const social=journey.publications.filter(p=>p.status==='SIMULATED'&&p.attempts.some(a=>a.mode==='SANDBOX')).map(p=>({id:p.id,scopeDigest:p.scopeDigest,version:p.version})).sort((a,b)=>a.id.localeCompare(b.id));
 const emails=journey.emailSimulations.filter(e=>e.status==='SIMULATED').map(e=>({id:e.id,audienceDigest:e.audienceDigest,contentDigest:e.contentDigest})).sort((a,b)=>a.id.localeCompare(b.id));
 const observed={offlineGates:stages.filter(s=>s.met).length,reviewedObservations:reviewed.length,syntheticEmailRuns:emails.length,virtualSocialRuns:social.length};
 const value=compareActivationTargets(input.targets,observed);
 const assessment=reviewCustomerActivation(org,{organizationId:org,tenantIsolationVerified:false,brandMasterReviewed:policyReviewed,identityConfigured:true,
  rolesAndEntitlementsVerified:false,exactVersionApprovalsVerified:false,dataRightsReviewed:false,providerCapabilityVerified:false,incidentRunbookAccepted:false});
 const scope={schema:'medsol.synthetic-customer-activation.v1',organizationId:org,requestedBy:requester,input,brandRevision:brand.updatedAt.toISOString(),campaignVersion:journey.campaign.version,
  profileDigest:doc.contentDigest,profileExpiresAt:doc.expiresAt?.toISOString()??null,policyId:policyReviewed?policy!.id:null,policyDigest:policyReviewed?hash(policy!.rules):null,
  campaignApprovalId:currentApproval?.id??null,operatorRole:user.role,operatorTenantRoleId:user.tenantRoleDefinitionId,stages,
  value,valueEvidenceDigest:hash({reviewed,social,emails}),windowBounded:true as const,assessment,
  realCustomerValueVerified:false as const,customerActivationAuthorized:false as const,billingAuthorized:false as const,externalEffectsAuthorized:false as const,productionCertified:false as const};
 return{scope,scopeDigest:hash(scope)};
}
type Scope=Awaited<ReturnType<typeof buildActivationReview>>['scope'];
export function readActivationReview(a:Approval):Scope{
 try{const s=a.scope as unknown as Scope,input=normalizeActivationInput(s.input);
  if(a.objectType!==ACTIVATION_REVIEW||a.id!==activationReviewId(a.organizationId,input.requestKey)||a.objectId!==input.brandId||
   a.organizationId!==s.organizationId||a.requestedBy!==s.requestedBy||!a.requestedBy||a.requiredAuthority!=='HUMAN_MARKETING_AUTHORITY'||
   a.scopeExpiresAt?.toISOString()!==input.expiresAt||s.schema!=='medsol.synthetic-customer-activation.v1'||
   s.realCustomerValueVerified!==false||s.customerActivationAuthorized!==false||s.billingAuthorized!==false||
   s.externalEffectsAuthorized!==false||s.productionCertified!==false||s.assessment.productionAuthorized!==false||s.assessment.readyForCustomerPilot!==false||
   hash(s)!==a.scopeDigest||hash({...s,input})!==a.scopeDigest)throw Error('scope');
  return{...s,input};
 }catch{throw new ConflictException('Exact customer activation evidence scope invalid');}
}
export async function validateActivationReview(tx:Prisma.TransactionClient,a:Approval,now:Date){
 const s=readActivationReview(a),current=await buildActivationReview(tx,a.organizationId,s.requestedBy,s.input,now,true);
 if(current.scopeDigest!==a.scopeDigest)throw new ConflictException('Customer activation evidence changed; request a fresh review');
 return s;
}
