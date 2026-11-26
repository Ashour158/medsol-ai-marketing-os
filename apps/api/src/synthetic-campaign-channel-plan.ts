import {BadRequestException,ConflictException,NotFoundException} from '@nestjs/common';
import type {Approval,Prisma} from '@prisma/client';
import {createHash} from 'node:crypto';
import {reviewCorporateCommunication} from '@medsol/agent-runtime';
import {parseRules} from './brand-master.service.js';
import {safeForAgentEvidence} from './agent-content-firewall.js';
export const SYNTHETIC_CAMPAIGN_PLAN='SyntheticCampaignChannelPlan';
const canon=(v:unknown):string=>v===null||typeof v!=='object'?JSON.stringify(v)??'null':Array.isArray(v)?'['+v.map(canon).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canon((v as Record<string,unknown>)[k])).join(',')+'}';
const hash=(v:unknown)=>'sha256:'+createHash('sha256').update(canon(v)).digest('hex');
const id=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
const plain=(v:unknown,max:number):v is string=>typeof v==='string'&&v.trim().length>=3&&v.length<=max&&!/[<>\u0000-\u001f\u007f]/u.test(v)&&safeForAgentEvidence(v);
const kinds=['PRESS_RELEASE','EARNED_MEDIA_PITCH','EXECUTIVE_STATEMENT','CRISIS_RESPONSE'];
const paid=['SEARCH_ADS','SOCIAL_ADS','DISPLAY_ADS'];
export function normalizeChannelPlan(raw:unknown){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new BadRequestException('Exact synthetic channel plan required');
 const r=raw as Record<string,unknown>,fields=['requestKey','kind','channel','headline','body','sourceIds','expiresAt','fixtureOnly','regulatedClaim','currency','budgetMicros'];
 if(Object.keys(r).length!==fields.length||fields.some(k=>!Object.prototype.hasOwnProperty.call(r,k))||!id(r.requestKey)||!/^fixture-[A-Za-z0-9_-]{8,100}$/.test(r.requestKey)||
  !plain(r.headline,140)||!plain(r.body,1800)||!Array.isArray(r.sourceIds)||r.sourceIds.length<1||r.sourceIds.length>5||!r.sourceIds.every(id)||
  new Set(r.sourceIds).size!==r.sourceIds.length||typeof r.expiresAt!=='string'||!Number.isFinite(Date.parse(r.expiresAt))||new Date(r.expiresAt).toISOString()!==r.expiresAt||
  r.fixtureOnly!==true||typeof r.regulatedClaim!=='boolean')throw new BadRequestException('Invalid bounded synthetic channel plan');
 if(r.kind==='COMMUNICATIONS'){
  if(!kinds.includes(String(r.channel))||r.currency!==null||r.budgetMicros!==null)throw new BadRequestException('Communications rehearsal cannot authorize budget or dispatch');
 }else if(r.kind==='PAID_MEDIA'){
  if(!paid.includes(String(r.channel))||typeof r.currency!=='string'||!/^[A-Z]{3}$/.test(r.currency)||typeof r.budgetMicros!=='string'||!/^[1-9][0-9]{0,11}$/.test(r.budgetMicros))
   throw new BadRequestException('Bounded hypothetical paid media budget and currency required');
 }else throw new BadRequestException('Unsupported synthetic campaign channel');
 return{requestKey:r.requestKey,kind:r.kind as 'COMMUNICATIONS'|'PAID_MEDIA',channel:r.channel as string,headline:r.headline.trim(),body:r.body.trim(),
  sourceIds:(r.sourceIds as string[]).slice().sort(),expiresAt:r.expiresAt,fixtureOnly:true as const,regulatedClaim:r.regulatedClaim,
  currency:r.currency as string|null,budgetMicros:r.budgetMicros as string|null};
}
type Input=ReturnType<typeof normalizeChannelPlan>;
export const channelPlanId=(org:string,key:string)=>'channel-'+hash([org,key]).slice(7);
const normalized=(s:string)=>s.normalize('NFKC').toLowerCase().replace(/\s+/gu,' ').trim();
export function checkChannelCopy(input:Input,rulesRaw:unknown){
 const rules=parseRules(rulesRaw),parts=[normalized(input.headline),normalized(input.body)];
 const contains=(s:string)=>parts.some(p=>p.includes(normalized(s)));
 if(rules.prohibitedClaims.some(contains)||rules.requiredDisclaimers.some(s=>!contains(s)))throw new ConflictException('Literal brand-policy findings must be resolved before internal review');
}
export async function buildChannelPlan(tx:Prisma.TransactionClient,org:string,actor:string,campaignId:string,input:Input,now:Date,lock=false){
 const expiry=new Date(input.expiresAt);
 if(expiry<=now||expiry.getTime()>now.getTime()+30*86400000)throw new BadRequestException('Channel plan expiry must be within 30 days');
 if(lock)await tx.$queryRaw`SELECT "id" FROM "Campaign" WHERE "organizationId"=${org} AND "id"=${campaignId} FOR UPDATE`;
 const campaign=await tx.campaign.findFirst({where:{organizationId:org,id:campaignId,status:'APPROVED'},select:{id:true,version:true,brandId:true}});
 if(!campaign?.brandId)throw new NotFoundException('Current approved tenant brand campaign required');
 if(lock)await tx.$queryRaw`SELECT "id" FROM "Brand" WHERE "organizationId"=${org} AND "id"=${campaign.brandId} FOR UPDATE`;
 const brand=await tx.brand.findFirst({where:{organizationId:org,id:campaign.brandId,status:'ACTIVE'},select:{id:true}});
 const decision=await tx.approval.findFirst({where:{organizationId:org,objectType:'Campaign',objectId:campaign.id,decision:'APPROVED',decidedBy:{not:null}},orderBy:[{decidedAt:'desc'},{id:'asc'}],select:{id:true,requestedBy:true,decidedBy:true}});
 if(!brand||!decision?.decidedBy||decision.requestedBy===decision.decidedBy)throw new ConflictException('Independent campaign approval and active brand required');
 const policy=await tx.brandMasterRevision.findFirst({where:{organizationId:org,status:'APPROVED'},orderBy:{version:'desc'},select:{id:true,version:true,rules:true,approvedBy:true,proposedBy:true,approvedAt:true}});
 if(!policy?.approvedAt||!policy.approvedBy||policy.approvedBy===policy.proposedBy)throw new ConflictException('Independently reviewed tenant brand policy required');
 checkChannelCopy(input,policy.rules);
 if(lock)for(const docId of input.sourceIds)await tx.$queryRaw`SELECT "id" FROM "KnowledgeDocument" WHERE "organizationId"=${org} AND "id"=${docId} FOR UPDATE`;
 const docs=await tx.knowledgeDocument.findMany({where:{organizationId:org,id:{in:input.sourceIds},status:'REVIEWED',sourceUrl:{not:null},OR:[{expiresAt:null},{expiresAt:{gt:expiry}}]},
  select:{id:true,contentDigest:true,reviewedBy:true,createdBy:true},orderBy:{id:'asc'}});
 if(docs.length!==input.sourceIds.length||docs.some(d=>!d.reviewedBy||d.reviewedBy===d.createdBy||!/^sha256:[a-f0-9]{64}$/.test(d.contentDigest)))
  throw new ConflictException('Current independently reviewed source references required');
 const sources=docs.map(d=>({documentId:d.id,contentDigest:d.contentDigest}));
 const risk=input.kind==='COMMUNICATIONS'?reviewCorporateCommunication(org,{organizationId:org,briefId:campaignId,type:input.channel,regulatedClaim:input.regulatedClaim,
  claimEvidence:sources.map(s=>({organizationId:org,claimId:s.documentId,sourceReference:'internal:knowledge/'+s.documentId,authorityVerified:false,rightsReviewed:false}))}):null;
 const scope={policy:'SYNTHETIC_CAMPAIGN_CHANNEL_V1' as const,organizationId:org,requestedBy:actor,campaignId,campaignVersion:campaign.version,
  brandId:brand.id,campaignApprovalId:decision.id,brandPolicyId:policy.id,brandPolicyVersion:policy.version,brandPolicyDigest:hash(policy.rules),
  input,sources,reviewRoles:risk?.reviewRoles??['MARKETING_OWNER','BUDGET_OWNER'],
  syntheticOnly:true as const,claimVerification:false as const,professionalReviewVerified:false as const,budgetAuthorized:false as const,
  actualMediaSpendMicros:'0' as const,distributionAuthorized:false as const,externalEffectsAuthorized:false as const};
 return{scope,scopeDigest:hash(scope)};
}
type Scope=Awaited<ReturnType<typeof buildChannelPlan>>['scope'];
export function readChannelPlan(a:Approval):Scope{
 try{
  const s=a.scope as unknown as Scope,i=normalizeChannelPlan(s.input);
  if(a.objectType!==SYNTHETIC_CAMPAIGN_PLAN||a.id!==channelPlanId(a.organizationId,i.requestKey)||s.organizationId!==a.organizationId||
   a.objectId!==s.campaignId||!id(s.campaignId)||!a.requestedBy||a.requestedBy!==s.requestedBy||
   a.requiredAuthority!=='HUMAN_MARKETING_AUTHORITY'||a.scopeExpiresAt?.toISOString()!==i.expiresAt||s.policy!=='SYNTHETIC_CAMPAIGN_CHANNEL_V1'||
   s.syntheticOnly!==true||s.claimVerification!==false||s.professionalReviewVerified!==false||s.budgetAuthorized!==false||
   s.actualMediaSpendMicros!=='0'||s.distributionAuthorized!==false||s.externalEffectsAuthorized!==false||
   !Array.isArray(s.sources)||s.sources.length!==i.sourceIds.length||s.sources.some((x,j)=>x.documentId!==i.sourceIds[j]||!/^sha256:[a-f0-9]{64}$/.test(x.contentDigest))||
   hash(s)!==a.scopeDigest||hash({...s,input:i})!==a.scopeDigest)throw Error('scope');
  return{...s,input:i};
 }catch{throw new ConflictException('Exact synthetic channel plan scope invalid');}
}
export async function validateChannelPlanApproval(tx:Prisma.TransactionClient,a:Approval,now:Date){
 const s=readChannelPlan(a),current=await buildChannelPlan(tx,a.organizationId,s.requestedBy,s.campaignId,s.input,now,true);
 if(current.scopeDigest!==a.scopeDigest)throw new ConflictException('Campaign, policy or evidence changed since channel plan');
 return s;
}

export const CHANNEL_REHEARSAL_COMMAND='RehearseSyntheticCampaignChannel';
export const channelRehearsalCommandId=(org:string,approvalId:string)=>'channel-rehearsal-'+hash([org,approvalId]).slice(7);
export function normalizeChannelRehearsal(raw:unknown){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new BadRequestException('Exact synthetic rehearsal input required');
 const r=raw as Record<string,unknown>;
 if(Object.keys(r).length!==2||r.fixtureOnly!==true||!['MOCK_ACCEPTED','MOCK_REJECTED','OUTCOME_UNKNOWN'].includes(String(r.scenario)))throw new BadRequestException('Explicit known synthetic transport scenario required');
 return r.scenario as 'MOCK_ACCEPTED'|'MOCK_REJECTED'|'OUTCOME_UNKNOWN';
}
export function buildChannelRehearsal(a:Approval,scenario:ReturnType<typeof normalizeChannelRehearsal>){
 const scope=readChannelPlan(a);
 if(a.decision!=='APPROVED'||!a.decidedBy||a.decidedBy===a.requestedBy||!a.decidedAt)throw new ConflictException('Independent exact channel plan approval required');
 const reference=hash(['synthetic-channel-rehearsal-v1',a.organizationId,a.id,a.scopeDigest,scenario]);
 return{schema:'medsol.synthetic-channel-rehearsal.v1' as const,approvalId:a.id,campaignId:scope.campaignId,scopeDigest:a.scopeDigest,
  scenario,kind:scope.input.kind,channel:scope.input.channel,fixtureReference:reference,
  virtualOutcome:scenario==='MOCK_ACCEPTED'?'VIRTUAL_ACCEPTED':scenario==='MOCK_REJECTED'?'VIRTUAL_REJECTED':'UNKNOWN_NO_RETRY',
  mockReadback:scenario==='MOCK_ACCEPTED'?'FIXTURE_MATCHED':scenario==='MOCK_REJECTED'?'FIXTURE_REJECTED':'UNCONFIRMED',
  // An accepted fixture is not proof of audience exposure, media mentions,
  // delivery, campaign performance, or settlement of a hypothetical budget.
  plannedBudgetMicros:scope.input.budgetMicros,currency:scope.input.currency,
  actualMediaSpendMicros:'0',actualPublications:0,actualNetworkRequests:0,verifiedProviderReceipts:0,
  actualImpressionsVerified:false,earnedMediaMentionsVerified:false,
  syntheticOnly:true as const,automaticRetryAuthorized:false as const,externalEffectsAuthorized:false as const};
}
