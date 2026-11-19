import {describe,expect,it} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {CreativeAssetService} from './creative-asset.service.js';
import {ApprovalService} from './approval.service.js';
const enabled=process.env.MARKETING_DB_INTEGRATION==='1';
const plusDays=(n:number)=>new Date(Date.now()+n*86400_000).toISOString();
const mediaHash='sha256:'+'b'.repeat(64);
describe.skipIf(!enabled)('R1C real PostgreSQL asset/approval tenant authority',()=>{
 it('T03-022 keeps immutable revisions, independent rights, exact approvals, stale invalidation and audit together',async()=>{
  const db=new PrismaClient();
  const org='dam-org-'+randomUUID(),foreign='dam-foreign-'+randomUUID();
  const creator='dam-author-'+randomUUID(),reviewer='dam-reviewer-'+randomUUID();
  const third='dam-third-'+randomUUID(),brandId=randomUUID();
  try{
   await db.$connect();
   await db.organization.createMany({data:[{id:org,name:'DAM tenant'},{id:foreign,name:'Foreign tenant'}]});
   await db.user.createMany({data:[
    {id:creator,organizationId:org,email:creator+'@example.invalid',name:'Creator',role:'MARKETING_MANAGER'},
    {id:reviewer,organizationId:org,email:reviewer+'@example.invalid',name:'Reviewer',role:'ADMIN'},
    {id:third,organizationId:org,email:third+'@example.invalid',name:'Final Reviewer',role:'CMO'}
   ]});
   await db.brand.create({data:{id:brandId,organizationId:org,slug:'creative',name:'Creative Brand',createdBy:creator}});
   await db.brandMasterRevision.create({data:{id:randomUUID(),organizationId:org,version:1,
    status:'APPROVED',sourceReference:'internal:brand-proof',
    rules:{voice:'Verified',primaryColor:'#004488',prohibitedClaims:[],requiredDisclaimers:[]},
    proposedBy:creator,approvedBy:reviewer,approvedAt:new Date()}});
   const assets=new CreativeAssetService(db as any);
   const approvals=new ApprovalService(db as any,{completeAfterApproval:async()=>{},
    blockAfterApprovalRejection:async()=>{}} as any);
   const asset=await assets.create(org,creator,{brandId,title:'Genomic campaign asset'});
   expect(asset).toMatchObject({status:'ACTIVE',version:0,externalEffectsAuthorized:false});
   expect(await assets.list(foreign)).toHaveLength(0);
   await expect(assets.detail(foreign,asset.id)).rejects.toThrow('not found');
   await expect(assets.create(foreign,creator,{brandId,title:'Foreign asset'}))
    .rejects.toThrow('brand not found');
   const rev=await assets.addRevision(org,creator,asset.id,{
    sourceKind:'EDITABLE_SOURCE',sourceRef:'internal:creative-source/ref1',
    renditionDigest:mediaHash,rightsExpiresAt:plusDays(60),expectedVersion:0
   });
   expect(rev).toMatchObject({version:1,rightsVerified:false});
   const request={channel:'SOCIAL',destinationRef:'internal:connected-destination/account-a',
    audienceRef:'internal:audience-snapshot/audience-a',policyVersion:'v1',
    scheduledAt:plusDays(7),expiresAt:plusDays(9)};
   await expect(assets.submitForApproval(org,creator,rev.revisionId,request))
    .rejects.toThrow('Reviewed rights');
   await expect(assets.reviewRights(org,creator,rev.revisionId,'This source has authorized usage'))
    .rejects.toThrow('Qualified independent reviewer required');
   expect(await assets.reviewRights(org,reviewer,rev.revisionId,
    'Verified author rights and usage conditions')).toMatchObject({rightsReviewed:true});
   expect(await assets.reviewRights(org,reviewer,rev.revisionId,
    'Verified author rights and usage conditions')).toMatchObject({alreadyReviewed:true});
   await expect(assets.submitForApproval(org,creator,rev.revisionId,{
    ...request,expiresAt:plusDays(5)
   })).rejects.toThrow('Approval expiry must extend');
   const submitted=await assets.submitForApproval(org,creator,rev.revisionId,request);
   expect(submitted).toMatchObject({replay:false,externalEffectsAuthorized:false});
   expect((await assets.submitForApproval(org,creator,rev.revisionId,request)).replay).toBe(true);
   await expect(assets.submitForApproval(org,creator,rev.revisionId,{
    ...request,audienceRef:'internal:audience-snapshot/other'
   })).rejects.toThrow('different pending');
   const decision=(approverUserId:string,approvalId=submitted.approvalId)=>({
    organizationId:org,approvalId,approverUserId,decision:'APPROVED' as const,
    commandId:randomUUID(),correlationId:randomUUID(),rationale:'Reviewed complete immutable creative scope'
   });
   await expect(approvals.approve(decision(creator))).rejects.toThrow('approval role');
   await expect(approvals.approve(decision(reviewer))).resolves.toMatchObject({
    decision:'APPROVED',approvalId:submitted.approvalId});
   expect(await assets.reviewApprovalState(org,submitted.approvalId)).toMatchObject({
    decision:'APPROVED',scopeCurrent:true,humanDecisionValid:true,externallyExecutable:false});
   await expect(assets.reviewApprovalState(foreign,submitted.approvalId))
    .rejects.toThrow('not found');
   // A new version invalidates an earlier approved immutable scope.
   const newer=await assets.addRevision(org,reviewer,asset.id,{
    sourceKind:'FLATTENED_EXPORT',sourceRef:'internal:creative-source/ref2',
    renditionDigest:'sha256:'+'c'.repeat(64),rightsExpiresAt:plusDays(60),expectedVersion:1
   });
   expect(newer.version).toBe(2);
   // Separate check: a privileged original asset owner cannot review rights
   // simply because another employee appended its latest revision.
   const owned=await assets.create(org,reviewer,{
    brandId,title:'Admin-authored creative original'});
   const delegated=await assets.addRevision(org,creator,owned.id,{
    sourceKind:'FLATTENED_EXPORT',sourceRef:'internal:creative-source/delegated',
    renditionDigest:'sha256:'+'e'.repeat(64),rightsExpiresAt:plusDays(60),expectedVersion:0
   });
   await expect(assets.reviewRights(org,reviewer,delegated.revisionId,
    'Original creative owner cannot self-review rights')).rejects.toThrow('creator cannot review');
   // A privileged ADMIN who actually authored this revision is still
   // prohibited from reviewing its own media rights.
   await expect(assets.reviewRights(org,reviewer,newer.revisionId,
    'Own revision cannot be independently reviewed')).rejects.toThrow('creator cannot review');
   expect(await assets.reviewApprovalState(org,submitted.approvalId)).toMatchObject({
    scopeCurrent:false,humanDecisionValid:false,externallyExecutable:false});
   // SQL-level trigger rejects accidental mutation of already-created content.
   await expect(db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${org}, true)`;
    return tx.creativeAssetRevision.update({where:{id:rev.revisionId},data:{
     renditionDigest:'sha256:'+'d'.repeat(64)}});
   })).rejects.toThrow();
   expect(await db.auditEvent.count({where:{organizationId:org,
    action:{in:['CREATIVE_ASSET_CREATED','CREATIVE_ASSET_REVISION_CREATED',
     'CREATIVE_RIGHTS_REVIEWED','CREATIVE_APPROVAL_REQUESTED','CREATIVE_SCOPE_DECIDED']}}})).toBe(8);
  }finally{
   // CI uses a throwaway PostgreSQL service. Immutable RLS metadata has no
   // application delete capability, so do not bypass RLS to erase fixtures.
   await db.$disconnect();
  }
 },60000);
 it('T11-001 FORCE RLS denies unscoped and cross-tenant asset observations and does not leak through pool reuse',async()=>{
  const db=new PrismaClient(),org='dam-rls-'+randomUUID();
  const brandId=randomUUID();
  const role='dam_reader_'+randomUUID().replaceAll('-','').slice(0,18);
  let created=false;
  try{
   await db.$connect();
   await db.organization.create({data:{id:org,name:'RLS DAM tenant'}});
   await db.brand.create({data:{id:brandId,organizationId:org,
    slug:'rls-brand',name:'RLS Brand',createdBy:'setup-admin'}});
   const asset=await new CreativeAssetService(db as any).create(org,'setup-admin',
    {brandId,title:'Tenant sample'});
   await db.$executeRawUnsafe('CREATE ROLE "'+role+'" NOLOGIN');
   created=true;
   await db.$executeRawUnsafe('GRANT SELECT ON "CreativeAsset" TO "'+role+'"');
   const observed=await db.$transaction(async tx=>{
    await tx.$executeRawUnsafe('SET LOCAL ROLE "'+role+'"');
    const empty=await tx.$queryRawUnsafe<Array<{n:bigint}>>(
     'SELECT count(*)::bigint AS n FROM "CreativeAsset"');
    await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${org}, true)`;
    const authorized=await tx.$queryRawUnsafe<Array<{id:string}>>(
     'SELECT id FROM "CreativeAsset"');
    await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${'other-tenant'}, true)`;
    const foreign=await tx.$queryRawUnsafe<Array<{n:bigint}>>(
     'SELECT count(*)::bigint AS n FROM "CreativeAsset"');
    return{empty:Number(empty[0]?.n),authorized,foreign:Number(foreign[0]?.n)};
   });
   expect(observed).toEqual({empty:0,authorized:[{id:asset.id}],foreign:0});
   const next=await db.$transaction(async tx=>{
    await tx.$executeRawUnsafe('SET LOCAL ROLE "'+role+'"');
    return tx.$queryRawUnsafe<Array<{n:bigint}>>(
     'SELECT count(*)::bigint AS n FROM "CreativeAsset"');
   });
   expect(Number(next[0]?.n)).toBe(0);
  }finally{
   if(created){
    await db.$executeRawUnsafe('REVOKE SELECT ON "CreativeAsset" FROM "'+role+'"');
    await db.$executeRawUnsafe('DROP ROLE IF EXISTS "'+role+'"');
   }
   await db.$disconnect();
  }
 },60000);
});
