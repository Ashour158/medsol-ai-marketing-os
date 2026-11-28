import {BadRequestException,ConflictException,ForbiddenException} from '@nestjs/common';
import type {Approval,Prisma} from '@prisma/client';
import {createHash} from 'node:crypto';
import {isSpecialistId,assertReviewedSpecialist,SPECIALIST_REGISTRATION} from './offline-specialist.js';
import {assertActorPermissionInTenantTransaction} from './tenant-role-policy.service.js';
export const SPECIALIST_RETIREMENT='OfflineSpecialistRetirement';
const hash=(v:unknown)=>'sha256:'+createHash('sha256').update(JSON.stringify(v)).digest('hex');
export function retirementInput(raw:unknown){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new BadRequestException('Exact specialist retirement required');
 const v=raw as Record<string,unknown>;
 if(Object.keys(v).sort().join(',')!=='action,agentId,fixtureOnly,reason,requestKey'||v.action!=='RETIRE'||v.fixtureOnly!==true||
 !isSpecialistId(v.agentId)||typeof v.requestKey!=='string'||!/^fixture-[A-Za-z0-9_-]{8,100}$/.test(v.requestKey)||
 typeof v.reason!=='string'||v.reason.trim().length<12||v.reason.length>500)throw new BadRequestException('Bounded specialist retirement reason and request key required');
 return{action:'RETIRE' as const,agentId:v.agentId,requestKey:v.requestKey,reason:v.reason.trim(),fixtureOnly:true as const};
}
type Input=ReturnType<typeof retirementInput>;
export const retirementId=(org:string,key:string)=>'specialist-retire-'+hash([org,key]).slice(7);
export function retirementScope(org:string,actor:string,input:Input,registrationId:string,registrationDigest:string,expiresAt:string){
 return{schema:'medsol.offline-specialist-retirement.v1',organizationId:org,requestedBy:actor,input,registrationId,registrationDigest,expiresAt,
  expectedStatus:'PAUSED' as const,targetStatus:'RETIRED' as const,expectedVersion:1,executionAuthorized:false as const,externalEffectsAuthorized:false as const};
}
type Scope=ReturnType<typeof retirementScope>;
export function retirementDigest(s:Scope){
 return hash([s.schema,s.organizationId,s.requestedBy,s.input.action,s.input.agentId,s.input.requestKey,s.input.reason,s.input.fixtureOnly,s.registrationId,s.registrationDigest,s.expiresAt,s.expectedStatus,s.targetStatus,s.expectedVersion,s.executionAuthorized,s.externalEffectsAuthorized]);
}
export function readRetirement(a:Approval){
 try{
  const s=a.scope as unknown as Scope,i=retirementInput(s.input);
  if(!a.requestedBy||!a.scopeExpiresAt||typeof s.registrationId!=='string'||!/^specialist-[0-9a-f]{64}$/.test(s.registrationId)||
   typeof s.registrationDigest!=='string'||!/^sha256:[0-9a-f]{64}$/.test(s.registrationDigest))throw Error('scope');
  const exact=retirementScope(a.organizationId,a.requestedBy,i,s.registrationId,s.registrationDigest,a.scopeExpiresAt.toISOString());
  if(a.objectType!==SPECIALIST_RETIREMENT||a.id!==retirementId(a.organizationId,i.requestKey)||a.objectId!==i.agentId||
   a.requiredAuthority!=='HUMAN_MARKETING_AUTHORITY'||retirementDigest(s)!==a.scopeDigest||retirementDigest(exact)!==a.scopeDigest)throw Error('scope');
  return exact;
 }catch{throw new ConflictException('Invalid specialist retirement evidence');}
}
export async function currentRetirementRegistration(tx:Prisma.TransactionClient,org:string,id:string){
 await assertReviewedSpecialist(tx,org,id);
 const a=await tx.approval.findFirst({where:{organizationId:org,objectType:SPECIALIST_REGISTRATION,objectId:id,decision:'APPROVED'}});
 if(!a?.scopeDigest)throw new ConflictException('Reviewed registration required');
 return {id:a.id,digest:a.scopeDigest};
}
export async function retireReviewedSpecialist(tx:Prisma.TransactionClient,a:Approval,reviewer:string,now:Date){
 const s=readRetirement(a),org=a.organizationId,id=s.input.agentId;
 if(reviewer===s.requestedBy)throw new ForbiddenException('Independent retirement reviewer required');
 if(!a.scopeExpiresAt||a.scopeExpiresAt<=now)throw new ConflictException('Specialist retirement review expired');
 const requester=await tx.user.findFirst({where:{organizationId:org,id:s.requestedBy,disabledAt:null},select:{id:true,email:true,role:true,oidcSubject:true}});
 if(!requester?.oidcSubject)throw new ForbiddenException('Current retirement requester required');
 await assertActorPermissionInTenantTransaction(tx,{organizationId:org,userId:requester.id,email:requester.email,role:requester.role,subject:requester.oidcSubject},'MANAGE_TENANT');
 // Exclusive agent lock serializes against execution and knowledge share locks.
 await tx.$queryRaw`SELECT "id" FROM "Agent" WHERE "organizationId"=${org} AND "id"=${id} FOR UPDATE`;
 const registration=await currentRetirementRegistration(tx,org,id);
 if(registration.id!==s.registrationId||registration.digest!==s.registrationDigest)throw new ConflictException('Specialist registration changed');
 const changed=await tx.agent.updateMany({where:{organizationId:org,id,status:'PAUSED',version:1},data:{status:'RETIRED'}});
 if(changed.count!==1)throw new ConflictException('Specialist changed concurrently');
 await tx.auditEvent.create({data:{organizationId:org,actorType:'HUMAN',actorId:reviewer,action:'OFFLINE_SPECIALIST_RETIRED',objectType:'Agent',objectId:id,correlationId:a.id,before:{status:'PAUSED'},after:{status:'RETIRED',scopeDigest:a.scopeDigest,executionAuthorized:false,externalEffectsAuthorized:false}}});
}
