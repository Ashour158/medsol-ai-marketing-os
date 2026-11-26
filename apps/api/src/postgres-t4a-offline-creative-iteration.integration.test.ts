import {describe,it,expect} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {CreativeAssetService} from './creative-asset.service.js';
import {VerifiedMediaEvidenceService} from './verified-media-evidence.service.js';
import {ApprovalService} from './approval.service.js';
import {withMarketingTenant} from './prisma.service.js';

const enabled=process.env.MARKETING_DB_INTEGRATION==='1';
const later=(n:number)=>new Date(Date.now()+n*86400_000).toISOString();
function crc32(bytes:Buffer){
 let c=0xffffffff;
 for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}
 return(c^0xffffffff)>>>0;
}
function pngChunk(name:string,bytes:Buffer){
 const type=Buffer.from(name),len=Buffer.alloc(4),crc=Buffer.alloc(4);
 len.writeUInt32BE(bytes.length);crc.writeUInt32BE(crc32(Buffer.concat([type,bytes])));
 return Buffer.concat([len,type,bytes,crc]);
}
function png64(red=22,size=64):string{
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(size,0);ihdr.writeUInt32BE(size,4);
 ihdr[8]=8;ihdr[9]=6;
 const rows=Buffer.alloc(size*(1+size*4));
 for(let y=0;y<size;y++){
  const off=y*(1+size*4);
  for(let x=0;x<size;x++){
   rows[off+1+x*4]=red;rows[off+2+x*4]=86;
   rows[off+3+x*4]=134;rows[off+4+x*4]=255;
  }
 }
 return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),
  pngChunk('IHDR',ihdr),pngChunk('IDAT',deflateSync(rows)),
  pngChunk('IEND',Buffer.alloc(0))]).toString('base64');
}
describe.skipIf(!enabled)('T4A actual PostgreSQL offline creative iteration and independent approval',()=>{
 it('versions one existing asset, preserves old raster, invalidates prior approval, verifies replay and cross-tenant denial',async()=>{
  const db=new PrismaClient(),org='t4a-'+randomUUID(),
   other='t4a-foreign-'+randomUUID(),brandId=randomUUID(),
   creator='t4a-author-'+randomUUID(),reviewer='t4a-reviewer-'+randomUUID();
  const copy1='Evidence-led research campaign with human approval and no unsupported clinical claims.';
  const copy2='Updated scientific campaign copy with source review, new layout and refreshed approval requirements.';
  const future=later(65);
  try{
   await db.$connect();
   await db.organization.createMany({data:[
    {id:org,name:'Versioned offline creative tenant'},
    {id:other,name:'Tenant forbidden from reading creative'}]});
   await db.user.createMany({data:[
    {id:creator,organizationId:org,email:creator+'@example.invalid',
     role:'MARKETING_MANAGER',name:'Creative author'},
    {id:reviewer,organizationId:org,email:reviewer+'@example.invalid',
     role:'ADMIN',name:'Independent creative reviewer'}]});
   await withMarketingTenant(db,org,tx=>tx.brand.create({data:{
    id:brandId,organizationId:org,slug:'offline-draft',
    name:'Offline draft research brand',createdBy:creator}}));
   await db.brandMasterRevision.create({data:{
    id:randomUUID(),organizationId:org,version:1,status:'APPROVED',
    sourceReference:'internal:reviewed-test-brand-master',
    rules:{voice:'Factual',primaryColor:'#164c7c',
     prohibitedClaims:[],requiredDisclaimers:[]},
    proposedBy:creator,approvedBy:reviewer,approvedAt:new Date()
   }});
   const creative=new CreativeAssetService(db as any);
   const approvals=new ApprovalService(db as any,{
    completeAfterApproval:async()=>{},blockAfterApprovalRejection:async()=>{}
   } as any);
   const first=await creative.createOfflineRasterDraft(org,creator,{
    brandId,title:'Versioned scientific design',editableCopy:copy1,
    pngBase64:png64(),rightsExpiresAt:future,requestKey:randomUUID()
   });
   expect(first).toMatchObject({version:1,replayed:false,
    offlineOnly:true,layeredEditableImage:false});
   const initialPreview=await creative.offlinePreview(org,first.revisionId);
   expect(initialPreview).toMatchObject({version:1,current:true,
    editableCopy:copy1,assetId:first.assetId});
   await creative.reviewRights(org,reviewer,first.revisionId,
    'Reviewed author and usage scope for the synthetic raster');
   const exact=await creative.submitForApproval(org,creator,first.revisionId,{
    channel:'SOCIAL',destinationRef:'internal:connected-destination/inert',
    audienceRef:'internal:audience-snapshot/closed',
    policyVersion:'v1',scheduledAt:later(7),expiresAt:later(9)
   });
   await approvals.approve({organizationId:org,approvalId:exact.approvalId,
    approverUserId:reviewer,decision:'APPROVED',
    commandId:randomUUID(),correlationId:randomUUID(),
    rationale:'Reviewed immutable approved creative source and destination scope'});
   expect(await creative.reviewApprovalState(org,exact.approvalId)).toMatchObject({
    scopeCurrent:true,humanDecisionValid:true,externallyExecutable:false});
   const secondPayload={expectedVersion:1,editableCopy:copy2,pngBase64:png64(91),
    rightsExpiresAt:future,requestKey:randomUUID()};
   const second=await creative.reviseOfflineRasterDraft(org,creator,
    first.assetId,secondPayload);
   expect(second).toMatchObject({assetId:first.assetId,version:2,
    replayed:false,offlineOnly:true,verifiedMediaRights:false,
    layeredEditableImage:false,externalEffectsAuthorized:false});
   expect(second.revisionId).not.toBe(first.revisionId);
   expect(second.renditionDigest).not.toBe(first.renditionDigest);
   const replay=await creative.reviseOfflineRasterDraft(org,creator,
    first.assetId,secondPayload);
   expect(replay).toMatchObject({replayed:true,revisionId:second.revisionId,version:2});
   await expect(creative.reviseOfflineRasterDraft(org,creator,first.assetId,{
    ...secondPayload,editableCopy:'Tampered with immutable replay key'
   })).rejects.toThrow('idempotency key reused');
   await expect(creative.reviseOfflineRasterDraft(org,creator,first.assetId,{
    ...secondPayload,requestKey:randomUUID()
   })).rejects.toThrow('Creative was revised');
   await expect(creative.reviseOfflineRasterDraft(other,creator,first.assetId,{
    ...secondPayload,requestKey:randomUUID(),expectedVersion:2
   })).rejects.toThrow('not found in tenant');
   const old=await creative.offlinePreview(org,first.revisionId);
   const now=await creative.offlinePreview(org,second.revisionId);
   expect(old).toMatchObject({current:false,version:1,editableCopy:copy1});
   expect(now).toMatchObject({current:true,version:2,editableCopy:copy2});
   expect(old.renditionDigest).not.toBe(now.renditionDigest);
   expect((await creative.detail(org,first.assetId)).revisions).toMatchObject([
    {id:second.revisionId,version:2,offlinePreviewAvailable:true,rightsReviewedAt:null},
    {id:first.revisionId,version:1,offlinePreviewAvailable:true}
   ]);
   expect((await creative.list(org)).filter(x=>x.id===first.assetId))
    .toMatchObject([{version:2,status:'ACTIVE'}]);
   expect(await creative.reviewApprovalState(org,exact.approvalId)).toMatchObject({
    scopeCurrent:false,humanDecisionValid:false,externallyExecutable:false});
   await expect(creative.submitForApproval(org,creator,second.revisionId,{
    channel:'SOCIAL',destinationRef:'internal:connected-destination/inert',
    audienceRef:'internal:audience-snapshot/closed',
    policyVersion:'v1',scheduledAt:later(7),expiresAt:later(9)
   })).rejects.toThrow('Reviewed rights');
   await expect(creative.reviewRights(org,creator,second.revisionId,
    'Original author must not self-approve the revised source'))
    .rejects.toThrow('Qualified independent reviewer');
   const audits=await db.auditEvent.findMany({where:{organizationId:org,
    action:'OFFLINE_RASTER_CREATIVE_REVISION_CREATED'}});
   expect(audits).toHaveLength(1);
   expect((audits[0]?.after as {previousApprovalsAreStale:boolean})
    .previousApprovalsAreStale).toBe(true);
   expect(await creative.list(other)).toHaveLength(0);
   await expect(creative.offlinePreview(other,second.revisionId))
    .rejects.toThrow('not found in tenant');
   const layer=await creative.appendOfflineLayeredDraft(org,creator,first.assetId,{parentRevisionId:second.revisionId,expectedVersion:2,
    requestKey:randomUUID(),rightsExpiresAt:future,spec:{format:'SQUARE',title:'Scientific draft',body:'Internal review only',accent:'#164c7c'}}) as {revisionId:string};
   const layerPreview=await creative.offlineLayeredPreview(org,layer.revisionId);
   expect(layerPreview.quality).toMatchObject({status:'NO_LITERAL_FINDINGS',policyVersion:1,policyScope:'TENANT_MASTER_ONLY',
    sourceDigest:layerPreview.sourceDigest,renditionDigest:layerPreview.renditionDigest,releaseAuthorized:false,externalEffectsAuthorized:false});
   await expect(creative.offlineLayeredPreview(other,layer.revisionId)).rejects.toThrow('not found');
   const payload={expectedVersion:3,layeredParentRevisionId:layer.revisionId,layeredSourceDigest:layerPreview.sourceDigest,editableCopy:'Scientific draft\nInternal review only',pngBase64:png64(55,1080),requestKey:randomUUID(),rightsExpiresAt:future};
   await expect(creative.reviseOfflineRasterDraft(org,creator,first.assetId,{...payload,layeredSourceDigest:'sha256:'+'0'.repeat(64)})).rejects.toThrow('Current exact layered parent');
   await expect(creative.reviseOfflineRasterDraft(org,creator,first.assetId,{...payload,pngBase64:png64()})).rejects.toThrow('dimensions');
   const candidate=await creative.reviseOfflineRasterDraft(org,creator,first.assetId,payload);
   expect(candidate).toMatchObject({version:4,offlineRenditionParentRevisionId:layer.revisionId,visualFidelityVerified:false});
   const attestation={parentRevisionId:layer.revisionId,sourceDigest:layerPreview.sourceDigest,renditionDigest:candidate.renditionDigest,visuallyCompared:true};
   await expect(creative.reviewRights(org,reviewer,candidate.revisionId,'Review the exact offline rendition',attestation)).rejects.toThrow('readback required');
   const media=new VerifiedMediaEvidenceService(db as any);await media.verifyOfflineRaster(org,candidate.revisionId);
   await expect(creative.reviewRights(org,reviewer,candidate.revisionId,'Review the exact offline rendition')).rejects.toThrow('comparison');
   await creative.reviewRights(org,reviewer,candidate.revisionId,'Fixture only: independent comparison attestation',attestation);
   const next=await creative.submitForApproval(org,creator,candidate.revisionId,{channel:'SOCIAL',destinationRef:'internal:connected-destination/inert',audienceRef:'internal:audience-snapshot/closed',policyVersion:'v1',scheduledAt:later(7),expiresAt:later(9)});
   await approvals.approve({organizationId:org,approvalId:next.approvalId,approverUserId:reviewer,decision:'APPROVED',commandId:randomUUID(),correlationId:randomUUID(),rationale:'Fixture offline rendition decision'});
   expect(await creative.reviewApprovalState(org,next.approvalId)).toMatchObject({humanDecisionValid:true,externallyExecutable:false});
   const motion=await creative.appendOfflineLayeredDraft(org,creator,first.assetId,{parentRevisionId:candidate.revisionId,expectedVersion:4,requestKey:randomUUID(),rightsExpiresAt:future,spec:{format:'SQUARE',title:'Research story',body:'Internal motion only',accent:'#164c7c',motion:{openingSeconds:3,scenes:[{title:'Second scene',body:'Internal follow-up',seconds:4}]}}}) as {revisionId:string};
   const preview=await creative.offlineLayeredPreview(org,motion.revisionId);
   expect(preview).toMatchObject({version:5,motionOnly:true,motionDurationSeconds:7,videoEncodingVerified:false,releaseAuthorized:false,externalEffectsAuthorized:false});
   expect(preview.motionFrames?.map(f=>f.seconds)).toEqual([3,4]);
   const motionComparison={motionReviewed:true,sourceDigest:preview.sourceDigest,renditionDigest:preview.renditionDigest,frameDigests:preview.motionFrames?.map(f=>f.digest)};
   await expect(creative.reviewRights(org,reviewer,motion.revisionId,'Review exact timed storyboard')).rejects.toThrow('exact motion scene');
   await expect(creative.reviewRights(org,reviewer,motion.revisionId,'Review exact timed storyboard',{...motionComparison,frameDigests:[]})).rejects.toThrow('exact motion scene');
   await creative.reviewRights(org,reviewer,motion.revisionId,'Independently compared timed motion scenes',motionComparison);
   await expect(creative.submitForApproval(org,creator,motion.revisionId,{channel:'SOCIAL',destinationRef:'internal:connected-destination/inert',audienceRef:'internal:audience-snapshot/closed',policyVersion:'v1',scheduledAt:later(7),expiresAt:later(9)})).rejects.toThrow('no publication approval');
   expect(await creative.reviewApprovalState(org,next.approvalId)).toMatchObject({scopeCurrent:false,humanDecisionValid:false});
   await expect(creative.reviseOfflineRasterDraft(org,creator,first.assetId,{expectedVersion:5,layeredParentRevisionId:motion.revisionId,layeredSourceDigest:preview.sourceDigest,editableCopy:'Research story\nInternal motion only',pngBase64:png64(55,1080),requestKey:randomUUID(),rightsExpiresAt:future})).rejects.toThrow('Motion storyboard');
   await expect(creative.offlineLayeredPreview(other,motion.revisionId)).rejects.toThrow('not found');
   // Container-header fixture only; deliberately not a decoded video.
   const webm=Buffer.concat([Buffer.from('1a45dfa38b428681014282847765626d18538067','hex'),Buffer.alloc(120,1)]).toString('base64');
   const input={expectedVersion:5,parentRevisionId:motion.revisionId,sourceDigest:preview.sourceDigest,videoBase64:webm,requestKey:randomUUID(),rightsExpiresAt:future};
   const video=await creative.saveOfflineMotionVideo(org,creator,first.assetId,input) as {revisionId:string;renditionDigest:string;version:number};
   expect(video).toMatchObject({version:6,videoEncodingVerified:false,releaseAuthorized:false});
   expect(await creative.saveOfflineMotionVideo(org,creator,first.assetId,input)).toMatchObject({revisionId:video.revisionId,replayed:true});
   await expect(creative.saveOfflineMotionVideo(org,creator,first.assetId,{...input,requestKey:randomUUID(),videoBase64:png64()})).rejects.toThrow('WebM');
   expect(await creative.offlineMotionVideoPreview(org,video.revisionId)).toMatchObject({current:true,videoEncodingVerified:false,renditionDigest:video.renditionDigest});
   await expect(creative.offlineMotionVideoPreview(other,video.revisionId)).rejects.toThrow('not found');
   const videoAttestation={motionVideoReviewed:true,parentRevisionId:motion.revisionId,sourceDigest:preview.sourceDigest,renditionDigest:video.renditionDigest,frameDigests:preview.motionFrames?.map(f=>f.digest)};
   await expect(creative.reviewRights(org,reviewer,video.revisionId,'Compare exact video fixture',videoAttestation)).rejects.toThrow('byte readback');
   await media.verifyOfflineMotionVideo(org,video.revisionId);
   expect(await media.get(org,video.revisionId)).toMatchObject({detectedMime:'video/webm',evidenceOrigin:'OFFLINE_DB_VIDEO',remotePlatformMediaEligible:false,independentlyDecoded:false});
   await creative.reviewRights(org,reviewer,video.revisionId,'Fixture attestation; actual decoding not asserted',videoAttestation);
   await expect(creative.submitForApproval(org,creator,video.revisionId,{channel:'SOCIAL',destinationRef:'internal:connected-destination/inert',audienceRef:'internal:audience-snapshot/closed',policyVersion:'v1',scheduledAt:later(7),expiresAt:later(9)})).rejects.toThrow('cannot authorize publication');
  }finally{await db.$disconnect();}
 },90000);
});
