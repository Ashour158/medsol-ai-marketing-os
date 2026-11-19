import {BadRequestException,ConflictException,ForbiddenException,
 Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {PrismaService} from './prisma.service.js';
import {hasMarketingPermission} from './marketing-permissions.js';
import type {VerifiedIdentity} from './oidc-identity.js';
import {parseToolManifest,toolManifestDigest,verifyTrustedToolSignature,
 inspectToolInvocation,type ToolManifest} from './governed-tool-manifest.js';

const slug=(raw:unknown,name:string,max=100):string=>{
 if(typeof raw!=='string'||raw.length<3||raw.length>max||
  !/^[a-zA-Z0-9_-]+$/.test(raw))
  throw new BadRequestException('Invalid '+name);
 return raw;
};
const trustConfig=()=>({
 trustedPublicKeyPem:process.env.MARKETING_TOOL_REGISTRY_TRUSTED_PUBLIC_KEY_PEM,
 trustedKeyId:process.env.MARKETING_TOOL_REGISTRY_TRUSTED_KEY_ID
});
@Injectable()
export class GovernedToolRegistryService{
 constructor(private readonly db:PrismaService){}
 private transaction<T>(organizationId:string,fn:(tx:Prisma.TransactionClient)=>Promise<T>){
  slug(organizationId,'tenant',160);
  return this.db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${organizationId}, true)`;
   return fn(tx);
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
 }
 private async authorize(tx:Prisma.TransactionClient,organizationId:string,
  identity:VerifiedIdentity){
  if(!identity||identity.organizationId!==organizationId||
   !identity.subject||!hasMarketingPermission(identity,'MANAGE_TENANT'))
   throw new ForbiddenException('Tenant OIDC admin required');
  const user=await tx.user.findFirst({where:{id:identity.userId,
   organizationId,oidcSubject:identity.subject,disabledAt:null},
   select:{role:true}});
  if(!user||user.role.toUpperCase()!==identity.role.toUpperCase()||
   !['ADMIN','SUPER_ADMIN'].includes(user.role.toUpperCase()))
   throw new ForbiddenException('Active matching OIDC tenant admin required');
 }
 async list(organizationId:string,identity:VerifiedIdentity){
  return this.transaction(organizationId,async tx=>{
   await this.authorize(tx,organizationId,identity);
   const rows=await tx.governedToolRegistration.findMany({
    where:{organizationId},orderBy:{createdAt:'desc'},take:100
   });
   return rows.map(row=>this.projection(row));
  });
 }
 private projection(row:{
  id:string;organizationId:string;kind:string;serverKey:string;name:string;
  manifest:Prisma.JsonValue;manifestDigest:string;signature:string;
  signerKeyId:string;trustTier:string;status:string;version:number;
  createdBy:string;approvedBy:string|null;approvedAt:Date|null;
  revokedAt:Date|null;createdAt:Date
 }){
  const manifest=parseToolManifest(row.manifest);
  return{id:row.id,kind:row.kind,serverKey:row.serverKey,
   name:row.name,trustTier:row.trustTier,status:row.status,
   version:row.version,manifestDigest:row.manifestDigest,
   manifest,signerKeyId:row.signerKeyId,
   signatureTrusted:verifyTrustedToolSignature(manifest,row.signature,
    row.signerKeyId,trustConfig()),
   approvedBy:row.approvedBy,approvedAt:row.approvedAt,
   revokedAt:row.revokedAt,createdAt:row.createdAt,
   remoteExecutionAuthorized:false as const,actualToolCalls:0 as const};
 }
 async register(organizationId:string,identity:VerifiedIdentity,input:{
  manifest?:unknown;signature?:unknown;signerKeyId?:unknown
 }){
  const manifest=parseToolManifest(input?.manifest);
  const digest=toolManifestDigest(manifest);
  const signature=typeof input?.signature==='string'?input.signature:'';
  const signerKeyId=slug(input?.signerKeyId,'signer key',80);
  if(!/^[A-Za-z0-9_-]{80,200}$/.test(signature))
   throw new BadRequestException('Ed25519 signature metadata required');
  return this.transaction(organizationId,async tx=>{
   await this.authorize(tx,organizationId,identity);
   const existing=await tx.governedToolRegistration.findUnique({
    where:{organizationId_kind_serverKey:{
     organizationId,kind:manifest.kind,serverKey:manifest.serverKey
    }}
   });
   if(existing){
    if(existing.manifestDigest!==digest||existing.signature!==signature||
       existing.signerKeyId!==signerKeyId)
     throw new ConflictException('Tool identity already bound to another immutable manifest');
    return{...this.projection(existing),replayed:true};
   }
   const row=await tx.governedToolRegistration.create({data:{
    id:randomUUID(),organizationId,kind:manifest.kind,
    serverKey:manifest.serverKey,name:manifest.name,
    manifest:manifest as unknown as Prisma.InputJsonValue,
    manifestDigest:digest,signature,signerKeyId,trustTier:manifest.trustTier,
    status:'QUARANTINED',createdBy:identity.userId
   }});
   await tx.auditEvent.create({data:{organizationId,actorType:'HUMAN',
    actorId:identity.userId,action:'TOOL_MANIFEST_QUARANTINED',
    objectType:'GovernedToolRegistration',objectId:row.id,
    correlationId:row.id,after:{digest,kind:manifest.kind,
     tier:manifest.trustTier,serverKey:manifest.serverKey,networkCalls:0}}});
   return{...this.projection(row),replayed:false};
  });
 }
 async approve(organizationId:string,identity:VerifiedIdentity,
  id:string,expectedVersion:unknown){
  slug(id,'registration id',160);
  if(!Number.isSafeInteger(expectedVersion)||(expectedVersion as number)<1)
   throw new BadRequestException('Expected version required');
  return this.transaction(organizationId,async tx=>{
   await this.authorize(tx,organizationId,identity);
   const row=await tx.governedToolRegistration.findFirst({where:{id,organizationId}});
   if(!row)throw new NotFoundException('Tool registration not found in tenant');
   if(row.status==='APPROVED')return{...this.projection(row),replayed:true};
   if(row.status!=='QUARANTINED')
    throw new ConflictException('Revoked tool registrations cannot reopen');
   if(row.version!==expectedVersion)
    throw new ConflictException('Tool manifest changed concurrently');
   if(row.createdBy===identity.userId)
    throw new ForbiddenException('Independent tool manifest reviewer required');
   const manifest=parseToolManifest(row.manifest);
   if(toolManifestDigest(manifest)!==row.manifestDigest||
    !verifyTrustedToolSignature(manifest,row.signature,row.signerKeyId,trustConfig()))
    throw new ForbiddenException('Trusted Ed25519 manifest signer not configured or signature invalid');
   const changed=await tx.governedToolRegistration.updateMany({
    where:{id,organizationId,status:'QUARANTINED',version:row.version},
    data:{status:'APPROVED',version:{increment:1},
     approvedBy:identity.userId,approvedAt:new Date()}
   });
   if(changed.count!==1)throw new ConflictException('Concurrent tool approval');
   await tx.auditEvent.create({data:{organizationId,actorType:'HUMAN',
    actorId:identity.userId,action:'TOOL_MANIFEST_APPROVED_METADATA_ONLY',
    objectType:'GovernedToolRegistration',objectId:id,correlationId:id,
    after:{manifestDigest:row.manifestDigest,version:row.version+1,
     remoteExecutionAuthorized:false}}});
   await tx.outboxEvent.create({data:{organizationId,eventId:randomUUID(),
    eventType:'ToolManifestApprovedInternal',aggregateType:'GovernedToolRegistration',
    aggregateId:id,version:row.version+1,correlationId:id,
    payload:{registrationId:id,manifestDigest:row.manifestDigest,
     metadataOnly:true,externalEffectsAuthorized:false}}});
   const approved=await tx.governedToolRegistration.findFirstOrThrow({
    where:{id,organizationId}
   });
   return{...this.projection(approved),replayed:false};
  });
 }
 async revoke(organizationId:string,identity:VerifiedIdentity,id:string,
  expectedVersion:unknown,reasonInput:unknown){
  slug(id,'registration id',160);
  if(!Number.isSafeInteger(expectedVersion)||(expectedVersion as number)<1)
   throw new BadRequestException('Expected version required');
  const reason=typeof reasonInput==='string'?reasonInput.trim():'';
  if(reason.length<12||reason.length>500)
   throw new BadRequestException('Revocation reason must be 12-500 characters');
  return this.transaction(organizationId,async tx=>{
   await this.authorize(tx,organizationId,identity);
   const row=await tx.governedToolRegistration.findFirst({where:{id,organizationId}});
   if(!row)throw new NotFoundException('Tool registration not found in tenant');
   if(row.status==='REVOKED')return{...this.projection(row),replayed:true};
   if(row.version!==expectedVersion)
    throw new ConflictException('Tool registration changed concurrently');
   const changed=await tx.governedToolRegistration.updateMany({
    where:{id,organizationId,status:row.status,version:row.version},
    data:{status:'REVOKED',version:{increment:1},
     revokedBy:identity.userId,revokedAt:new Date()}
   });
   if(changed.count!==1)throw new ConflictException('Concurrent tool revocation');
   await tx.auditEvent.create({data:{organizationId,actorType:'HUMAN',
    actorId:identity.userId,action:'TOOL_MANIFEST_REVOKED',
    objectType:'GovernedToolRegistration',objectId:id,correlationId:id,
    before:{status:row.status},after:{reason,status:'REVOKED',networkCalls:0}}});
   await tx.outboxEvent.create({data:{organizationId,eventId:randomUUID(),
    eventType:'ToolManifestRevokedInternal',aggregateType:'GovernedToolRegistration',
    aggregateId:id,version:row.version+1,correlationId:id,
    payload:{registrationId:id,revoked:true,externalEffectsAuthorized:false}}});
   const revoked=await tx.governedToolRegistration.findFirstOrThrow({
    where:{id,organizationId}
   });
   return{...this.projection(revoked),replayed:false};
  });
 }
 async inspect(organizationId:string,identity:VerifiedIdentity,id:string,
  toolKey:unknown,requestedScope:unknown){
  slug(id,'registration id',160);
  return this.transaction(organizationId,async tx=>{
   await this.authorize(tx,organizationId,identity);
   const row=await tx.governedToolRegistration.findFirst({where:{id,organizationId}});
   if(!row)throw new NotFoundException('Tool registration not found in tenant');
   const manifest=parseToolManifest(row.manifest);
   const signatureTrusted=verifyTrustedToolSignature(manifest,
    row.signature,row.signerKeyId,trustConfig());
   return{registrationId:id,manifestDigest:row.manifestDigest,
    signatureTrusted,registrationStatus:row.status,
    ...inspectToolInvocation(manifest,toolKey,requestedScope,row.status),
    readyForNetwork:false as const};
  });
 }
}
