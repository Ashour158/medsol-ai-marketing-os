import {BadRequestException,ConflictException,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '@prisma/client';
import {createHash,randomUUID} from 'node:crypto';
import {PrismaService} from './prisma.service.js';

/** Trusted back-end interface, never constructed from HTTP or LLM input.
 * A production adapter must authenticate to a versioned immutable object store
 * and read the bytes back through its own credentials before attestation.
 */
export interface VersionedMediaReader {
 readVersion(input:{organizationId:string;sourceRef:string}):Promise<{
  sourceRef:string;objectVersion:string;bytes:Uint8Array;
  malwareScan?:{status:'CLEAN';scannerId:string};
 }>;
}
const MAX_BYTES=24*1024*1024;
const digest=(bytes:Uint8Array)=>'sha256:'+createHash('sha256').update(bytes).digest('hex');
export function identify(bytes:Uint8Array):'image/png'|'image/jpeg'|'image/webp'|null {
 if(bytes.length>=8&&[137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b))
  return 'image/png';
 if(bytes.length>=4&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)
  return 'image/jpeg';
 if(bytes.length>=12&&Buffer.from(bytes.subarray(0,4)).toString()==='RIFF'&&
    Buffer.from(bytes.subarray(8,12)).toString()==='WEBP')return 'image/webp';
 return null;
}
function ident(v:unknown,name:string):string{
 if(typeof v!=='string'||!v||v.length>128||!/^[A-Za-z0-9_-]+$/.test(v))
  throw new BadRequestException('Invalid '+name);
 return v;
}
/** Owns SHA-256 readback observations, not CreativeAssetRevision or storage. */
@Injectable()
export class VerifiedMediaEvidenceService{
 constructor(private readonly db:PrismaService){}
 private scoped<T>(org:string,fn:(tx:Prisma.TransactionClient)=>Promise<T>):Promise<T>{
  ident(org,'tenant');
  return this.db.$transaction(async tx=>{
   await tx.$queryRawUnsafe("SELECT set_config('app.marketing_tenant_id', $1, true)",org);
   return fn(tx);
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
 }
 async list(organizationId:string){
  return this.scoped(organizationId,async tx=>{
   const found=await tx.verifiedMediaEvidence.findMany({where:{organizationId},
    orderBy:{verifiedAt:'desc'},take:100});
   return found.map(r=>({
    id:r.id,creativeAssetRevisionId:r.creativeAssetRevisionId,sha256Digest:r.sha256Digest,
    sizeBytes:r.sizeBytes,detectedMime:r.detectedMime,status:r.status,
    malwareScanStatus:r.malwareScanStatus,scannerId:r.scannerId,
    objectVersion:r.objectVersion,evidenceOrigin:r.evidenceOrigin,verifiedAt:r.verifiedAt,
    externalEffectsAuthorized:false
   }));
  });
 }
 async get(organizationId:string,revisionIdInput:unknown){
  const revisionId=ident(revisionIdInput,'revision');
  return this.scoped(organizationId,async tx=>{
   const row=await tx.verifiedMediaEvidence.findUnique({
    where:{organizationId_creativeAssetRevisionId:{
     organizationId,creativeAssetRevisionId:revisionId}}});
   if(!row)throw new NotFoundException('Verified media evidence not found in tenant');
   return{id:row.id,creativeAssetRevisionId:revisionId,sha256Digest:row.sha256Digest,
    sizeBytes:row.sizeBytes,detectedMime:row.detectedMime,objectVersion:row.objectVersion,
    verifiedAt:row.verifiedAt,status:row.status,evidenceOrigin:row.evidenceOrigin,
    malwareScanStatus:row.malwareScanStatus,scannerId:row.scannerId,
    independentlyDecoded:false,remotePlatformMediaEligible:false,
    externalEffectsAuthorized:false};
  });
 }
 /** NO HTTP route: only a trusted, server-configured object reader can invoke.
  * A browser-supplied digest, URL or filename can never create evidence.
  */
 /** Immutable synthetic raster readback: verification only from locally stored
  * authoritative DAM bytes. NO caller-supplied source URL, reader, MIME or
  * scan claim; this evidence is explicitly INELIGIBLE for real provider egress.
  */
 async verifyOfflineRaster(organizationId:string,revisionIdInput:unknown){
  const revisionId=ident(revisionIdInput,'revision');
  return this.verifyReadbackWithOrigin(organizationId,'offline-dam-raster-verifier',
   revisionId,{readVersion:async input=>{
    const row=await this.scoped(input.organizationId,tx=>
     tx.creativeAssetRevision.findFirst({where:{
      organizationId:input.organizationId,id:revisionId
     },select:{sourceRef:true,offlineRasterBase64:true,sourceKind:true}}));
    if(!row||!row.offlineRasterBase64||
       row.sourceKind!=='FLATTENED_EXPORT'||row.sourceRef!==input.sourceRef||
       !row.sourceRef.startsWith('internal:creative-source/offline/'))
     throw new BadRequestException('Only authoritative offline DAM raster can be read back');
    return{sourceRef:row.sourceRef,objectVersion:'offline-db-raster-v1',
     bytes:Buffer.from(row.offlineRasterBase64,'base64')};
   }},'OFFLINE_DB_RASTER');
 }
 async verifyReadback(organizationId:string,verifierId:string,revisionIdInput:unknown,
  reader:VersionedMediaReader){
  return this.verifyReadbackWithOrigin(organizationId,verifierId,revisionIdInput,
   reader,'VERSIONED_OBJECT_STORE');
 }
 private async verifyReadbackWithOrigin(organizationId:string,verifierId:string,
  revisionIdInput:unknown,reader:VersionedMediaReader,
  evidenceOrigin:'VERSIONED_OBJECT_STORE'|'OFFLINE_DB_RASTER'){
  ident(verifierId,'verifier');const revisionId=ident(revisionIdInput,'revision');
  if(!reader||typeof reader.readVersion!=='function')
   throw new BadRequestException('Trusted versioned media reader required');
  const revision=await this.scoped(organizationId,tx=>tx.creativeAssetRevision.findFirst({
   where:{organizationId,id:revisionId}}));
  if(!revision)throw new NotFoundException('Creative revision not found in tenant');
  const object=await reader.readVersion({organizationId,sourceRef:revision.sourceRef});
  if(!object||object.sourceRef!==revision.sourceRef||
    typeof object.objectVersion!=='string'||object.objectVersion==='null'||
    !/^[A-Za-z0-9._:+/=-]{3,1024}$/.test(object.objectVersion)||
    !(object.bytes instanceof Uint8Array))
   throw new BadRequestException('Versioned object-store readback provenance required');
  if(object.bytes.length<16||object.bytes.length>MAX_BYTES)
   throw new BadRequestException('Media byte size outside acceptance range');
  const detectedMime=identify(object.bytes);
  if(!detectedMime)throw new BadRequestException('Unsupported or unrecognized media signature');
  if(evidenceOrigin==='OFFLINE_DB_RASTER'&&object.malwareScan)
   throw new BadRequestException('Synthetic raster cannot claim independent malware scan');
  const scan=object.malwareScan;
  if(scan!==undefined&&(scan.status!=='CLEAN'||typeof scan.scannerId!=='string'||
      !/^[A-Za-z0-9_.-]{3,80}$/.test(scan.scannerId)))
   throw new BadRequestException('Invalid trusted malware scan provenance');
  const malwareScanStatus=scan?.status??'NOT_SCANNED';
  const scannerId=scan?.scannerId??null;
  const actualDigest=digest(object.bytes);
  if(actualDigest!==revision.renditionDigest)
   throw new ConflictException('Readback SHA-256 differs from immutable creative revision');
  return this.scoped(organizationId,async tx=>{
   const current=await tx.creativeAssetRevision.findFirst({where:{organizationId,id:revisionId}});
   const asset=current&&await tx.creativeAsset.findFirst({where:{
    organizationId,id:current.assetId,status:'ACTIVE'}});
   if(!current||!asset||asset.version!==current.version||
      current.sourceRef!==object.sourceRef||current.renditionDigest!==actualDigest)
    throw new ConflictException('Creative source/revision changed during storage readback');
   const existing=await tx.verifiedMediaEvidence.findUnique({where:{
    organizationId_creativeAssetRevisionId:{organizationId,creativeAssetRevisionId:revisionId}}});
   if(existing){
    if(existing.status!=='VERIFIED_READBACK'||existing.sha256Digest!==actualDigest||
      existing.objectVersion!==object.objectVersion||existing.sizeBytes!==object.bytes.length||
      existing.detectedMime!==detectedMime||
      existing.evidenceOrigin!==evidenceOrigin||
      existing.malwareScanStatus!==malwareScanStatus||existing.scannerId!==scannerId)
     throw new ConflictException('Media evidence differs from original immutable object version');
    return{evidenceId:existing.id,status:existing.status,replayed:true,
     externalEffectsAuthorized:false};
   }
   const created=await tx.verifiedMediaEvidence.create({data:{
    id:randomUUID(),organizationId,creativeAssetRevisionId:revisionId,
    sourceRef:current.sourceRef,objectVersion:object.objectVersion,
    sha256Digest:actualDigest,sizeBytes:object.bytes.length,
    detectedMime,verifiedBy:verifierId,malwareScanStatus,scannerId,
    evidenceOrigin
   }});
   await tx.auditEvent.create({data:{organizationId,actorType:'SYSTEM',
    actorId:verifierId,action:'MEDIA_BYTES_READBACK_VERIFIED',
    objectType:'CreativeAssetRevision',objectId:revisionId,correlationId:created.id,
    after:{sha256Digest:actualDigest,sizeBytes:created.sizeBytes,
     objectVersion:created.objectVersion,detectedMime,
     malwareScanStatus,scannerId,evidenceOrigin,
     syntheticOnly:evidenceOrigin==='OFFLINE_DB_RASTER',
     signatureOnly:true,fullMediaDecodeValidated:false,
     externalEffectsAuthorized:false}}});
   return{evidenceId:created.id,status:created.status,replayed:false,
    sha256Digest:actualDigest,malwareScanStatus,evidenceOrigin,
    externalEffectsAuthorized:false};
  });
 }
 async revoke(organizationId:string,actorId:string,revisionIdInput:unknown,
  reasonInput:unknown){
  ident(actorId,'actor');const revisionId=ident(revisionIdInput,'revision');
  const reason=typeof reasonInput==='string'?reasonInput.trim():'';
  if(reason.length<12||reason.length>500)
   throw new BadRequestException('Revocation rationale must contain 12–500 characters');
  return this.scoped(organizationId,async tx=>{
   const row=await tx.verifiedMediaEvidence.findUnique({where:{
    organizationId_creativeAssetRevisionId:{organizationId,creativeAssetRevisionId:revisionId}}});
   if(!row)throw new NotFoundException('Media evidence not found in tenant');
   if(row.status==='REVOKED')return{evidenceId:row.id,status:'REVOKED',replayed:true,
    externalEffectsAuthorized:false};
   const changed=await tx.verifiedMediaEvidence.updateMany({where:{
    id:row.id,organizationId,status:'VERIFIED_READBACK'},
    data:{status:'REVOKED',revokedAt:new Date(),revokedBy:actorId}});
   if(changed.count!==1)throw new ConflictException('Concurrent evidence revocation');
   await tx.auditEvent.create({data:{organizationId,actorType:'HUMAN',actorId,
    action:'MEDIA_EVIDENCE_REVOKED',objectType:'CreativeAssetRevision',
    objectId:revisionId,correlationId:row.id,
    after:{reason,evidenceId:row.id,status:'REVOKED',externalEffectsAuthorized:false}}});
   return{evidenceId:row.id,status:'REVOKED',replayed:false,
    externalEffectsAuthorized:false};
  });
 }
}
