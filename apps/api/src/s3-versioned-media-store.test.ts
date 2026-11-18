import {describe,expect,it} from 'vitest';
import {GetObjectCommand,PutObjectCommand,type S3Client} from '@aws-sdk/client-s3';
import {S3VersionedMediaStore,validateS3MediaConfig,type MediaMalwareScanner}
 from './s3-versioned-media-store.js';
import {createHash} from 'node:crypto';

const PNG=Buffer.from(
 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/0pUAAAAASUVORK5CYII=',
 'base64'
);
const tenant='r2d-test-tenant';
const kms='arn:aws:kms:eu-west-1:123456789012:key/01234567-89ab-cdef-0123-456789abcdef';
const cfg={bucket:'medsol-private-media-test',region:'eu-west-1',kmsKeyArn:kms,retentionDays:30};
const cleaner:MediaMalwareScanner={scan:async()=>({status:'CLEAN',scannerId:'clamav_ci_1'})};
const stream=(bytes:Uint8Array):AsyncIterable<Uint8Array>=>({
 async *[Symbol.asyncIterator](){yield bytes.subarray(0,9);yield bytes.subarray(9);}
});
function fakeS3(overrides:{
 onPut?:(input:any)=>any;onGet?:(input:any)=>any
}={}){
 const versions=new Map<string,Uint8Array>();
 const calls:{command:string;input:any}[]=[];
 const client={
  send:async(command:any)=>{
   calls.push({command:command.constructor.name,input:command.input});
   if(command instanceof PutObjectCommand){
    if(overrides.onPut)return overrides.onPut(command.input);
    versions.set(command.input.Key,Buffer.from(command.input.Body));
    return{VersionId:'s3VersionA+12/='};
   }
   if(command instanceof GetObjectCommand){
    if(overrides.onGet)return overrides.onGet(command.input);
    const bytes=versions.get(command.input.Key);
    if(!bytes)throw new Error('Object not found');
    return{VersionId:'s3VersionA+12/=',ContentLength:bytes.length,
     ServerSideEncryption:'aws:kms',SSEKMSKeyId:kms,
     ObjectLockMode:'COMPLIANCE',
     ObjectLockRetainUntilDate:new Date(Date.now()+86400000),
     Body:stream(bytes)};
   }
   throw new Error('Unexpected storage command');
  }
 } as unknown as S3Client;
 return{client,calls};
}
describe('R2D versioned object storage contract',()=>{
 it('requires dedicated configured bucket, KMS ARN and compliance lock',()=>{
  expect(validateS3MediaConfig(cfg)).toEqual(cfg);
  for(const bad of [
   {...cfg,bucket:'evil..bucket'}, {...cfg,region:'http://localhost'},
   {...cfg,kmsKeyArn:'alias/unverified'}, {...cfg,retentionDays:0},
   {...cfg,region:'us-east-1'}
  ])expect(()=>validateS3MediaConfig(bad)).toThrow();
 });
 it('conditionally writes, KMS encrypts, compliance locks, rescans and roundtrip verifies',async()=>{
  const f=fakeS3();const store=new S3VersionedMediaStore(f.client,cfg,cleaner);
  const accepted=await store.storeCleanVersion({organizationId:tenant,bytes:PNG,contentType:'image/png'});
  expect(accepted).toMatchObject({sizeBytes:PNG.length,detectedMime:'image/png',
   objectVersion:'s3VersionA+12/=',malwareScanStatus:'CLEAN',scannerId:'clamav_ci_1',
   readyForCanonicalDamRegistration:true,externalEffectsAuthorized:false});
  expect(accepted.sourceRef).toMatch(/^internal:creative-source\/[a-f0-9-]{36}$/);
  expect(accepted.renditionDigest).toBe(
   'sha256:'+createHash('sha256').update(PNG).digest('hex'));
  const put=f.calls.find(x=>x.command==='PutObjectCommand')!;
  expect(put.input).toMatchObject({Bucket:cfg.bucket,
   ContentType:'image/png',IfNoneMatch:'*',
   ServerSideEncryption:'aws:kms',SSEKMSKeyId:kms,ObjectLockMode:'COMPLIANCE'});
  expect(put.input.Key).toMatch(/^tenants\/r2d-test-tenant\/creative-source\/[a-f0-9-]{36}$/);
  expect(put.input.ChecksumSHA256).toBe(
   createHash('sha256').update(PNG).digest('base64'));
  const reread=await store.readVersion({organizationId:tenant,sourceRef:accepted.sourceRef});
  expect(reread.bytes).toEqual(PNG);
  expect(reread.malwareScan).toEqual({status:'CLEAN',scannerId:'clamav_ci_1'});
 });
 it('does not read a different tenant or arbitrary object/key/URL',async()=>{
  const f=fakeS3();const store=new S3VersionedMediaStore(f.client,cfg,cleaner);
  for(const sourceRef of [
   'https://attacker.test/asset','internal:creative-source/../../other',
   'internal:creative-source/tenant/foreign','internal:creative-source/x',
   'internal:creative-source/%2e%2e/secret'
  ])await expect(store.readVersion({organizationId:tenant,sourceRef})).rejects.toThrow();
  await expect(store.readVersion({
   organizationId:'other/tenant',sourceRef:'internal:creative-source/12345678'
  })).rejects.toThrow();
  expect(f.calls).toHaveLength(0);
 });
 it('fails closed for missing compliance lock, wrong KMS, missing version or truncation',async()=>{
  const base={VersionId:'version1122',ContentLength:PNG.length,
   ServerSideEncryption:'aws:kms',SSEKMSKeyId:kms,ObjectLockMode:'COMPLIANCE',
   ObjectLockRetainUntilDate:new Date(Date.now()+86400000),Body:stream(PNG)};
  const cases=[
   {...base,VersionId:'null'}, {...base,ObjectLockMode:'GOVERNANCE'},
   {...base,SSEKMSKeyId:'wrong-key'}, {...base,ContentLength:PNG.length-1},
   {...base,ObjectLockRetainUntilDate:new Date(Date.now()-1000)},
   {...base,Body:stream(PNG.subarray(0,20))}
  ];
  for(const obj of cases){
   const f=fakeS3({onGet:()=>obj});
   const store=new S3VersionedMediaStore(f.client,cfg,cleaner);
   await expect(store.readVersion({
    organizationId:tenant,sourceRef:'internal:creative-source/12345678'
   })).rejects.toThrow();
  }
 });
 it('refuses an upload without a real version ID or a clean malware scan',async()=>{
  const f=fakeS3({onPut:()=>({VersionId:'null'})});
  await expect(new S3VersionedMediaStore(f.client,cfg,cleaner).storeCleanVersion({
   organizationId:tenant,bytes:PNG,contentType:'image/png'
  })).rejects.toThrow('versioning is absent');
  const denied:MediaMalwareScanner={scan:async()=>{throw new Error('EICAR FOUND');}};
  const cleanClient=fakeS3();
  await expect(new S3VersionedMediaStore(cleanClient.client,cfg,denied).storeCleanVersion({
   organizationId:tenant,bytes:PNG,contentType:'image/png'
  })).rejects.toThrow('malware scan');
  expect(cleanClient.calls).toHaveLength(0);
  await expect(new S3VersionedMediaStore(cleanClient.client,cfg,cleaner).storeCleanVersion({
   organizationId:tenant,bytes:PNG,contentType:'image/jpeg'
  })).rejects.toThrow('Claimed MIME');
 });
});
