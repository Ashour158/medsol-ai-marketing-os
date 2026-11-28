import {BadRequestException,ConflictException,ForbiddenException} from '@nestjs/common';
import {createHash} from 'node:crypto';
import type {Approval,Prisma} from '@prisma/client';
import {isSpecialistId} from './offline-specialist.js';
import {currentRetirementRegistration} from './offline-specialist-retirement.js';
import {assertActorPermissionInTenantTransaction} from './tenant-role-policy.service.js';
import {normalizeReviewSkills,type SpecialistReviewSkill} from './specialist-mission-brain.js';
import {evaluateSpecialistReviewSkills} from './specialist-skill-evaluation.js';
export const SPECIALIST_CONFIG='OfflineSpecialistConfiguration';
const hash=(v:unknown)=>'sha256:'+createHash('sha256').update(JSON.stringify(v)).digest('hex');
export function configInput(raw:unknown){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new BadRequestException('Exact specialist configuration required');
 const v=raw as Record<string,unknown>;
 if(!['action,agentId,evidenceRequired,expectedVersion,fixtureOnly,maxObjectiveChars,mission,requestKey','action,agentId,evidenceRequired,expectedVersion,fixtureOnly,maxObjectiveChars,mission,requestKey,reviewSkills'].includes(Object.keys(v).sort().join(','))||v.action!=='CONFIGURE'||v.fixtureOnly!==true||
 !isSpecialistId(v.agentId)||typeof v.requestKey!=='string'||!/^fixture-[A-Za-z0-9_-]{8,100}$/.test(v.requestKey)||
 typeof v.mission!=='string'||v.mission.trim().length<12||v.mission.length>500||typeof v.evidenceRequired!=='boolean'||
 typeof v.expectedVersion!=='number'||!Number.isSafeInteger(v.expectedVersion)||v.expectedVersion<0||v.expectedVersion>=50||
 typeof v.maxObjectiveChars!=='number'||!Number.isSafeInteger(v.maxObjectiveChars)||v.maxObjectiveChars<12||v.maxObjectiveChars>500)
  throw new BadRequestException('Bounded mission, evidence policy, objective limit and expected configuration version required');
 return{action:'CONFIGURE' as const,agentId:v.agentId,requestKey:v.requestKey,mission:v.mission.trim(),evidenceRequired:v.evidenceRequired,expectedVersion:v.expectedVersion,maxObjectiveChars:v.maxObjectiveChars,fixtureOnly:true as const,...(Object.hasOwn(v,'reviewSkills')?{reviewSkills:normalizeReviewSkills(v.reviewSkills)}:{})};
}
type Input=ReturnType<typeof configInput>;
export type ConfigPin={approvalId:string;digest:string;version:number;mission:string;evidenceRequired:boolean;maxObjectiveChars:number;reviewSkills?:SpecialistReviewSkill[]};
export const configId=(org:string,key:string)=>'specialist-config-'+hash([org,key]).slice(7);
export function configScope(org:string,actor:string,input:Input,registrationId:string,registrationDigest:string,previousDigest:string|null,expiresAt:string){
 return{schema:'medsol.offline-specialist-config.v1',organizationId:org,requestedBy:actor,input,registrationId,registrationDigest,previousDigest,expiresAt,version:input.expectedVersion+1,...(input.reviewSkills!==undefined?{skillEvaluation:evaluateSpecialistReviewSkills(input.reviewSkills)}:{}),
  executionAuthorized:false as const,modelCallsAuthorized:false as const,toolCallsAuthorized:false as const,memoryWritesAuthorized:false as const,externalEffectsAuthorized:false as const};
}
type Scope=ReturnType<typeof configScope>;
export function configDigest(s:Scope){
 const i=s.input;
 return hash([s.schema,s.organizationId,s.requestedBy,i.action,i.agentId,i.requestKey,i.mission,i.evidenceRequired,i.expectedVersion,i.maxObjectiveChars,i.fixtureOnly,s.registrationId,s.registrationDigest,s.previousDigest,s.expiresAt,s.version,s.executionAuthorized,s.modelCallsAuthorized,s.toolCallsAuthorized,s.memoryWritesAuthorized,s.externalEffectsAuthorized,...(i.reviewSkills!==undefined?['reviewSkills',normalizeReviewSkills(i.reviewSkills),s.skillEvaluation?.schema,s.skillEvaluation?.skills,s.skillEvaluation?.results.map(r=>[r.id,r.passed]),s.skillEvaluation?.passed,s.skillEvaluation?.modelQualityEvaluated,s.skillEvaluation?.scientificVerification,s.skillEvaluation?.capabilityExpansionAuthorized]:[])]);
}
const validDigest=(v:unknown):v is string=>typeof v==='string'&&/^sha256:[0-9a-f]{64}$/.test(v);
export function readConfig(a:Approval){
 try{
  const s=a.scope as unknown as Scope,i=configInput(s.input);
  if(!a.requestedBy||!a.scopeExpiresAt||typeof s.registrationId!=='string'||!/^specialist-[0-9a-f]{64}$/.test(s.registrationId)||!validDigest(s.registrationDigest)||
   (i.expectedVersion===0?s.previousDigest!==null:!validDigest(s.previousDigest)))throw Error('scope');
  const exact=configScope(a.organizationId,a.requestedBy,i,s.registrationId,s.registrationDigest,s.previousDigest,a.scopeExpiresAt.toISOString());
  if(a.objectType!==SPECIALIST_CONFIG||a.id!==configId(a.organizationId,i.requestKey)||a.objectId!==i.agentId||
   a.requiredAuthority!=='HUMAN_MARKETING_AUTHORITY'||configDigest(s)!==a.scopeDigest||configDigest(exact)!==a.scopeDigest)throw Error('scope');
  return exact;
 }catch{throw new ConflictException('Invalid specialist configuration evidence');}
}
export function configPinTuple(p:ConfigPin){
 if(!p||typeof p.approvalId!=='string'||!/^specialist-config-[0-9a-f]{64}$/.test(p.approvalId)||!validDigest(p.digest)||!Number.isSafeInteger(p.version)||p.version<1||p.version>50||
 typeof p.mission!=='string'||p.mission.trim().length<12||p.mission.length>500||typeof p.evidenceRequired!=='boolean'||!Number.isSafeInteger(p.maxObjectiveChars)||p.maxObjectiveChars<12||p.maxObjectiveChars>500)
 throw new ConflictException('Invalid specialist configuration pin');
 return[p.approvalId,p.digest,p.version,p.mission,p.evidenceRequired,p.maxObjectiveChars,...(p.reviewSkills!==undefined?['reviewSkills',normalizeReviewSkills(p.reviewSkills)]:[])];
}
export function assertConfigPolicy(pin:ConfigPin|undefined,objective:string,contextQuery:string|undefined){
 if(pin&&(objective.length>pin.maxObjectiveChars||(pin.evidenceRequired&&!contextQuery)))throw new ConflictException('Task violates reviewed specialist configuration');
}
/** Caller holds the canonical agent row lock (or a read-only serializable snapshot). */
export async function currentConfig(tx:Prisma.TransactionClient,org:string,agentId:string,reg:{id:string;digest:string}):Promise<ConfigPin|undefined>{
 const rows=await tx.approval.findMany({where:{organizationId:org,objectType:SPECIALIST_CONFIG,objectId:agentId,decision:'APPROVED'},take:51});
 if(rows.length>50)throw new ConflictException('Specialist configuration history exceeds limit');
 const revisions=rows.map(a=>({a,s:readConfig(a)})).sort((a,b)=>a.s.version-b.s.version);
 let current:ConfigPin|undefined;
 for(const {a,s} of revisions){
  if(!a.decidedBy||a.decidedBy===a.requestedBy||!a.decidedAt||!a.scopeExpiresAt||a.decidedAt>=a.scopeExpiresAt||
   s.registrationId!==reg.id||s.registrationDigest!==reg.digest||s.version!==(current?.version??0)+1||s.previousDigest!==(current?.digest??null)||!a.scopeDigest)
   throw new ConflictException('Specialist configuration chain invalid');
  current={approvalId:a.id,digest:a.scopeDigest,version:s.version,mission:s.input.mission,evidenceRequired:s.input.evidenceRequired,maxObjectiveChars:s.input.maxObjectiveChars,...(s.input.reviewSkills!==undefined?{reviewSkills:s.input.reviewSkills}:{})};
 }
 return current;
}
export async function approveSpecialistConfig(tx:Prisma.TransactionClient,a:Approval,reviewer:string,now:Date){
 const s=readConfig(a),org=a.organizationId,id=s.input.agentId;
 if(reviewer===s.requestedBy)throw new ForbiddenException('Independent configuration reviewer required');
 if(!a.scopeExpiresAt||a.scopeExpiresAt<=now)throw new ConflictException('Specialist configuration review expired');
 const requester=await tx.user.findFirst({where:{organizationId:org,id:s.requestedBy,disabledAt:null},select:{id:true,email:true,role:true,oidcSubject:true}});
 if(!requester?.oidcSubject)throw new ForbiddenException('Current configuration requester required');
 await assertActorPermissionInTenantTransaction(tx,{organizationId:org,userId:requester.id,email:requester.email,role:requester.role,subject:requester.oidcSubject},'MANAGE_TENANT');
 await tx.$queryRaw`SELECT "id" FROM "Agent" WHERE "organizationId"=${org} AND "id"=${id} FOR UPDATE`;
 const reg=await currentRetirementRegistration(tx,org,id),current=await currentConfig(tx,org,id,reg);
 if(current?.reviewSkills!==undefined&&s.input.reviewSkills===undefined)throw new ConflictException('Explicit review skill selection required for revised configuration');
 if(reg.id!==s.registrationId||reg.digest!==s.registrationDigest||(current?.version??0)!==s.input.expectedVersion||(current?.digest??null)!==s.previousDigest)
  throw new ConflictException('Specialist configuration changed; request fresh review');
 await tx.auditEvent.create({data:{organizationId:org,actorType:'HUMAN',actorId:reviewer,action:'OFFLINE_SPECIALIST_CONFIG_APPROVED',objectType:'Agent',objectId:id,correlationId:a.id,before:{version:current?.version??0},after:{version:s.version,scopeDigest:a.scopeDigest,executionAuthorized:false,externalEffectsAuthorized:false}}});
}
