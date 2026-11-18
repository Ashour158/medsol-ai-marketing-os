import {BadRequestException,ConflictException,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {PrismaService} from './prisma.service.js';

/** Catalog identity is NOT a functioning provider integration. */
export const PLATFORM_CATALOG=[
 {key:'LINKEDIN',label:'LinkedIn',category:'SOCIAL',connectionLive:false,verifiedCapabilities:[]},
 {key:'META_GRAPH',label:'Meta (Facebook/Instagram)',category:'SOCIAL',connectionLive:false,verifiedCapabilities:[]},
 {key:'TIKTOK',label:'TikTok',category:'SOCIAL',connectionLive:false,verifiedCapabilities:[]},
 {key:'YOUTUBE',label:'YouTube',category:'SOCIAL',connectionLive:false,verifiedCapabilities:[]},
 {key:'X_API',label:'X',category:'SOCIAL',connectionLive:false,verifiedCapabilities:[]}
] as const;
const PROVIDERS=new Set<string>(PLATFORM_CATALOG.map(x=>x.key));
function id(value:unknown,label:string):string{
 if(typeof value!=='string'||!value||value.length>128||!/^[A-Za-z0-9_-]+$/.test(value))
  throw new BadRequestException('Invalid '+label);
 return value;
}
function label(value:unknown):string{
 if(typeof value!=='string'||value.trim().length<3||value.trim().length>90||
    /[\u0000-\u001f]/.test(value))throw new BadRequestException('Valid destination label required');
 return value.trim();
}
@Injectable()
export class PlatformIntegrationHubService{
 constructor(private readonly db:PrismaService){}
 catalog(){return PLATFORM_CATALOG;}
 private scoped<T>(organizationId:string,fn:(tx:Prisma.TransactionClient)=>Promise<T>):Promise<T>{
  id(organizationId,'tenant');
  return this.db.$transaction(async tx=>{
   await tx.$queryRawUnsafe("SELECT set_config('app.marketing_tenant_id', $1, true)",organizationId);
   return fn(tx);
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
 }
 private present(item:{id:string;brandId:string;providerKey:string;destinationLabel:string;
  destinationRef:string;status:string;version:number;createdAt:Date}){
  return{id:item.id,brandId:item.brandId,providerKey:item.providerKey,
   destinationLabel:item.destinationLabel,destinationRef:item.destinationRef,status:item.status,
   version:item.version,createdAt:item.createdAt,
   credentialsConnected:false,providerVerified:false,verifiedCapabilities:[],
   externalEffectsAuthorized:false};
 }
 async register(organizationId:string,actorId:string,raw:unknown){
  id(actorId,'actor');
  if(!raw||typeof raw!=='object'||Array.isArray(raw))
   throw new BadRequestException('Registration object required');
  const input=raw as Record<string,unknown>;
  if(Object.keys(input).some(k=>!['brandId','providerKey','destinationLabel'].includes(k)))
   throw new BadRequestException('Never submit credentials, scopes or verification status in registration');
  const brandId=id(input.brandId,'brand'),providerKey=id(input.providerKey,'provider');
  if(!PROVIDERS.has(providerKey))throw new BadRequestException('Unsupported provider catalog entry');
  const destinationLabel=label(input.destinationLabel);
  return this.scoped(organizationId,async tx=>{
   const brand=await tx.brand.findFirst({where:{organizationId,id:brandId,status:'ACTIVE'},
    select:{id:true}});
   if(!brand)throw new NotFoundException('Active tenant brand not found');
   const connectionId=randomUUID();
   try{
    const created=await tx.integrationConnection.create({data:{
     id:connectionId,organizationId,brandId,providerKey,destinationLabel,
     destinationRef:'internal:connected-destination/'+connectionId,createdBy:actorId
    }});
    await tx.auditEvent.create({data:{organizationId,actorType:'HUMAN',actorId,
     action:'INTEGRATION_DESTINATION_REGISTERED',objectType:'IntegrationConnection',
     objectId:created.id,correlationId:created.id,
     after:{brandId,providerKey,destinationRef:created.destinationRef,
      status:'PENDING_VERIFICATION',credentialConnected:false,externalEffectsAuthorized:false}}});
    return this.present(created);
   }catch(error){
    if((error as {code?:string})?.code==='P2002')
     throw new ConflictException('Destination already registered; cannot silently replace it');
    throw error;
   }
  });
 }
 list(organizationId:string,brandIdInput?:unknown){
  const brandId=brandIdInput===undefined?undefined:id(brandIdInput,'brand');
  return this.scoped(organizationId,async tx=>{
   const items=await tx.integrationConnection.findMany({where:{
    organizationId,...(brandId?{brandId}:{})},orderBy:{createdAt:'desc'},take:100});
   return items.map(x=>this.present(x));
  });
 }
 async get(organizationId:string,connectionIdInput:unknown){
  const connectionId=id(connectionIdInput,'connection');
  return this.scoped(organizationId,async tx=>{
   const row=await tx.integrationConnection.findFirst({where:{organizationId,id:connectionId}});
   if(!row)throw new NotFoundException('Destination registration not found in tenant');
   return this.present(row);
  });
 }
 async change(organizationId:string,actorId:string,connectionIdInput:unknown,
   expectedVersionInput:unknown,action:'SUSPEND'|'REVOKE',reasonInput:unknown){
  id(actorId,'actor');const connectionId=id(connectionIdInput,'connection');
  if(!Number.isSafeInteger(expectedVersionInput)||(expectedVersionInput as number)<1)
   throw new BadRequestException('Expected connection version required');
  const reason=typeof reasonInput==='string'?reasonInput.trim():'';
  if(reason.length<12||reason.length>500)
   throw new BadRequestException('Reason of 12–500 characters required');
  if(action!=='SUSPEND'&&action!=='REVOKE')throw new BadRequestException('Invalid connection action');
  return this.scoped(organizationId,async tx=>{
   const row=await tx.integrationConnection.findFirst({where:{organizationId,id:connectionId}});
   if(!row)throw new NotFoundException('Connection not found in tenant');
   if(row.status==='REVOKED'||(action==='SUSPEND'&&row.status==='SUSPENDED'))
    return{connectionId,status:row.status,replayed:true,externalEffectsAuthorized:false};
   if(row.version!==expectedVersionInput)throw new ConflictException('Stale connection version');
   if(row.status!=='PENDING_VERIFICATION'&&!(row.status==='SUSPENDED'&&action==='REVOKE'))
    throw new ConflictException('Connection cannot be promoted or restored');
   const next=action==='REVOKE'?'REVOKED':'SUSPENDED';
   const changed=await tx.integrationConnection.updateMany({where:{
    id:connectionId,organizationId,version:row.version,status:row.status},
    data:{status:next,version:{increment:1},
     ...(action==='REVOKE'?{revokedAt:new Date(),revokedBy:actorId}:
       {suspendedAt:new Date(),suspendedBy:actorId})}});
   if(changed.count!==1)throw new ConflictException('Concurrent connection policy change');
   await tx.auditEvent.create({data:{organizationId,actorType:'HUMAN',actorId,
    action:'INTEGRATION_CONNECTION_'+next,objectType:'IntegrationConnection',
    objectId:connectionId,correlationId:connectionId,
    before:{status:row.status,version:row.version},
    after:{status:next,version:row.version+1,reason,externalEffectsAuthorized:false}}});
   return{connectionId,status:next,replayed:false,externalEffectsAuthorized:false};
  });
 }
}
