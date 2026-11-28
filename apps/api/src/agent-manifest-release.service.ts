import {BadRequestException,ConflictException,ForbiddenException,Injectable,
 NotFoundException} from '@nestjs/common';
import {Prisma,type AgentManifestRevision} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {AGENT_ROSTER} from '@medsol/agent-runtime';
import {PrismaService} from './prisma.service.js';
import {hasMarketingPermission} from './marketing-permissions.js';
import type {VerifiedIdentity} from './oidc-identity.js';
import {agentReleaseDigest,agentReleaseTrustConfig,
 baselineAgentReleaseManifest,parseAgentReleaseManifest,
 verifyTrustedAgentReleaseSignature} from './agent-manifest-release.js';

import {parseTeamAssembly,assembleOfflineTeam,type TeamMemberEvidence} from './offline-team-assembly.js';
import {assertActorPermissionInTenantTransaction} from './tenant-role-policy.service.js';
import {SPECIALIST_REGISTRATION,specialistInput,specialistScope,specialistDigest,specialistApprovalId,readSpecialist,lockSpecialist} from './offline-specialist.js';
import {SPECIALIST_RETIREMENT,retirementInput,retirementId,retirementScope,retirementDigest,readRetirement,currentRetirementRegistration} from './offline-specialist-retirement.js';
const agent=(id:unknown)=>{
 const base=AGENT_ROSTER.find(a=>a.id===id);
 if(!base)throw new BadRequestException('Canonical agent ID required');
 return base;
};
const revision=(value:unknown):number=>{
 if(!Number.isSafeInteger(value)||(value as number)<1||(value as number)>1000000)
  throw new BadRequestException('Expected agent version required');
 return value as number;
};
const validId=(id:unknown):string=>{
 if(typeof id!=='string'||id.length<3||id.length>160||
  !/^[a-zA-Z0-9_-]+$/.test(id))
  throw new BadRequestException('Invalid agent release identifier');
 return id;
};
@Injectable()
export class AgentManifestReleaseService{
 constructor(private readonly db:PrismaService){}
 private transaction<T>(organizationId:string,fn:(tx:Prisma.TransactionClient)=>Promise<T>){
  if(!/^[a-zA-Z0-9_-]{3,160}$/.test(organizationId))
   throw new BadRequestException('Invalid tenant');
  return this.db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${organizationId}, true)`;
   return fn(tx);
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
 }
 private async authorize(tx:Prisma.TransactionClient,organizationId:string,
  identity:VerifiedIdentity){
  if(!identity||identity.organizationId!==organizationId||!identity.subject||
   !hasMarketingPermission(identity,'MANAGE_TENANT'))
   throw new ForbiddenException('Active tenant OIDC admin required');
  const user=await tx.user.findFirst({where:{id:identity.userId,
   organizationId,oidcSubject:identity.subject,disabledAt:null},
   select:{role:true}});
  if(!user||user.role.toUpperCase()!==identity.role.toUpperCase()||
   !['SUPER_ADMIN','ADMIN'].includes(user.role.toUpperCase()))
   throw new ForbiddenException('Active matching tenant OIDC admin required');
 }
 private project(row:AgentManifestRevision){
  const manifest=parseAgentReleaseManifest(row.manifest);
  const trusted=verifyTrustedAgentReleaseSignature(manifest,row.signature,
   row.signerKeyId,agentReleaseTrustConfig());
  return{id:row.id,agentId:row.agentId,revision:row.revision,
   manifest,digest:row.digest,signatureTrusted:trusted,
   signerKeyId:row.signerKeyId,status:row.status,createdBy:row.createdBy,
   approvedBy:row.approvedBy,approvedAt:row.approvedAt,
   revokedBy:row.revokedBy,revokedAt:row.revokedAt,
   createdAt:row.createdAt,externalEffectsAuthorized:false as const};
 }
 /**
  * Canonical manifest starter. This is the SAME Agent authority as signed release
  * activation, not a separate agent/skill factory or an alternate owner.
  */
 async baseline(organizationId:string,identity:VerifiedIdentity,agentId:unknown){
  const canonical=agent(agentId);
  return this.transaction(organizationId,async tx=>{
   await this.authorize(tx,organizationId,identity);
   const installed=await tx.agent.findFirst({where:{
    organizationId,id:canonical.id
   },select:{version:true,status:true}});
   return{
    manifest:baselineAgentReleaseManifest(canonical.id),
    activeVersion:installed?.version??1,
    installed:!!installed,agentStatus:installed?.status??'NOT_INSTALLED',
    signatureRequired:true as const,externalEffectsAuthorized:false as const
   };
  });
 }
 /** Returns canonical bytes for independent offline signing; no key or permission is granted. */
 async specialistRegistry(organizationId:string,identity:VerifiedIdentity){
  return this.transaction(organizationId,async tx=>{
   await this.authorize(tx,organizationId,identity);
   await assertActorPermissionInTenantTransaction(tx,identity,'READ_TENANCY');
   const reviews=await tx.approval.findMany({where:{organizationId,objectType:SPECIALIST_REGISTRATION},orderBy:[{createdAt:'desc'},{id:'desc'}],take:101});
   const installed=await tx.agent.findMany({where:{organizationId,id:{startsWith:'MKT-SPECIALIST-'}},take:101,orderBy:{id:'asc'}});
   if(installed.length>100)throw new ConflictException('Specialist registry exceeds bounded inventory');
   const records=[];
   for(const row of installed){
    const approved=await tx.approval.findMany({where:{organizationId,objectType:SPECIALIST_REGISTRATION,objectId:row.id,decision:'APPROVED'},take:2});
    if(approved.length!==1||!approved[0]!.decidedBy||approved[0]!.decidedBy===approved[0]!.requestedBy||
     !approved[0]!.decidedAt||!approved[0]!.scopeExpiresAt||approved[0]!.decidedAt!>=approved[0]!.scopeExpiresAt!||
     !['PAUSED','RETIRED'].includes(row.status)||row.version!==1||!Array.isArray(row.capabilities)||row.capabilities.length!==0)
     throw new ConflictException('Invalid paused specialist evidence');
    const scope=readSpecialist(approved[0]!);
    if(row.name!==scope.input.name)throw new ConflictException('Specialist identity metadata changed');
    const retirement=await tx.approval.findMany({where:{organizationId,objectType:SPECIALIST_RETIREMENT,objectId:row.id,decision:'APPROVED'},take:2});
    if(row.status==='RETIRED'){
     const retired=retirement[0];
     if(retirement.length!==1||!retired?.decidedBy||retired.decidedBy===retired.requestedBy||!retired.decidedAt||!retired.scopeExpiresAt||retired.decidedAt>=retired.scopeExpiresAt)
      throw new ConflictException('Invalid retired specialist evidence');
     const rs=readRetirement(retired);
     if(rs.registrationId!==approved[0]!.id||rs.registrationDigest!==approved[0]!.scopeDigest)throw new ConflictException('Retirement registration mismatch');
    }else if(retirement.length)throw new ConflictException('Unexpected approved retirement');
    records.push({approvalId:approved[0]!.id,...scope,status:row.status,installedVersion:1,...(row.status==='RETIRED'?{retirementApprovalId:retirement[0]!.id}:{})});
   }
   const retirements=await tx.approval.findMany({where:{organizationId,objectType:SPECIALIST_RETIREMENT},orderBy:[{createdAt:'desc'},{id:'desc'}],take:101});
   return{organizationId,records,retirements:retirements.slice(0,100).map(a=>({approvalId:a.id,decision:a.decision,...readRetirement(a)})),retirementHistoryCapped:retirements.length>100,reviews:reviews.slice(0,100).map(a=>({approvalId:a.id,decision:a.decision,...readSpecialist(a)})),
    historyCapped:reviews.length>100,fixtureOnly:true,executionAuthorized:false,externalEffectsAuthorized:false};
  });
 }
 async requestSpecialistRetirement(organizationId:string,identity:VerifiedIdentity,raw:unknown){
  const input=retirementInput(raw),approvalId=retirementId(organizationId,input.requestKey);
  return this.db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${organizationId}, true)`;
   await this.authorize(tx,organizationId,identity);
   await assertActorPermissionInTenantTransaction(tx,identity,'MANAGE_TENANT');
   await lockSpecialist(tx,organizationId);
   const prior=await tx.approval.findFirst({where:{organizationId,id:approvalId}});
   if(prior){
    const scope=readRetirement(prior);
    if(scope.requestedBy!==identity.userId||JSON.stringify(scope.input)!==JSON.stringify(input))throw new ConflictException('Immutable retirement request key already used');
    return{approvalId,decision:prior.decision,...scope,replayed:true};
   }
   const registration=await currentRetirementRegistration(tx,organizationId,input.agentId);
   const scope=retirementScope(organizationId,identity.userId,input,registration.id,registration.digest,new Date(Date.now()+86400000).toISOString());
   await tx.approval.create({data:{id:approvalId,organizationId,objectType:SPECIALIST_RETIREMENT,objectId:input.agentId,requiredAuthority:'HUMAN_MARKETING_AUTHORITY',riskLevel:'R3',requestedBy:identity.userId,scope,scopeDigest:retirementDigest(scope),scopeExpiresAt:new Date(scope.expiresAt)}});
   await tx.auditEvent.create({data:{organizationId,actorType:'HUMAN',actorId:identity.userId,action:'OFFLINE_SPECIALIST_RETIREMENT_REQUESTED',objectType:SPECIALIST_RETIREMENT,objectId:input.agentId,correlationId:approvalId,after:{scopeDigest:retirementDigest(scope),executionAuthorized:false}}});
   return{approvalId,decision:'PENDING',...scope,replayed:false};
  },{isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted});
 }
 async requestSpecialist(organizationId:string,identity:VerifiedIdentity,raw:unknown){
  if(raw&&typeof raw==='object'&&!Array.isArray(raw)&&Object.hasOwn(raw,'action'))return this.requestSpecialistRetirement(organizationId,identity,raw);
  const input=specialistInput(raw),approvalId=specialistApprovalId(organizationId,input.requestKey);
  // READ COMMITTED plus transaction-local advisory lock serializes proposals
  // and decisions using the same canonical tenant scope.
  return this.db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${organizationId}, true)`;
   await this.authorize(tx,organizationId,identity);
   await assertActorPermissionInTenantTransaction(tx,identity,'MANAGE_TENANT');
   await lockSpecialist(tx,organizationId);
   const prior=await tx.approval.findFirst({where:{organizationId,id:approvalId}});
   if(prior){
    const scope=readSpecialist(prior);
    if(scope.requestedBy!==identity.userId||JSON.stringify(scope.input)!==JSON.stringify(input))
     throw new ConflictException('Immutable specialist request key already used');
    return{approvalId,decision:prior.decision,...scope,replayed:true};
   }
   const scope=specialistScope(organizationId,identity.userId,input,new Date(Date.now()+86400000).toISOString());
   if(await tx.agent.findFirst({where:{organizationId,id:scope.agentId}}))
    throw new ConflictException('Specialist identity already registered');
   await tx.approval.create({data:{id:approvalId,organizationId,objectType:SPECIALIST_REGISTRATION,objectId:scope.agentId,
    requiredAuthority:'HUMAN_MARKETING_AUTHORITY',riskLevel:'R2',requestedBy:identity.userId,scope,scopeDigest:specialistDigest(scope),
    scopeExpiresAt:new Date(scope.reviewExpiresAt)}});
   await tx.auditEvent.create({data:{organizationId,actorType:'HUMAN',actorId:identity.userId,action:'OFFLINE_SPECIALIST_REVIEW_REQUESTED',
    objectType:SPECIALIST_REGISTRATION,objectId:scope.agentId,correlationId:approvalId,after:{scopeDigest:specialistDigest(scope),executionAuthorized:false}}});
   return{approvalId,decision:'PENDING',...scope,replayed:false};
  },{isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted});
 }
 async teamPreview(organizationId:string,identity:VerifiedIdentity,raw:unknown){
  const input=parseTeamAssembly(raw);
  return this.transaction(organizationId,async tx=>{
   await this.authorize(tx,organizationId,identity);
   await assertActorPermissionInTenantTransaction(tx,identity,'MANAGE_TENANT');
   const evidence:TeamMemberEvidence[]=[];
   for(const member of input.members){
    const row=await tx.agent.findFirst({where:{organizationId,id:member.agentId}});
    const version=row?.version??1;
    if(version!==member.expectedVersion||row&&row.status!=='ACTIVE')
     throw new ConflictException('Team member release changed or paused');
    let manifest=baselineAgentReleaseManifest(member.agentId);
    if(version>1){
     const release=await tx.agentManifestRevision.findFirst({where:{organizationId,agentId:member.agentId,revision:version,status:'APPROVED'}});
     if(!release)throw new ConflictException('Current team member release unavailable');
     manifest=parseAgentReleaseManifest(release.manifest);
     if(manifest.agentId!==member.agentId||release.digest!==agentReleaseDigest(manifest)||
      !verifyTrustedAgentReleaseSignature(manifest,release.signature,release.signerKeyId,agentReleaseTrustConfig()))
      throw new ConflictException('Current team member release untrusted');
    }
    if(row&&(!Array.isArray(row.capabilities)||JSON.stringify([...row.capabilities].sort())!==JSON.stringify([...manifest.capabilities].sort())))
     throw new ConflictException('Installed capabilities disagree with current release');
    evidence.push({agentId:member.agentId,version,digest:agentReleaseDigest(manifest),
     installed:!!row,status:row?.status??'NOT_INSTALLED',capabilities:manifest.capabilities});
   }
   return{organizationId,...assembleOfflineTeam(input,evidence)};
  });
 }
 async preview(organizationId:string,identity:VerifiedIdentity,raw:unknown){
  return this.transaction(organizationId,async tx=>{
   await this.authorize(tx,organizationId,identity);
   const manifest=parseAgentReleaseManifest(raw);
   const digest=agentReleaseDigest(manifest);
   return {manifest,digest,
    signaturePayload:'medsol-agent-release-signature-v1\n'+digest,
    signatureAlgorithm:'Ed25519' as const,requiresIndependentReview:true as const,
    externalEffectsAuthorized:false as const};
  });
 }
 async list(organizationId:string,identity:VerifiedIdentity,agentId?:unknown){
  const match=agentId===undefined?undefined:agent(agentId).id;
  return this.transaction(organizationId,async tx=>{
   await this.authorize(tx,organizationId,identity);
   const rows=await tx.agentManifestRevision.findMany({
    where:{organizationId,...(match?{agentId:match}:{})},
    orderBy:[{agentId:'asc'},{revision:'desc'}],take:100
   });
   return rows.map(row=>this.project(row));
  });
 }
 async propose(organizationId:string,identity:VerifiedIdentity,input:{
  manifest?:unknown;signature?:unknown;signerKeyId?:unknown
 }){
  const manifest=parseAgentReleaseManifest(input?.manifest);
  const signerKeyId=validId(input?.signerKeyId);
  const signature=typeof input?.signature==='string'?input.signature:'';
  const digest=agentReleaseDigest(manifest);
  if(!verifyTrustedAgentReleaseSignature(manifest,signature,signerKeyId,
   agentReleaseTrustConfig()))
   throw new ForbiddenException('Trusted Ed25519 agent release signature required');
  return this.transaction(organizationId,async tx=>{
   await this.authorize(tx,organizationId,identity);
   const baseline=agent(manifest.agentId);
   await tx.agent.upsert({where:{organizationId_id:{
    organizationId,id:baseline.id}},create:{
    organizationId,id:baseline.id,name:baseline.name,version:1,
    capabilities:[...baseline.capabilities]
   },update:{}});
   const matching=await tx.agentManifestRevision.findFirst({
    where:{organizationId,agentId:baseline.id,digest,signature,
     signerKeyId,status:'PROPOSED'}
   });
   if(matching)return{...this.project(matching),replayed:true};
   const latest=await tx.agentManifestRevision.findFirst({
    where:{organizationId,agentId:baseline.id},orderBy:{revision:'desc'},
    select:{revision:true}
   });
   const next=Math.max(2,(latest?.revision??1)+1);
   const row=await tx.agentManifestRevision.create({data:{
    id:randomUUID(),organizationId,agentId:baseline.id,revision:next,
    manifest:manifest as unknown as Prisma.InputJsonValue,digest,
    signature,signerKeyId,status:'PROPOSED',createdBy:identity.userId
   }});
   await tx.auditEvent.create({data:{organizationId,actorType:'HUMAN',
    actorId:identity.userId,action:'AGENT_MANIFEST_PROPOSED',
    objectType:'AgentManifestRevision',objectId:row.id,
    correlationId:row.id,after:{agentId:baseline.id,revision:next,digest,
     noExternalEffects:true}}});
   return{...this.project(row),replayed:false};
  });
 }
 async approve(organizationId:string,identity:VerifiedIdentity,idInput:unknown,
  expectedRevision:unknown){
  const id=validId(idInput),expected=revision(expectedRevision);
  return this.transaction(organizationId,async tx=>{
   await this.authorize(tx,organizationId,identity);
   const row=await tx.agentManifestRevision.findFirst({
    where:{organizationId,id}});
   if(!row)throw new NotFoundException('Agent manifest revision not found in tenant');
   if(row.revision!==expected)throw new ConflictException('Stale manifest revision');
   if(row.status!=='PROPOSED')
    throw new ConflictException('Manifest is no longer awaiting review');
   if(row.createdBy===identity.userId)
    throw new ForbiddenException('Independent manifest reviewer required');
   const manifest=parseAgentReleaseManifest(row.manifest);
   if(agentReleaseDigest(manifest)!==row.digest||
    !verifyTrustedAgentReleaseSignature(manifest,row.signature,
     row.signerKeyId,agentReleaseTrustConfig()))
    throw new ForbiddenException('Agent manifest signature or digest invalid');
   const changed=await tx.agentManifestRevision.updateMany({
    where:{id,organizationId,revision:expected,status:'PROPOSED'},
    data:{status:'APPROVED',approvedBy:identity.userId,approvedAt:new Date()}
   });
   if(changed.count!==1)throw new ConflictException('Concurrent manifest decision');
   await tx.auditEvent.create({data:{organizationId,actorType:'HUMAN',
    actorId:identity.userId,action:'AGENT_MANIFEST_APPROVED',
    objectType:'AgentManifestRevision',objectId:id,correlationId:id,
    after:{revision:row.revision,digest:row.digest,activation:false}}});
   await tx.outboxEvent.create({data:{organizationId,eventId:randomUUID(),
    eventType:'AgentManifestApprovedInternal',aggregateType:'Agent',
    aggregateId:row.agentId,version:row.revision,correlationId:id,
    payload:{revisionId:id,metadataOnly:true,externalEffectsAuthorized:false}}});
   return this.project(await tx.agentManifestRevision.findFirstOrThrow({
    where:{organizationId,id}}));
  });
 }
 async activate(organizationId:string,identity:VerifiedIdentity,idInput:unknown,
  expectedVersion:unknown){
  const id=validId(idInput),expected=revision(expectedVersion);
  return this.transaction(organizationId,async tx=>{
   await this.authorize(tx,organizationId,identity);
   const row=await tx.agentManifestRevision.findFirst({where:{organizationId,id}});
   if(!row)throw new NotFoundException('Agent release not found in tenant');
   if(row.status!=='APPROVED')throw new ConflictException('Approved agent manifest required');
   const manifest=parseAgentReleaseManifest(row.manifest);
   if(agentReleaseDigest(manifest)!==row.digest||
    !verifyTrustedAgentReleaseSignature(manifest,row.signature,
     row.signerKeyId,agentReleaseTrustConfig()))
    throw new ForbiddenException('Untrusted agent release cannot be activated');
   const installed=await tx.agent.findFirst({where:{
    organizationId,id:row.agentId}});
   if(!installed)throw new ConflictException('Canonical agent is not installed');
   if(installed.version!==expected)
    throw new ConflictException('Stale agent active version');
   if(installed.version===row.revision)return{
    agentId:row.agentId,activeVersion:installed.version,
    releaseDigest:row.digest,replayed:true};
   const changed=await tx.agent.updateMany({where:{organizationId,
    id:row.agentId,version:expected,status:'ACTIVE'},data:{
    version:row.revision,name:manifest.name,capabilities:manifest.capabilities}});
   if(changed.count!==1)
    throw new ConflictException('Agent changed or administratively paused');
   await tx.auditEvent.create({data:{organizationId,actorType:'HUMAN',
    actorId:identity.userId,action:'AGENT_MANIFEST_ACTIVATED',
    objectType:'Agent',objectId:row.agentId,correlationId:id,
    before:{activeVersion:expected},after:{
     activeVersion:row.revision,releaseDigest:row.digest,
     modelCallsAuthorized:false,toolCallsAuthorized:false}}});
   await tx.outboxEvent.create({data:{organizationId,eventId:randomUUID(),
    eventType:'AgentManifestActivatedInternal',aggregateType:'Agent',
    aggregateId:row.agentId,version:row.revision,correlationId:id,
    payload:{releaseDigest:row.digest,externalEffectsAuthorized:false}}});
   return{agentId:row.agentId,activeVersion:row.revision,
    releaseDigest:row.digest,replayed:false};
  });
 }
 async rollback(organizationId:string,identity:VerifiedIdentity,
  agentIdInput:unknown,expectedVersion:unknown,reasonInput:unknown){
  const base=agent(agentIdInput),expected=revision(expectedVersion);
  const reason=typeof reasonInput==='string'?reasonInput.trim():'';
  if(reason.length<12||reason.length>500)
   throw new BadRequestException('Rollback reason must be 12-500 characters');
  return this.transaction(organizationId,async tx=>{
   await this.authorize(tx,organizationId,identity);
   const installed=await tx.agent.findFirst({
    where:{organizationId,id:base.id}});
   if(!installed)throw new NotFoundException('Agent not installed in tenant');
   if(installed.version!==expected)
    throw new ConflictException('Stale rollback version');
   if(installed.version===1)return{agentId:base.id,
    activeVersion:1,replayed:true};
   const baseline=baselineAgentReleaseManifest(base.id);
   const changed=await tx.agent.updateMany({where:{
    organizationId,id:base.id,version:expected},data:{
    version:1,name:baseline.name,capabilities:baseline.capabilities}});
   if(changed.count!==1)throw new ConflictException('Concurrent agent rollback');
   await tx.auditEvent.create({data:{organizationId,actorType:'HUMAN',
    actorId:identity.userId,action:'AGENT_MANIFEST_ROLLBACK',
    objectType:'Agent',objectId:base.id,correlationId:randomUUID(),
    before:{activeVersion:expected},after:{
     activeVersion:1,reason,externalEffectsAuthorized:false}}});
   await tx.outboxEvent.create({data:{organizationId,eventId:randomUUID(),
    eventType:'AgentManifestRolledBackInternal',aggregateType:'Agent',
    aggregateId:base.id,version:1,correlationId:randomUUID(),
    payload:{previousVersion:expected,reason,
     externalEffectsAuthorized:false}}});
   return{agentId:base.id,activeVersion:1,replayed:false};
  });
 }
 async revoke(organizationId:string,identity:VerifiedIdentity,
  idInput:unknown,reasonInput:unknown){
  const id=validId(idInput);
  const reason=typeof reasonInput==='string'?reasonInput.trim():'';
  if(reason.length<12||reason.length>500)
   throw new BadRequestException('Revocation reason must be 12-500 characters');
  return this.transaction(organizationId,async tx=>{
   await this.authorize(tx,organizationId,identity);
   const row=await tx.agentManifestRevision.findFirst({
    where:{organizationId,id}});
   if(!row)throw new NotFoundException('Agent release not found in tenant');
   if(row.status==='REVOKED')return{...this.project(row),replayed:true};
   const changed=await tx.agentManifestRevision.updateMany({
    where:{organizationId,id,status:row.status},
    data:{status:'REVOKED',revokedBy:identity.userId,revokedAt:new Date()}
   });
   if(changed.count!==1)throw new ConflictException('Concurrent release revocation');
   const installed=await tx.agent.findFirst({
    where:{organizationId,id:row.agentId}});
   if(installed?.version===row.revision){
    const baseline=baselineAgentReleaseManifest(row.agentId);
    const rolled=await tx.agent.updateMany({where:{organizationId,
     id:row.agentId,version:row.revision},data:{version:1,
     capabilities:baseline.capabilities,name:baseline.name}});
    if(rolled.count!==1)throw new ConflictException('Concurrent agent revocation');
   }
   await tx.auditEvent.create({data:{organizationId,actorType:'HUMAN',
    actorId:identity.userId,action:'AGENT_MANIFEST_REVOKED',
    objectType:'AgentManifestRevision',objectId:id,correlationId:id,
    after:{reason,activeVersion:installed?.version===row.revision?1:
     installed?.version,externalEffectsAuthorized:false}}});
   await tx.outboxEvent.create({data:{organizationId,eventId:randomUUID(),
    eventType:'AgentManifestRevokedInternal',aggregateType:'Agent',
    aggregateId:row.agentId,version:row.revision,correlationId:id,
    payload:{revisionId:id,revoked:true,externalEffectsAuthorized:false}}});
   return{...this.project(await tx.agentManifestRevision.findFirstOrThrow({
    where:{organizationId,id}})),replayed:false};
  });
 }
}
