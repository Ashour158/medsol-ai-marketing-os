import {describe,expect,it} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {randomUUID,createHash} from 'node:crypto';
import {
 VerifiedMediaEvidenceService,type VersionedMediaReader
} from './verified-media-evidence.service.js';

const enabled=process.env.MARKETING_DB_INTEGRATION==='1';
const PNG=Buffer.from(
 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/0pUAAAAASUVORK5CYII=',
 'base64'
);
const digest='sha256:'+createHash('sha256').update(PNG).digest('hex');
describe.skipIf(!enabled)('R2D immutable scanned media evidence with real PostgreSQL',()=>{
 it('preserves legacy unscanned proof and stores clean scan provenance once',async()=>{
  const db=new PrismaClient();
  const org='r2d-org-'+randomUUID(),foreign='r2d-foreign-'+randomUUID();
  const brandId=randomUUID(),assetId=randomUUID(),revisionId=randomUUID();
  const legacyAssetId=randomUUID(),legacyRevisionId=randomUUID();
  const sourceRef='internal:creative-source/'+randomUUID();
  const legacySourceRef='internal:creative-source/'+randomUUID();
  const evidence=new VerifiedMediaEvidenceService(db as any);
  try{
   await db.$connect();
   await db.organization.createMany({data:[{id:org,name:'Scanned media evidence'},
    {id:foreign,name:'R2D foreign tenant'}]});
   await db.brand.create({data:{id:brandId,organizationId:org,
    slug:'r2d-media',name:'R2D media brand',createdBy:'owner'}});
   await db.$transaction(async tx=>{
    await tx.$queryRawUnsafe("SELECT set_config('app.marketing_tenant_id', $1, true)",org);
    for(const [a,r,s] of [
     [assetId,revisionId,sourceRef],[legacyAssetId,legacyRevisionId,legacySourceRef]
    ]){
     await tx.creativeAsset.create({data:{id:a,organizationId:org,
      brandId,title:'Media asset',createdBy:'owner',version:1}});
     await tx.creativeAssetRevision.create({data:{id:r,organizationId:org,assetId:a,
      version:1,sourceKind:'FLATTENED_EXPORT',sourceRef:s,renditionDigest:digest,
      rightsExpiresAt:new Date(Date.now()+86400000*90),createdBy:'designer'}});
    }
   });
   const reader:VersionedMediaReader={readVersion:async(input)=>({
    sourceRef:input.sourceRef,objectVersion:'s3Version+A/0123',bytes:PNG,
    malwareScan:{status:'CLEAN',scannerId:'clamav_clamd'}
   })};
   const verified=await evidence.verifyReadback(org,'scanner',revisionId,reader);
   expect(verified).toMatchObject({
    status:'VERIFIED_READBACK',malwareScanStatus:'CLEAN',
    externalEffectsAuthorized:false
   });
   expect(await evidence.get(org,revisionId)).toMatchObject({
    malwareScanStatus:'CLEAN',scannerId:'clamav_clamd',
    objectVersion:'s3Version+A/0123',remotePlatformMediaEligible:false,
    externalEffectsAuthorized:false
   });
   const old=await evidence.verifyReadback(org,'scanner',legacyRevisionId,{
    readVersion:async input=>({
     sourceRef:input.sourceRef,objectVersion:'legacy-1',bytes:PNG
    })
   });
   expect(old.malwareScanStatus).toBe('NOT_SCANNED');
   expect(await evidence.get(org,legacyRevisionId)).toMatchObject({
    malwareScanStatus:'NOT_SCANNED',scannerId:null,
    externalEffectsAuthorized:false
   });
   await expect(evidence.verifyReadback(org,'scanner',legacyRevisionId,reader))
    .rejects.toThrow('original immutable object version');
   await expect(evidence.get(foreign,revisionId)).rejects.toThrow('not found');
   await expect(evidence.verifyReadback(foreign,'scanner',revisionId,reader))
    .rejects.toThrow('Creative revision not found');
   await expect(evidence.verifyReadback(org,'scanner',revisionId,{
    readVersion:async input=>({...await reader.readVersion(input),
     malwareScan:{status:'CLEAN',scannerId:'untrusted/forged'}})
   })).rejects.toThrow('Invalid trusted malware scan provenance');
   await expect(db.$transaction(async tx=>{
    await tx.$queryRawUnsafe("SELECT set_config('app.marketing_tenant_id', $1, true)",org);
    return tx.verifiedMediaEvidence.update({where:{id:verified.evidenceId},
     data:{malwareScanStatus:'NOT_SCANNED',scannerId:null}});
   })).rejects.toThrow();
   await expect(db.$transaction(async tx=>{
    await tx.$queryRawUnsafe("SELECT set_config('app.marketing_tenant_id', $1, true)",org);
    return tx.verifiedMediaEvidence.delete({where:{id:verified.evidenceId}});
   })).rejects.toThrow();
   await evidence.revoke(org,'owner',revisionId,
    'Security screening attestation permanently withdrawn');
   expect(await evidence.get(org,revisionId)).toMatchObject({
    status:'REVOKED',malwareScanStatus:'CLEAN'});
   await expect(evidence.verifyReadback(org,'scanner',revisionId,reader))
    .rejects.toThrow('differs from original immutable');
   const audit=await db.auditEvent.findMany({where:{organizationId:org,
    action:'MEDIA_BYTES_READBACK_VERIFIED'}});
   expect(audit).toHaveLength(2);
   expect((audit[0]?.after as any)?.malwareScanStatus).toBeDefined();
  }finally{await db.$disconnect();}
 },90000);
});
