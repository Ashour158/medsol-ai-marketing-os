import {BadRequestException,ConflictException} from '@nestjs/common';
import {createHash,randomUUID} from 'node:crypto';
import {
 GetObjectCommand,PutObjectCommand,S3Client
} from '@aws-sdk/client-s3';
import {identify,type VersionedMediaReader} from './verified-media-evidence.service.js';

const MAX_MEDIA_BYTES=24*1024*1024;
const SOURCE_PREFIX='internal:creative-source/';
const sha=(bytes:Uint8Array)=>'sha256:'+createHash('sha256').update(bytes).digest('hex');

/** The scanner result is accepted only from a deployment-wired scanner, not
 * an API/agent payload. The S3 adapter always rescans on GET and PUT.
 */
export interface MediaMalwareScanner {
 scan(bytes:Uint8Array):Promise<{status:'CLEAN';scannerId:string}>;
}
export type S3MediaConfig={bucket:string;region:string;kmsKeyArn:string;retentionDays:number};
export function validateS3MediaConfig(c:S3MediaConfig):S3MediaConfig {
 if(!c||!c.bucket||!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(c.bucket)||
  c.bucket.includes('..')||c.bucket.includes('.-')||c.bucket.includes('-.')||
  !/^[a-z]{2}(?:-gov)?-[a-z]+-[0-9]+$/.test(c.region)||
  !/^arn:aws(?:-us-gov|-cn)?:kms:[a-z0-9-]+:[0-9]{12}:key\/[A-Za-z0-9-]{6,64}$/.test(c.kmsKeyArn)||
  c.kmsKeyArn.split(':')[3]!==c.region||
  !Number.isInteger(c.retentionDays)||c.retentionDays<30||c.retentionDays>3650)
  throw new BadRequestException('Approved dedicated, versioned S3/KMS Object Lock configuration required');
 return {...c};
}
function tenantKey(organizationId:string,sourceRef:string):string{
 if(!/^[A-Za-z0-9_-]{1,128}$/.test(organizationId)||
  !/^internal:creative-source\/[A-Za-z0-9_-]{8,128}$/.test(sourceRef))
  throw new BadRequestException('Tenant-bound opaque creative source reference required');
 const opaque=sourceRef.slice(SOURCE_PREFIX.length);
 return 'tenants/'+organizationId+'/creative-source/'+opaque;
}
function scanProvenance(scan:unknown):{status:'CLEAN';scannerId:string}{
 if(!scan||typeof scan!=='object')throw new ConflictException('Media scanner unavailable');
 const candidate=scan as {status?:unknown;scannerId?:unknown};
 if(candidate.status!=='CLEAN'||typeof candidate.scannerId!=='string'||
  !/^[A-Za-z0-9_.-]{3,80}$/.test(candidate.scannerId))
  throw new ConflictException('Media malware scan did not prove CLEAN');
 return{status:'CLEAN',scannerId:candidate.scannerId};
}
function checkedBytes(bytes:unknown):Uint8Array{
 if(!(bytes instanceof Uint8Array)||bytes.byteLength<16||bytes.byteLength>MAX_MEDIA_BYTES)
  throw new BadRequestException('Media exceeds verified upload bounds');
 if(!identify(bytes))throw new BadRequestException('Media signature not supported');
 return bytes;
}

/** S3 SDK implementation of the EXISTING VersionedMediaReader port.
 * Not a second DAM, evidence ledger, upload API or publication engine.
 * Only deployment IAM supplies credentials; arbitrary endpoint injection is
 * deliberately unsupported.
 */
export class S3VersionedMediaStore implements VersionedMediaReader {
 readonly config:S3MediaConfig;
 constructor(private readonly s3:S3Client,config:S3MediaConfig,
  private readonly malwareScanner:MediaMalwareScanner){
  this.config=validateS3MediaConfig(config);
  if(!malwareScanner||typeof malwareScanner.scan!=='function')
   throw new BadRequestException('Configured malware scanner required');
 }
 static fromEnvironment(scanner:MediaMalwareScanner):S3VersionedMediaStore{
  const region=process.env.MARKETING_MEDIA_S3_REGION??'';
  const config=validateS3MediaConfig({
   bucket:process.env.MARKETING_MEDIA_S3_BUCKET??'',
   region,kmsKeyArn:process.env.MARKETING_MEDIA_S3_KMS_KEY_ARN??'',
   retentionDays:Number(process.env.MARKETING_MEDIA_S3_OBJECT_LOCK_DAYS??30)
  });
  // Credential chain is AWS SDK managed (IAM role/IRSA); never accept caller
  // credentials, session tokens, local mock endpoint or tenant bucket name.
  return new S3VersionedMediaStore(new S3Client({region,maxAttempts:1}),config,scanner);
 }
 private async clean(bytes:Uint8Array){
  try{return scanProvenance(await this.malwareScanner.scan(bytes))}
  catch{throw new ConflictException('Media malware scan unavailable or not CLEAN');}
 }
 /** Backend-only ingestion, before a canonical DAM revision is registered.
  * Conditional write and S3 Object Lock make source versions non-overwritable.
  */
 async storeCleanVersion(input:{organizationId:string;bytes:Uint8Array;contentType:string}){
  const bytes=checkedBytes(input?.bytes);
  const mime=identify(bytes)!;
  if(input.contentType!==mime)
   throw new BadRequestException('Claimed MIME conflicts with media signature');
  const scan=await this.clean(bytes);
  const sourceRef=SOURCE_PREFIX+randomUUID();
  const Key=tenantKey(input.organizationId,sourceRef);
  const expires=new Date(Date.now()+this.config.retentionDays*86400000);
  const result=await this.s3.send(new PutObjectCommand({
   Bucket:this.config.bucket,Key,Body:Buffer.from(bytes),
   ContentType:mime,ContentLength:bytes.length,IfNoneMatch:'*',
   ChecksumSHA256:createHash('sha256').update(bytes).digest('base64'),
   ServerSideEncryption:'aws:kms',SSEKMSKeyId:this.config.kmsKeyArn,
   BucketKeyEnabled:true,ObjectLockMode:'COMPLIANCE',
   ObjectLockRetainUntilDate:expires
  }));
  if(!result.VersionId||result.VersionId==='null')
   throw new ConflictException('S3 versioning is absent; cannot register creative source');
  // Verify the immutable bytes, independent storage attributes, malware scan
  // and version ID BEFORE permitting DAM registration.
  const reread=await this.readVersion({organizationId:input.organizationId,sourceRef});
  if(reread.objectVersion!==result.VersionId||sha(reread.bytes)!==sha(bytes)||
   reread.malwareScan?.status!=='CLEAN'||
   reread.malwareScan.scannerId!==scan.scannerId)
   throw new ConflictException('Versioned S3 readback differs from uploaded media');
  return{
   sourceRef,objectVersion:result.VersionId,
   renditionDigest:sha(bytes),sizeBytes:bytes.length,detectedMime:mime,
   malwareScanStatus:'CLEAN' as const,scannerId:scan.scannerId,
   readyForCanonicalDamRegistration:true,externalEffectsAuthorized:false
  };
 }
 async readVersion(input:{organizationId:string;sourceRef:string}){
  const Key=tenantKey(input.organizationId,input.sourceRef);
  const ac=new AbortController();
  let response:Awaited<ReturnType<S3Client['send']>>;
  try{
   response=await this.s3.send(new GetObjectCommand({Bucket:this.config.bucket,Key}),{
    abortSignal:ac.signal
   });
  }catch{
   throw new ConflictException('Immutable S3 media readback unavailable');
  }
  // Explicit properties are checked without trusting an ETag or caller hash.
  const obj=response as {
   VersionId?:string;ContentLength?:number;ServerSideEncryption?:string;
   SSEKMSKeyId?:string;ObjectLockMode?:string;ObjectLockRetainUntilDate?:Date;
   Body?:AsyncIterable<Uint8Array>;
  };
  if(!obj.VersionId||obj.VersionId==='null'||
   !Number.isSafeInteger(obj.ContentLength)||obj.ContentLength!<16||
   obj.ContentLength!>MAX_MEDIA_BYTES||
   obj.ServerSideEncryption!=='aws:kms'||
   obj.SSEKMSKeyId!==this.config.kmsKeyArn||
   obj.ObjectLockMode!=='COMPLIANCE'||
   !(obj.ObjectLockRetainUntilDate instanceof Date)||
   !Number.isFinite(obj.ObjectLockRetainUntilDate.getTime())||
   obj.ObjectLockRetainUntilDate.getTime()<=Date.now()||
   !obj.Body||typeof obj.Body[Symbol.asyncIterator]!=='function'){
   ac.abort();
   throw new ConflictException('S3 version, KMS, Object Lock or size attestation missing');
  }
  let total=0;
  const chunks:Buffer[]=[];
  try{
   for await(const chunk of obj.Body){
    if(!(chunk instanceof Uint8Array))throw new Error('Invalid object byte chunk');
    total+=chunk.byteLength;
    if(total>MAX_MEDIA_BYTES||total>obj.ContentLength!)throw new Error('Oversized response');
    chunks.push(Buffer.from(chunk));
   }
  }catch{
   ac.abort();
   throw new ConflictException('Media stream failed integrity and bounded-read rules');
  }
  if(total!==obj.ContentLength)
   throw new ConflictException('Media stream truncated or inconsistent');
  const bytes=checkedBytes(Buffer.concat(chunks,total));
  const malwareScan=await this.clean(bytes);
  return{sourceRef:input.sourceRef,objectVersion:obj.VersionId,bytes,malwareScan};
 }
}
