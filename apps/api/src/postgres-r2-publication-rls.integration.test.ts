import {describe,expect,it} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {randomUUID} from 'node:crypto';

const enabled=process.env.MARKETING_DB_INTEGRATION==='1';
describe.skipIf(!enabled)('R2 PostgreSQL publication/attempt FORCE RLS isolation',()=>{
 it('T01-006 requires transaction-local tenant scope and never leaks between pooled reads',async()=>{
  const db=new PrismaClient();
  const org='r2rls-org-'+randomUUID(),foreign='r2rls-foreign-'+randomUUID();
  const brandId=randomUUID(),campaignId=randomUUID(),assetId=randomUUID(),
   revisionId=randomUUID(),approvalId=randomUUID(),publicationId=randomUUID();
  const role='r2_pub_probe_'+randomUUID().replaceAll('-','').slice(0,18);
  let created=false;
  try{
   await db.$connect();
   await db.organization.createMany({data:[{id:org,name:'R2 RLS tenant'},
    {id:foreign,name:'R2 foreign tenant'}]});
   await db.brand.create({data:{id:brandId,organizationId:org,slug:'rls-r2',
    name:'R2 brand',createdBy:'setup-admin'}});
   const objective=await db.marketingObjective.create({data:{organizationId:org,
    name:'RLS integration objective',description:'Isolate staging dispatch metadata'}});
   await db.campaign.create({data:{id:campaignId,organizationId:org,
    code:'R2RLS-'+randomUUID().slice(0,8),name:'Scope test',objectiveId:objective.id,
    brandId,status:'APPROVED',riskLevel:'R2'}});
   await db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${org}, true)`;
    await tx.creativeAsset.create({data:{id:assetId,organizationId:org,
     brandId,title:'RLS media',createdBy:'setup-admin'}});
    await tx.creativeAssetRevision.create({data:{id:revisionId,organizationId:org,
     assetId,version:1,sourceKind:'FLATTENED_EXPORT',
     sourceRef:'internal:creative-source/test',
     renditionDigest:'sha256:'+'a'.repeat(64),
     rightsExpiresAt:new Date(Date.now()+60*86400_000),createdBy:'setup-admin'}});
    await tx.approval.create({data:{id:approvalId,organizationId:org,
     objectType:'CreativeAssetRevision',objectId:revisionId,creativeAssetRevisionId:revisionId,
     requestedBy:'setup-admin',requiredAuthority:'HUMAN_CREATIVE_RELEASE',
     scopeDigest:'sha256:'+'b'.repeat(64),scope:{testFixture:true},
     scopeExpiresAt:new Date(Date.now()+30*86400_000),riskLevel:'R2'}});
    await tx.campaignPublication.create({data:{id:publicationId,organizationId:org,
     campaignId,creativeAssetRevisionId:revisionId,approvalId,
     scopeDigest:'sha256:'+'b'.repeat(64),requestKey:randomUUID(),createdBy:'setup-admin'}});
    await tx.publicationAttempt.create({data:{organizationId:org,publicationId,
     sequence:1,mode:'SANDBOX',outcome:'SIMULATED',
     evidenceRef:'internal:sandbox/'+randomUUID(),
     inputDigest:'sha256:'+'b'.repeat(64),recordedBy:'setup-admin'}});
   });
   await db.$executeRawUnsafe('CREATE ROLE "'+role+'" NOLOGIN');
   created=true;
   await db.$executeRawUnsafe('GRANT SELECT ON "CampaignPublication","PublicationAttempt" TO "'+role+'"');
   const observations=await db.$transaction(async tx=>{
    await tx.$executeRawUnsafe('SET LOCAL ROLE "'+role+'"');
    const count=async(table:'CampaignPublication'|'PublicationAttempt')=>{
     const rows=await tx.$queryRawUnsafe<Array<{n:bigint}>>(
      'SELECT count(*)::bigint AS n FROM "'+table+'"');
     return Number(rows[0]?.n);
    };
    const before=[await count('CampaignPublication'),await count('PublicationAttempt')];
    await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${org}, true)`;
    const own=[await count('CampaignPublication'),await count('PublicationAttempt')];
    await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${foreign}, true)`;
    const other=[await count('CampaignPublication'),await count('PublicationAttempt')];
    return{before,own,other};
   });
   expect(observations).toEqual({before:[0,0],own:[1,1],other:[0,0]});
   const pooled=await db.$transaction(async tx=>{
    await tx.$executeRawUnsafe('SET LOCAL ROLE "'+role+'"');
    const rows=await tx.$queryRawUnsafe<Array<{n:bigint}>>(
     'SELECT count(*)::bigint AS n FROM "CampaignPublication"');
    return Number(rows[0]?.n);
   });
   expect(pooled).toBe(0);
   await expect(db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${org}, true)`;
    return tx.campaignPublication.update({where:{id:publicationId},
     data:{scopeDigest:'sha256:'+'c'.repeat(64)}});
   })).rejects.toThrow();
  }finally{
   if(created){
    await db.$executeRawUnsafe('REVOKE SELECT ON "CampaignPublication","PublicationAttempt" FROM "'+role+'"');
    await db.$executeRawUnsafe('DROP ROLE IF EXISTS "'+role+'"');
   }
   await db.$disconnect();
  }
 },60000);
});
