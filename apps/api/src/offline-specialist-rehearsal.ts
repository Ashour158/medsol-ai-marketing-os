import {BadRequestException,ConflictException,ForbiddenException} from '@nestjs/common';
import type {Approval,Prisma} from '@prisma/client';
import {createHash} from 'node:crypto';
import {SPECIALIST_REGISTRATION,readSpecialist} from './offline-specialist.js';
import {agentReleaseDigest,baselineAgentReleaseManifest,parseAgentReleaseManifest,verifyTrustedAgentReleaseSignature,agentReleaseTrustConfig} from './agent-manifest-release.js';
import {assertActorPermissionInTenantTransaction} from './tenant-role-policy.service.js';
import type {MarketingLearningService} from './marketing-learning.service.js';
import {contextPinTuple,parseContextPin,loadSpecialistContextPin,type SpecialistContextPin} from './specialist-context-pin.js';
import {SPECIALIST_BRAIN_MODE,normalizeReviewSkills,specialistMissionPlan,specialistPlanDigest} from './specialist-mission-brain.js';
import {SPECIALIST_DECISION_MODE,specialistDecision} from './specialist-decision-brain.js';
import {REASONING_EVALUATION_MODE} from './specialist-reasoning-evaluation.js';
import {STRUCTURED_DRAFT_MODE} from './specialist-structured-model-draft.js';
import {assertSkillMode} from './specialist-skill-evaluation.js';
import {currentConfig,configPinTuple,assertConfigPolicy,type ConfigPin} from './offline-specialist-config.js';
export const SPECIALIST_REHEARSAL='OfflineSpecialistRehearsal';
const hash=(v:unknown)=>'sha256:'+createHash('sha256').update(JSON.stringify(v)).digest('hex');
export function rehearsalInput(raw:unknown){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new BadRequestException('Exact specialist rehearsal required');
 const v=raw as Record<string,unknown>;
 const baseKeys=Object.keys(v).filter(k=>k!=='simulationMode'&&k!=='evaluationMode'&&k!=='allocationRequestDigest'&&k!=='structuredDraftMode').sort().join(',');
 if(Object.hasOwn(v,'allocationRequestDigest')&&(typeof v.allocationRequestDigest!=='string'||!/^sha256:[a-f0-9]{64}$/.test(v.allocationRequestDigest)||v.brainMode!==SPECIALIST_DECISION_MODE))throw new BadRequestException('Invalid allocation request digest');
 if(Object.hasOwn(v,'structuredDraftMode')&&(v.structuredDraftMode!==STRUCTURED_DRAFT_MODE||v.brainMode!==SPECIALIST_DECISION_MODE||typeof v.contextQuery!=='string'))throw new BadRequestException('Structured draft fixture requires decision mode and reviewed context');
 if(Object.hasOwn(v,'evaluationMode')&&(v.evaluationMode!==REASONING_EVALUATION_MODE||v.brainMode!==SPECIALIST_DECISION_MODE))throw new BadRequestException('Explicit decision evaluation requires specialist decision policy');
 if(Object.hasOwn(v,'simulationMode')&&(v.simulationMode!=='PROVIDER_CONTRACT_V1'||v.brainMode!==SPECIALIST_DECISION_MODE))throw new BadRequestException('Explicit offline provider contract mode requires specialist decision policy');
 if(!['agentId,fixtureOnly,market,objective,requestKey','agentId,contextQuery,fixtureOnly,market,objective,requestKey','agentId,brainMode,fixtureOnly,market,objective,requestKey','agentId,brainMode,contextQuery,fixtureOnly,market,objective,requestKey','agentId,brainMode,fixtureOnly,handoverApprovalId,market,objective,requestKey','agentId,brainMode,contextQuery,fixtureOnly,handoverApprovalId,market,objective,requestKey'].includes(baseKeys)||
 (Object.hasOwn(v,'handoverApprovalId')&&(v.brainMode!==SPECIALIST_DECISION_MODE||typeof v.handoverApprovalId!=='string'||!/^specialist-run-[0-9a-f]{64}$/.test(v.handoverApprovalId)))||
 (Object.hasOwn(v,'brainMode')&&v.brainMode!==SPECIALIST_BRAIN_MODE&&v.brainMode!==SPECIALIST_DECISION_MODE)||
 (Object.hasOwn(v,'contextQuery')&&(typeof v.contextQuery!=='string'||v.contextQuery.trim().length<3||v.contextQuery.length>200))||
 v.fixtureOnly!==true||typeof v.requestKey!=='string'||!/^fixture-[A-Za-z0-9_-]{8,100}$/.test(v.requestKey)||
 typeof v.agentId!=='string'||!/^MKT-SPECIALIST-[a-z][a-z0-9-]{2,63}$/.test(v.agentId)||
 typeof v.objective!=='string'||v.objective.trim().length<12||v.objective.length>500||
 typeof v.market!=='string'||v.market.trim().length<2||v.market.length>100)
 throw new BadRequestException('Bounded fixture objective, market and specialist identity required');
 return{agentId:v.agentId,requestKey:v.requestKey,objective:v.objective.trim(),market:v.market.trim(),fixtureOnly:true as const,...(v.brainMode===SPECIALIST_BRAIN_MODE||v.brainMode===SPECIALIST_DECISION_MODE?{brainMode:v.brainMode}:{}),...(typeof v.contextQuery==='string'?{contextQuery:v.contextQuery.trim()}:{}),...(typeof v.handoverApprovalId==='string'?{handoverApprovalId:v.handoverApprovalId}:{}),...(v.simulationMode==='PROVIDER_CONTRACT_V1'?{simulationMode:'PROVIDER_CONTRACT_V1' as const}:{}),...(v.evaluationMode===REASONING_EVALUATION_MODE?{evaluationMode:REASONING_EVALUATION_MODE}:{}),...(typeof v.allocationRequestDigest==='string'?{allocationRequestDigest:v.allocationRequestDigest}:{}),...(v.structuredDraftMode===STRUCTURED_DRAFT_MODE?{structuredDraftMode:STRUCTURED_DRAFT_MODE}:{})};
}
type Input=ReturnType<typeof rehearsalInput>;
export const rehearsalId=(org:string,key:string)=>'specialist-run-'+hash([org,key]).slice(7);
export async function currentSpecialistTemplate(tx:Prisma.TransactionClient,org:string,agentId:string){
 // Existing paused identity remains the registry owner. Row locks fence
 // administrative changes while the short deterministic rehearsal runs.
 await tx.$queryRaw`SELECT "id" FROM "Agent" WHERE "organizationId"=${org} AND "id"=${agentId} FOR SHARE`;
 const row=await tx.agent.findFirst({where:{organizationId:org,id:agentId}});
 const registrations=await tx.approval.findMany({where:{organizationId:org,objectType:SPECIALIST_REGISTRATION,objectId:agentId,decision:'APPROVED'},take:2});
 const registration=registrations[0];
 if(!row||row.status!=='PAUSED'||row.version!==1||!Array.isArray(row.capabilities)||row.capabilities.length!==0||
 registrations.length!==1||!registration?.decidedBy||registration.decidedBy===registration.requestedBy||
 !registration.decidedAt||!registration.scopeExpiresAt||registration.decidedAt>=registration.scopeExpiresAt)
 throw new ConflictException('Reviewed paused specialist identity required');
 const s=readSpecialist(registration);
 if(s.input.name!==row.name)throw new ConflictException('Specialist registration changed');
 const templateId=s.input.templateAgentId;
 await tx.$queryRaw`SELECT "id" FROM "Agent" WHERE "organizationId"=${org} AND "id"=${templateId} FOR SHARE`;
 const installed=await tx.agent.findFirst({where:{organizationId:org,id:templateId}});
 let manifest=baselineAgentReleaseManifest(templateId);
 const version=installed?.version??1;
 if(installed&&installed.status!=='ACTIVE')throw new ConflictException('Template is paused or retired');
 if(version>1){
  await tx.$queryRaw`SELECT "id" FROM "AgentManifestRevision" WHERE "organizationId"=${org} AND "agentId"=${templateId} AND "revision"=${version} FOR SHARE`;
  const release=await tx.agentManifestRevision.findFirst({where:{organizationId:org,agentId:templateId,revision:version,status:'APPROVED'}});
  if(!release)throw new ConflictException('Template release unavailable');
  manifest=parseAgentReleaseManifest(release.manifest);
  if(manifest.agentId!==templateId||release.digest!==agentReleaseDigest(manifest)||
    !verifyTrustedAgentReleaseSignature(manifest,release.signature,release.signerKeyId,agentReleaseTrustConfig()))
   throw new ConflictException('Template release is untrusted');
 }
 if(installed&&(!Array.isArray(installed.capabilities)||JSON.stringify([...installed.capabilities].sort())!==JSON.stringify([...manifest.capabilities].sort())))
 throw new ConflictException('Template capability metadata changed');
 if(!manifest.capabilities.includes(s.proposedCapability))throw new ConflictException('Template no longer permits specialist draft capability');
 const configuration=await currentConfig(tx,org,agentId,{id:registration.id,digest:registration.scopeDigest!});
 return{registrationId:registration.id,registrationDigest:registration.scopeDigest!,templateId,templateVersion:version,...(configuration?{configuration}:{}),
  templateDigest:agentReleaseDigest(manifest),templateInstalled:!!installed,capability:s.proposedCapability,maxInputBytes:manifest.maxInputBytes};
}
type Template=Awaited<ReturnType<typeof currentSpecialistTemplate>>;
export const MAX_SPECIALIST_STAGES=4;
export type HandoverPin={ancestorAgentIds?:string[];approvalId:string;executionId:string;sourceAgentId:string;sourceScopeDigest:string;sourceDecisionDigest:string;disposition:'DRAFT_FOR_REVIEW';sourceEvidenceTransferred:false;externalEffectsAuthorized:false};
export function handoverTuple(p:HandoverPin){
 if(!p||typeof p.approvalId!=='string'||!/^specialist-run-[0-9a-f]{64}$/.test(p.approvalId)||p.executionId!==p.approvalId+'-execution'||
 typeof p.sourceAgentId!=='string'||!/^MKT-SPECIALIST-[a-z][a-z0-9-]{2,63}$/.test(p.sourceAgentId)||
 !/^sha256:[0-9a-f]{64}$/.test(p.sourceScopeDigest)||!/^sha256:[0-9a-f]{64}$/.test(p.sourceDecisionDigest)||p.disposition!=='DRAFT_FOR_REVIEW'||p.sourceEvidenceTransferred!==false||p.externalEffectsAuthorized!==false)
 throw new ConflictException('Invalid specialist handover pin');
 const ancestors=p.ancestorAgentIds;
 if(ancestors!==undefined&&(!Array.isArray(ancestors)||ancestors.length<2||ancestors.length>=MAX_SPECIALIST_STAGES||ancestors[ancestors.length-1]!==p.sourceAgentId||new Set(ancestors).size!==ancestors.length||ancestors.some(id=>typeof id!=='string'||!/^MKT-SPECIALIST-[a-z][a-z0-9-]{2,63}$/.test(id))))
  throw new ConflictException('Invalid bounded specialist ancestry');
 return[p.approvalId,p.executionId,p.sourceAgentId,p.sourceScopeDigest,p.sourceDecisionDigest,p.disposition,p.sourceEvidenceTransferred,p.externalEffectsAuthorized,...(ancestors!==undefined?['ancestorAgentIds',ancestors]:[])];
}
function normalizeHandover(p:HandoverPin):HandoverPin{handoverTuple(p);return{...(p.ancestorAgentIds!==undefined?{ancestorAgentIds:[...p.ancestorAgentIds]}:{}),approvalId:p.approvalId,executionId:p.executionId,sourceAgentId:p.sourceAgentId,sourceScopeDigest:p.sourceScopeDigest,sourceDecisionDigest:p.sourceDecisionDigest,disposition:p.disposition,sourceEvidenceTransferred:false,externalEffectsAuthorized:false};}
export function rehearsalScope(org:string,actor:string,input:Input,template:Template,expiresAt:string,contextPin?:SpecialistContextPin,handover?:HandoverPin){
 if(input.handoverApprovalId!==undefined){if(!handover||handover.approvalId!==input.handoverApprovalId||(handover.ancestorAgentIds??[handover.sourceAgentId]).includes(input.agentId))throw new ConflictException('Distinct reviewed source specialist handover required');handoverTuple(handover);}else if(handover!==undefined)throw new ConflictException('Unexpected specialist handover');
 assertConfigPolicy(template.configuration,input.objective,input.contextQuery);
 assertSkillMode(template.configuration?.reviewSkills,input.brainMode);
 return{schema:'medsol.offline-specialist-rehearsal.v1',organizationId:org,requestedBy:actor,input,
  ...template,expiresAt,...(contextPin?{contextPin}:{}),...(handover?{handover:normalizeHandover(handover)}:{}),fixtureOnly:true as const,autonomousExecutionAuthorized:false as const,
  modelCallsAuthorized:false as const,toolCallsAuthorized:false as const,memoryWritesAuthorized:false as const,externalEffectsAuthorized:false as const};
}
type Scope=ReturnType<typeof rehearsalScope>;
export function rehearsalDigest(s:Scope){
 const i=s.input;
 return hash([s.schema,s.organizationId,s.requestedBy,i.agentId,i.requestKey,i.objective,i.market,i.fixtureOnly,
  s.registrationId,s.registrationDigest,s.templateId,s.templateVersion,s.templateDigest,s.templateInstalled,s.capability,s.maxInputBytes,s.expiresAt,
  s.fixtureOnly,s.autonomousExecutionAuthorized,s.modelCallsAuthorized,s.toolCallsAuthorized,s.memoryWritesAuthorized,s.externalEffectsAuthorized,...(i.contextQuery!==undefined?[i.contextQuery,contextPinTuple(parseContextPin(s.contextPin,i.contextQuery))]:[]),...(i.brainMode!==undefined?[i.brainMode]:[]),...(s.configuration!==undefined?['configuration',configPinTuple(s.configuration)]:[]),...(i.handoverApprovalId!==undefined?['handover',i.handoverApprovalId,handoverTuple(s.handover!)]:[]),...(i.simulationMode!==undefined?['simulationMode',i.simulationMode]:[]),...(i.evaluationMode!==undefined?['evaluationMode',i.evaluationMode]:[]),...(i.allocationRequestDigest!==undefined?['allocationRequestDigest',i.allocationRequestDigest]:[]),...(i.structuredDraftMode!==undefined?['structuredDraftMode',i.structuredDraftMode]:[])]);
}
function normalizeConfigPin(p:ConfigPin):ConfigPin{configPinTuple(p);return{approvalId:p.approvalId,digest:p.digest,version:p.version,mission:p.mission,evidenceRequired:p.evidenceRequired,maxObjectiveChars:p.maxObjectiveChars,...(p.reviewSkills!==undefined?{reviewSkills:normalizeReviewSkills(p.reviewSkills)}:{})};}
export function readRehearsal(a:Approval):Scope{
 try{
  const s=a.scope as unknown as Scope,i=rehearsalInput(s.input);
  if(a.objectType!==SPECIALIST_REHEARSAL||a.id!==rehearsalId(a.organizationId,i.requestKey)||
   a.objectId!==i.agentId||a.organizationId!==s.organizationId||a.requestedBy!==s.requestedBy||!a.requestedBy||
   a.requiredAuthority!=='HUMAN_MARKETING_AUTHORITY'||a.scopeExpiresAt?.toISOString()!==s.expiresAt||
   s.schema!=='medsol.offline-specialist-rehearsal.v1'||s.fixtureOnly!==true||s.autonomousExecutionAuthorized!==false||
   s.modelCallsAuthorized!==false||s.toolCallsAuthorized!==false||s.memoryWritesAuthorized!==false||s.externalEffectsAuthorized!==false||
   rehearsalDigest(s)!==a.scopeDigest)throw Error('scope');
  if(i.handoverApprovalId===undefined&&s.handover!==undefined)throw Error('unexpected handover');
  if(i.contextQuery===undefined&&s.contextPin!==undefined)throw Error('unexpected context');
  const exact=rehearsalScope(a.organizationId,a.requestedBy,i,{registrationId:s.registrationId,registrationDigest:s.registrationDigest,
   templateId:s.templateId,templateVersion:s.templateVersion,templateDigest:s.templateDigest,templateInstalled:s.templateInstalled,
   capability:s.capability,maxInputBytes:s.maxInputBytes,...(s.configuration!==undefined?{configuration:normalizeConfigPin(s.configuration)}:{})},s.expiresAt,i.contextQuery!==undefined?parseContextPin(s.contextPin,i.contextQuery):undefined,i.handoverApprovalId!==undefined?normalizeHandover(s.handover!):undefined);
  if(rehearsalDigest(exact)!==a.scopeDigest)throw Error('normalized scope');
  return exact;
 }catch{throw new ConflictException('Invalid exact specialist rehearsal evidence');}
}
export async function validateRehearsal(tx:Prisma.TransactionClient,a:Approval,now:Date,learning?:MarketingLearningService,downstream:readonly string[]=[]):Promise<Scope>{
 const s=readRehearsal(a);
 if(downstream.includes(s.input.agentId)||downstream.length>=MAX_SPECIALIST_STAGES)throw new ConflictException('Repeated specialist or excessive collaboration depth');
 if(!a.scopeExpiresAt||a.scopeExpiresAt<=now)throw new ConflictException('Specialist rehearsal expired');
 const requester=await tx.user.findFirst({where:{organizationId:a.organizationId,id:s.requestedBy,disabledAt:null},select:{id:true,email:true,role:true,oidcSubject:true}});
 if(!requester?.oidcSubject)throw new ForbiddenException('Current specialist requester required');
 await assertActorPermissionInTenantTransaction(tx,{organizationId:a.organizationId,userId:requester.id,email:requester.email,role:requester.role,subject:requester.oidcSubject},'MANAGE_TENANT');
 const current=await currentSpecialistTemplate(tx,a.organizationId,a.objectId);
 const pin=s.input.contextQuery!==undefined?await loadSpecialistContextPin(learning,tx,a.organizationId,a.objectId,s.input.contextQuery):undefined;
 const handover=s.input.handoverApprovalId!==undefined?await loadHandoverPin(tx,a.organizationId,s.requestedBy,s.input.agentId,s.input.handoverApprovalId,now,learning,downstream):undefined;
 if(rehearsalDigest(rehearsalScope(a.organizationId,s.requestedBy,s.input,current,s.expiresAt,pin,handover))!==a.scopeDigest)
 throw new ConflictException('Specialist, template or reviewed context changed; request fresh review');
 return s;
}

/** Bounded multi-stage handover, revalidated at request, independent approval and execution.
 * No source content, context references or capability inheritance crosses the boundary.
 */
export async function loadHandoverPin(tx:Prisma.TransactionClient,org:string,actor:string,targetAgentId:string,id:string,now:Date,learning?:MarketingLearningService,downstream:readonly string[]=[]):Promise<HandoverPin>{
 const visited=[...downstream,targetAgentId];
 if(new Set(visited).size!==visited.length||visited.length>=MAX_SPECIALIST_STAGES)throw new ConflictException('Repeated specialist or excessive collaboration depth');
 const source=await tx.approval.findFirst({where:{organizationId:org,id,objectType:SPECIALIST_REHEARSAL,decision:'APPROVED'}});
 if(!source||source.requestedBy!==actor||visited.includes(source.objectId)||!source.decidedBy||source.decidedBy===actor||!source.decidedAt||!source.scopeExpiresAt||source.decidedAt>=source.scopeExpiresAt||!source.scopeDigest)
 throw new ConflictException('Completed independent source specialist approval required');
 const s=readRehearsal(source);
 if(s.input.brainMode!==SPECIALIST_DECISION_MODE)throw new ConflictException('Only decision rehearsals may be handed over');
 await validateRehearsal(tx,source,now,learning,visited);
 const ancestors=[...(s.handover?(s.handover.ancestorAgentIds??[s.handover.sourceAgentId]):[]),s.input.agentId];
 if(new Set([...ancestors,...visited]).size!==ancestors.length+visited.length||ancestors.length+visited.length>MAX_SPECIALIST_STAGES)throw new ConflictException('Repeated specialist or excessive collaboration depth');
 const reviewer=await tx.user.findFirst({where:{organizationId:org,id:source.decidedBy,disabledAt:null},select:{id:true,email:true,role:true,oidcSubject:true}});
 if(!reviewer?.oidcSubject)throw new ConflictException('Current source reviewer required');
 const identity={organizationId:org,userId:reviewer.id,email:reviewer.email,role:reviewer.role,subject:reviewer.oidcSubject};
 await assertActorPermissionInTenantTransaction(tx,identity,'MANAGE_TENANT');
 await assertActorPermissionInTenantTransaction(tx,identity,'DECIDE_APPROVAL');
 const executionId=id+'-execution';
 const row=await tx.agentExecution.findFirst({where:{organizationId:org,id:executionId,agentId:s.input.agentId,correlationId:id,status:'COMPLETED'}});
 const d=row?.decision as Record<string,unknown>|undefined;
 const template=d?.templateDecision as {executionAllowed?:unknown}|undefined;
 if(!d||d.schema!=='medsol.specialist-rehearsal-result.v1'||d.approvalId!==id||d.scopeDigest!==source.scopeDigest||d.agentId!==s.input.agentId||d.templateAgentId!==s.templateId||d.templateDigest!==s.templateDigest||
 d.fixtureOnly!==true||d.outputHumanApproved!==false||d.autonomousExecutionAuthorized!==false||d.modelCallsAuthorized!==false||d.toolCallsAuthorized!==false||d.memoryWritesAuthorized!==false||d.externalEffectsAuthorized!==false||template?.executionAllowed!==true||!d.missionPlan||!d.specialistDecision)
 throw new ConflictException('Source specialist execution provenance invalid');
 if(s.handover){if(!d.handover||JSON.stringify(handoverTuple(d.handover as HandoverPin))!==JSON.stringify(handoverTuple(s.handover)))throw new ConflictException('Source handover receipt integrity invalid');}else if(d.handover!==undefined)throw new ConflictException('Unexpected source handover receipt');
 const reg=await tx.approval.findFirst({where:{organizationId:org,id:s.registrationId,objectType:SPECIALIST_REGISTRATION,decision:'APPROVED'}});
 if(!reg||reg.scopeDigest!==s.registrationDigest)throw new ConflictException('Source registration changed');
 const plan=specialistMissionPlan({mission:s.configuration?.mission??readSpecialist(reg).input.mission,objective:s.input.objective,market:s.input.market,capability:s.capability,references:s.contextPin?.references.map(r=>r.citationRef)??[],...(s.configuration?.reviewSkills!==undefined?{reviewSkills:s.configuration.reviewSkills}:{})});
 const expected=specialistDecision(plan,true),digest=specialistPlanDigest(expected);
 if(!expected.draftEligible||specialistPlanDigest(plan)!==d.missionPlanDigest||specialistPlanDigest(d.missionPlan)!==d.missionPlanDigest||digest!==d.specialistDecisionDigest||specialistPlanDigest(d.specialistDecision)!==digest)
 throw new ConflictException('Source specialist decision integrity invalid');
 return normalizeHandover({...(ancestors.length>1?{ancestorAgentIds:ancestors}:{}),approvalId:id,executionId,sourceAgentId:s.input.agentId,sourceScopeDigest:source.scopeDigest,sourceDecisionDigest:digest,disposition:'DRAFT_FOR_REVIEW',sourceEvidenceTransferred:false,externalEffectsAuthorized:false});
}
