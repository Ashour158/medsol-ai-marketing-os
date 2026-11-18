import {BadRequestException,ConflictException,ForbiddenException,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {PrismaService} from './prisma.service.js';
import {verifySignedMetaWebhook} from './meta-signed-webhook-verifier.js';

/** Secret resolution is deployment/connection managed. No caller-provided key,
 * shared global test secret, or public webhook API is created by this tranche.
 */
export interface MetaWebhookSecretResolver {
 secretFor(organizationId:string,connectionId:string):Promise<Uint8Array>;
}
const ident=(v:unknown,label:string)=>{
 if(typeof v!=='string'||v.length<1||v.length>128||!/^[A-Za-z0-9_-]+$/.test(v))
  throw new BadRequestException('Invalid '+label);
 return v;
};
/** Child of existing IntegrationConnection, using existing InboxEvent as
 * the deduplication owner. Provider signed notifications are quarantined,
 * not inferred outbound publish acknowledgments.
 */
@Injectable()
export class ProviderWebhookEvidenceService {
 constructor(private readonly db:PrismaService,
  private readonly secrets:MetaWebhookSecretResolver){}
 private scoped<T>(org:string,fn:(tx:Prisma.TransactionClient)=>Promise<T>):Promise<T>{
  ident(org,'tenant');
  return this.db.$transaction(async tx=>{
   await tx.$queryRawUnsafe("SELECT set_config('app.marketing_tenant_id', $1, true)",org);
   return fn(tx);
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
 }
 private connection(org:string,id:string){
  return this.scoped(org,tx=>tx.integrationConnection.findFirst({where:{
   organizationId:org,id,providerKey:'META_GRAPH',status:'PENDING_VERIFICATION'
  }}));
 }
 async ingestMeta(organizationId:string,adapterActor:string,connectionIdInput:unknown,
  raw:Uint8Array,signatureHeader:unknown){
  ident(adapterActor,'trusted adapter');
  const connectionId=ident(connectionIdInput,'connection');
  if(!this.secrets||typeof this.secrets.secretFor!=='function')
   throw new ForbiddenException('Deployment-managed Meta webhook verifier unavailable');
  const current=await this.connection(organizationId,connectionId);
  if(!current)throw new NotFoundException('Active Meta connection not found in tenant');
  let secret:Uint8Array;
  try{secret=await this.secrets.secretFor(organizationId,connectionId);}
  catch{throw new ForbiddenException('Meta webhook signature verification unavailable');}
  const verified=verifySignedMetaWebhook(raw,signatureHeader,secret);
  const work=async(tx:Prisma.TransactionClient)=>{
   const still=await tx.integrationConnection.findFirst({where:{
    organizationId,id:connectionId,providerKey:'META_GRAPH',status:'PENDING_VERIFICATION'
   }});
   if(!still)throw new ConflictException('Meta connection changed during signed notification');
   const unique={organizationId,integrationConnectionId:connectionId,
    payloadDigest:verified.payloadDigest};
   const prior=await tx.providerWebhookObservation.findUnique({where:{
    organizationId_integrationConnectionId_payloadDigest:unique}});
   if(prior)return{observationId:prior.id,status:'QUARANTINED' as const,
    replayed:true,receiptReconciled:false,externalEffectsAuthorized:false};
   const observation=await tx.providerWebhookObservation.create({data:{
    id:randomUUID(),organizationId,integrationConnectionId:connectionId,
    providerKey:'META_GRAPH',payloadDigest:verified.payloadDigest,
    signatureDigest:verified.signatureDigest,rawSizeBytes:verified.rawSizeBytes,
    eventClass:verified.eventClass,status:'QUARANTINED',verifiedBy:adapterActor
   }});
   await tx.inboxEvent.create({data:{organizationId,
    consumerName:'META_SIGNED_WEBHOOK',
    eventId:verified.payloadDigest,status:'PROCESSED',processedAt:new Date()}});
   await tx.auditEvent.create({data:{
    organizationId,actorType:'SYSTEM',actorId:adapterActor,
    action:'PROVIDER_SIGNED_WEBHOOK_QUARANTINED',
    objectType:'IntegrationConnection',objectId:connectionId,
    correlationId:observation.id,after:{
     providerKey:'META_GRAPH',eventClass:verified.eventClass,
     payloadDigest:verified.payloadDigest,entryCount:verified.entryCount,
     signatureVerified:true,customerDestinationBound:false,
     receiptReconciled:false,externalEffectsAuthorized:false
    }
   }});
   return{observationId:observation.id,status:'QUARANTINED' as const,
    replayed:false,receiptReconciled:false,externalEffectsAuthorized:false};
  };
  try{return await this.scoped(organizationId,work);}
  catch(e){
   // Concurrent deliveries share a unique tenant+connection+payload digest.
   // Only exact same signed bytes can be called replay; no event is retried.
   if((e as {code?:string})?.code==='P2002'){
    return this.scoped(organizationId,async tx=>{
     const prior=await tx.providerWebhookObservation.findUnique({where:{
      organizationId_integrationConnectionId_payloadDigest:{
       organizationId,integrationConnectionId:connectionId,
       payloadDigest:verified.payloadDigest
      }}});
     if(!prior)throw new ConflictException('Concurrent webhook evidence incomplete');
     return{observationId:prior.id,status:'QUARANTINED' as const,
      replayed:true,receiptReconciled:false,externalEffectsAuthorized:false};
    });
   }
   throw e;
  }
 }
 async list(organizationId:string,connectionIdInput:unknown){
  const connectionId=ident(connectionIdInput,'connection');
  return this.scoped(organizationId,async tx=>{
   const connection=await tx.integrationConnection.findFirst({where:{
    organizationId,id:connectionId
   }});
   if(!connection)throw new NotFoundException('Connection not found in tenant');
   const rows=await tx.providerWebhookObservation.findMany({where:{
    organizationId,integrationConnectionId:connectionId
   },orderBy:{verifiedAt:'desc'},take:100});
   return rows.map(row=>({
    id:row.id,providerKey:row.providerKey,payloadDigest:row.payloadDigest,
    eventClass:row.eventClass,verifiedAt:row.verifiedAt,status:row.status,
    receiptReconciled:false,customerDestinationBound:false,
    externalEffectsAuthorized:false
   }));
  });
 }
}
