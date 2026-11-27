import {BadRequestException,ConflictException,ForbiddenException} from '@nestjs/common';
import {createHash} from 'node:crypto';
import type {Approval,Prisma} from '@prisma/client';
import {AGENT_ROSTER} from '@medsol/agent-runtime';
import {SAFE_DAG_CAPABILITY} from './r3g-offline-dag.js';
import {assertActorPermissionInTenantTransaction} from './tenant-role-policy.service.js';
export const SPECIALIST_REGISTRATION='OfflineSpecialistRegistration';
const hash=(v:unknown)=>'sha256:'+createHash('sha256').update(JSON.stringify(v)).digest('hex');
export function specialistInput(raw:unknown){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new BadRequestException('Exact specialist registration required');
 const v=raw as Record<string,unknown>;
 if(Object.keys(v).sort().join(',')!=='fixtureOnly,mission,name,requestKey,slug,templateAgentId'||
  v.fixtureOnly!==true||typeof v.requestKey!=='string'||!/^fixture-[A-Za-z0-9_-]{8,100}$/.test(v.requestKey)||
  typeof v.slug!=='string'||! /^[a-z][a-z0-9-]{2,63}$/.test(v.slug)||
  typeof v.name!=='string'||! /^[A-Za-z0-9][A-Za-z0-9 _-]{2,79}$/.test(v.name)||
  typeof v.mission!=='string'||v.mission.trim().length<12||v.mission.length>500||
  typeof v.templateAgentId!=='string'||!AGENT_ROSTER.some(a=>a.id===v.templateAgentId))
  throw new BadRequestException('Bounded name, mission, slug and canonical specialist template required');
 return{requestKey:v.requestKey,slug:v.slug,name:v.name,mission:v.mission.trim(),templateAgentId:v.templateAgentId,fixtureOnly:true as const};
}
type Input=ReturnType<typeof specialistInput>;
export const specialistId=(slug:string)=>'MKT-SPECIALIST-'+slug;
export const specialistApprovalId=(org:string,key:string)=>'specialist-'+hash([org,key]).slice(7);
export function specialistScope(org:string,actor:string,input:Input,reviewExpiresAt:string){
 const template=AGENT_ROSTER.find(a=>a.id===input.templateAgentId)!;
 return{schema:'medsol.offline-specialist-registration.v1',organizationId:org,requestedBy:actor,input,
  agentId:specialistId(input.slug),reviewExpiresAt,templateRisk:template.defaultRisk,
  proposedCapability:SAFE_DAG_CAPABILITY[template.id]!,fixtureOnly:true as const,
  executionAuthorized:false as const,modelCallsAuthorized:false as const,toolCallsAuthorized:false as const,
  memoryWritesAuthorized:false as const,externalEffectsAuthorized:false as const};
}
type Scope=ReturnType<typeof specialistScope>;
export function specialistDigest(s:Scope){
 const i=s.input;
 return hash([s.schema,s.organizationId,s.requestedBy,i.requestKey,i.slug,i.name,i.mission,i.templateAgentId,i.fixtureOnly,
  s.agentId,s.reviewExpiresAt,s.templateRisk,s.proposedCapability,s.fixtureOnly,s.executionAuthorized,s.modelCallsAuthorized,s.toolCallsAuthorized,s.memoryWritesAuthorized,s.externalEffectsAuthorized]);
}
export function readSpecialist(a:Approval):Scope{
 try{
  const s=a.scope as unknown as Scope,i=specialistInput(s.input);
  if(!a.requestedBy||!a.scopeExpiresAt)throw Error('scope');
  const exact=specialistScope(a.organizationId,a.requestedBy,i,a.scopeExpiresAt.toISOString());
  if(a.objectType!==SPECIALIST_REGISTRATION||a.id!==specialistApprovalId(a.organizationId,i.requestKey)||
   a.objectId!==exact.agentId||a.requiredAuthority!=='HUMAN_MARKETING_AUTHORITY'||
   specialistDigest(s)!==a.scopeDigest||specialistDigest(exact)!==a.scopeDigest)throw Error('scope');
  return exact;
 }catch{throw new ConflictException('Invalid specialist registration evidence');}
}
export async function lockSpecialist(tx:Prisma.TransactionClient,org:string){
 await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'offline-specialist:'+org})::bigint)::text AS lock_result`;
}
export async function installReviewedSpecialist(tx:Prisma.TransactionClient,a:Approval,reviewer:string,now:Date){
 const s=readSpecialist(a);
 if(reviewer===s.requestedBy)throw new ForbiddenException('Independent specialist reviewer required');
 await lockSpecialist(tx,a.organizationId);
 if(!a.scopeExpiresAt||a.scopeExpiresAt<=now)throw new ConflictException('Specialist review expired');
 const requester=await tx.user.findFirst({where:{organizationId:a.organizationId,id:s.requestedBy,disabledAt:null},select:{id:true,email:true,role:true,oidcSubject:true}});
 if(!requester?.oidcSubject)throw new ConflictException('Specialist requester unavailable');
 await assertActorPermissionInTenantTransaction(tx,{organizationId:a.organizationId,userId:requester.id,email:requester.email,role:requester.role,subject:requester.oidcSubject},'MANAGE_TENANT');
 if(await tx.agent.findFirst({where:{organizationId:a.organizationId,id:s.agentId}}))
  throw new ConflictException('Specialist identity already registered');
 const count=await tx.agent.count({where:{organizationId:a.organizationId,id:{startsWith:'MKT-SPECIALIST-'}}});
 if(count>=100)throw new ConflictException('Offline specialist registry limit reached');
 // Agent is the only installed identity owner. Empty capabilities and
 // PAUSED status ensure even future runtime changes fail closed.
 await tx.agent.create({data:{organizationId:a.organizationId,id:s.agentId,name:s.input.name,status:'PAUSED',version:1,capabilities:[]}});
 await tx.auditEvent.create({data:{organizationId:a.organizationId,actorType:'HUMAN',actorId:reviewer,action:'OFFLINE_SPECIALIST_REGISTERED_PAUSED',objectType:'Agent',objectId:s.agentId,correlationId:a.id,
  after:{approvalId:a.id,scopeDigest:a.scopeDigest,executionAuthorized:false,externalEffectsAuthorized:false}}});
}
