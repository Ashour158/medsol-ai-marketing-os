import {BadRequestException,ConflictException,Injectable,NotFoundException} from '@nestjs/common';
import {createHash,randomUUID} from 'node:crypto';
import {Prisma} from '@prisma/client';
import {PrismaService} from './prisma.service.js';
import {ProviderSecretEnvelope} from './provider-secret-envelope.js';

/** Implementation-neutral, deployment-constructed read-only account adapter.
 * Never construct from HTTP requests, agent plans or user-submitted tokens.
 * No production adapter is bundled with R2C-C.
 */
export interface TrustedProviderAccountReader {
 providerKey:string;
 adapterId:string;
 readAccount(input:{accessToken:string;providerKey:string}):Promise<{
  providerKey:string;accountRef:string;sourceRequestId:string;
  observedScopes:string[];reportedCapabilities:string[];
 }>;
}
const CAPABILITIES=new Set(['ACCOUNT_READ','PAGES_READ','MEDIA_UPLOAD','POST_CREATE']);
const ident=(v:unknown,label:string,min=1,max=128)=>{
 if(typeof v!=='string'||v.length<min||v.length>max||!/^[A-Za-z0-9_:.-]+$/.test(v))
  throw new BadRequestException('Invalid '+label);
 return v;
};
const digest=(v:unknown)=>'sha256:'+createHash('sha256').update(JSON.stringify(v)).digest('hex');

/** Child evidence use case of the existing Integration Hub. Not another
 * credential owner, OAuth exchange, provider publisher or approval engine.
 */
@Injectable()
export class ProviderAccountObservationService {
 constructor(private readonly db:PrismaService){}
 private scoped<T>(org:string,fn:(tx:Prisma.TransactionClient)=>Promise<T>):Promise<T>{
  ident(org,'tenant');
  return this.db.$transaction(async tx=>{
   await tx.$queryRawUnsafe("SELECT set_config('app.marketing_tenant_id', $1, true)",org);
   return fn(tx);
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
 }
 async observe(org:string,actor:string,connectionIdInput:unknown,
  adapter:TrustedProviderAccountReader,vault:ProviderSecretEnvelope){
  ident(actor,'system actor');
  const connectionId=ident(connectionIdInput,'connection');
  if(!adapter||typeof adapter.readAccount!=='function'||
     !adapter.providerKey||!/^[-A-Z0-9_]{3,30}$/.test(adapter.providerKey)||
     !adapter.adapterId||!/^[-A-Za-z0-9_]{3,80}$/.test(adapter.adapterId)||
     !(vault instanceof ProviderSecretEnvelope))
   throw new BadRequestException('Deployment-managed read-only adapter and vault required');
  const source=await this.scoped(org,async tx=>{
   const connection=await tx.integrationConnection.findFirst({where:{
    organizationId:org,id:connectionId,status:'PENDING_VERIFICATION'}});
   if(!connection||connection.providerKey!==adapter.providerKey)
    throw new ConflictException('Provider and pending tenant destination must match');
   const cred=await tx.providerCredential.findUnique({where:{
    organizationId_integrationConnectionId:{
     organizationId:org,integrationConnectionId:connectionId}}});
   if(!cred||cred.providerKey!==adapter.providerKey||
      cred.status!=='PENDING_ATTESTATION'||cred.tokenExpiresAt.getTime()<=Date.now()+60000)
    throw new ConflictException('Fresh pending encrypted credential required');
   const previous=await tx.providerAccountObservation.findUnique({where:{
    organizationId_providerCredentialId:{organizationId:org,providerCredentialId:cred.id}}});
   if(previous)throw new ConflictException('Immutable account observation already exists');
   const granted=Array.isArray(cred.grantedScopes)?
    cred.grantedScopes.filter((s):s is string=>typeof s==='string'):[];
   return{credentialId:cred.id,token:cred.encryptedAccessToken,
    tokenExpiresAt:cred.tokenExpiresAt,granted};
  });
  // Provider introspection is outside SQL transaction and is never retried.
  const accessToken=vault.decrypt(source.token,org,connectionId,'access-v1');
  let response:Awaited<ReturnType<TrustedProviderAccountReader['readAccount']>>;
  try{
   response=await adapter.readAccount({accessToken,providerKey:adapter.providerKey});
  }catch{
   throw new ConflictException('Trusted provider readback failed; no observation recorded');
  }
  if(!response||response.providerKey!==adapter.providerKey)
   throw new ConflictException('Provider account readback mismatch');
  const accountRef=ident(response.accountRef,'observed account reference',3);
  const requestId=ident(response.sourceRequestId,'provider request identifier',8);
  const scopes=response.observedScopes,capabilities=response.reportedCapabilities;
  if(!Array.isArray(scopes)||scopes.length>12||
     scopes.some(s=>typeof s!=='string'||!source.granted.includes(s))||
     new Set(scopes).size!==scopes.length||
     !Array.isArray(capabilities)||capabilities.length>CAPABILITIES.size||
     capabilities.some(s=>typeof s!=='string'||!CAPABILITIES.has(s))||
     new Set(capabilities).size!==capabilities.length)
   throw new ConflictException('Unapproved scopes or reported capabilities');
  const observedAt=new Date();
  if(source.tokenExpiresAt.getTime()<=observedAt.getTime()+60000)
   throw new ConflictException('Token expired during provider readback');
  const expiresAt=new Date(Math.min(source.tokenExpiresAt.getTime(),observedAt.getTime()+600000));
  const observedScopes=[...scopes].sort(),observedCapabilities=[...capabilities].sort();
  const evidenceDigest=digest(['medsol-account-observation-v1',org,connectionId,
   source.credentialId,adapter.providerKey,accountRef,requestId,
   observedScopes,observedCapabilities,observedAt.toISOString()]);
  return this.scoped(org,async tx=>{
   const [connection,credential]=await Promise.all([
    tx.integrationConnection.findFirst({where:{
     organizationId:org,id:connectionId,status:'PENDING_VERIFICATION',
     providerKey:adapter.providerKey}}),
    tx.providerCredential.findFirst({where:{
     organizationId:org,id:source.credentialId,integrationConnectionId:connectionId,
     providerKey:adapter.providerKey,status:'PENDING_ATTESTATION',
     tokenExpiresAt:{gt:new Date(Date.now()+60000)}}})
   ]);
   if(!connection||!credential)
    throw new ConflictException('Provider connection changed during readback');
   const observation=await tx.providerAccountObservation.create({data:{
    id:randomUUID(),organizationId:org,integrationConnectionId:connectionId,
    providerCredentialId:source.credentialId,providerKey:adapter.providerKey,
    providerAccountRef:accountRef,observedScopes,observedCapabilities,
    sourceRequestId:requestId,evidenceDigest,observedBy:adapter.adapterId,
    observedAt,expiresAt
   }});
   await tx.auditEvent.create({data:{organizationId:org,actorType:'SYSTEM',
    actorId:actor,action:'PROVIDER_ACCOUNT_READBACK_OBSERVED',
    objectType:'IntegrationConnection',objectId:connectionId,
    correlationId:observation.id,after:{
     observationId:observation.id,providerKey:adapter.providerKey,
     scopesCount:observedScopes.length,capabilitiesCount:observedCapabilities.length,
     customerDestinationBound:false,externalEffectsAuthorized:false
    }}});
   return{observationId:observation.id,status:'OBSERVED',
    expiresAt,customerDestinationBound:false,externalEffectsAuthorized:false};
  });
 }
 async revoke(org:string,actor:string,connectionIdInput:unknown,reasonInput:unknown){
  ident(actor,'actor');const connectionId=ident(connectionIdInput,'connection');
  const reason=typeof reasonInput==='string'?reasonInput.trim():'';
  if(reason.length<12||reason.length>500)
   throw new BadRequestException('Revocation reason of 12-500 characters required');
  return this.scoped(org,async tx=>{
   const row=await tx.providerAccountObservation.findFirst({where:{
    organizationId:org,integrationConnectionId:connectionId}});
   if(!row)throw new NotFoundException('Account observation absent in tenant');
   if(row.status==='REVOKED')
    return{status:'REVOKED',replayed:true,externalEffectsAuthorized:false};
   const changed=await tx.providerAccountObservation.updateMany({where:{
    organizationId:org,id:row.id,status:'OBSERVED'},
    data:{status:'REVOKED',revokedAt:new Date(),revokedBy:actor}});
   if(changed.count!==1)throw new ConflictException('Concurrent observation revocation');
   await tx.auditEvent.create({data:{organizationId:org,actorType:'HUMAN',
    actorId:actor,action:'PROVIDER_ACCOUNT_OBSERVATION_REVOKED',
    objectType:'IntegrationConnection',objectId:connectionId,
    correlationId:row.id,after:{reason,externalEffectsAuthorized:false}}});
   return{status:'REVOKED',replayed:false,externalEffectsAuthorized:false};
  });
 }
}
