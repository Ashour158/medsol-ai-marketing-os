import {describe,expect,it} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {randomUUID,createHash} from 'node:crypto';
import {PlatformIntegrationHubService,PLATFORM_CATALOG} from './platform-integration-hub.service.js';
import {VerifiedMediaEvidenceService,type VersionedMediaReader} from './verified-media-evidence.service.js';
import {permissionForMarketingRoute,hasMarketingPermission} from './marketing-permissions.js';

const dbEnabled=process.env.MARKETING_DB_INTEGRATION==='1';
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/0pUAAAAASUVORK5CYII=','base64');
const sha=(b:Uint8Array)=>'sha256:'+createHash('sha256').update(b).digest('hex');
describe('R2B provider registry is only a declared, capability-denied catalogue',()=>{
 it('does not claim implemented OAuth, live platform credentials or verified scopes',()=>{
  expect(PLATFORM_CATALOG.map(p=>p.key)).toContain('LINKEDIN');
  for(const p of PLATFORM_CATALOG){
   expect(p.connectionLive).toBe(false);
   expect(p.verifiedCapabilities).toEqual([]);
  }
 });
 it('requires OIDC tenant admins for integration and evidence controls',()=>{
  expect(permissionForMarketingRoute('GET','/marketing/integrations/catalog')).toBe('READ_TENANCY');
  expect(permissionForMarketingRoute('POST','/marketing/integrations')).toBe('MANAGE_TENANT');
  expect(permissionForMarketingRoute('POST','/marketing/integrations/a/revoke')).toBe('MANAGE_TENANT');
  expect(permissionForMarketingRoute('GET','/marketing/media/evidence')).toBe('READ_TENANCY');
  expect(permissionForMarketingRoute('POST','/marketing/media/evidence/a/revoke')).toBe('MANAGE_TENANT');
  expect(hasMarketingPermission({role:'VIEWER'} as any,'READ_TENANCY')).toBe(false);
  expect(hasMarketingPermission({role:'MARKETING_DIRECTOR'} as any,'MANAGE_TENANT')).toBe(false);
  expect(hasMarketingPermission({role:'ADMIN'} as any,'MANAGE_TENANT')).toBe(true);
  expect(()=>permissionForMarketingRoute('POST','/marketing/media/evidence/a/verify'))
   .toThrow('not in the permission registry');
 });
});
describe.skipIf(!dbEnabled)('R2B real PostgreSQL connection, trusted media proof and revocation',()=>{
 it('validates media bytes from trusted reader, rejects forged metadata and locks revoked evidence',async()=>{
  const db=new PrismaClient();
  const org='r2b-org-'+randomUUID(),other='r2b-other-'+randomUUID();
  const brandId=randomUUID(),assetId=randomUUID(),revisionId=randomUUID();
  const hub=new PlatformIntegrationHubService(db as any);
  const media=new VerifiedMediaEvidenceService(db as any);
  try{
   await db.$connect();
   await db.organization.createMany({data:[{id:org,name:'R2B proof tenant'},
    {id:other,name:'R2B unrelated tenant'}]});
   await db.brand.create({data:{id:brandId,organizationId:org,slug:'r2b',
    name:'R2B Brand',createdBy:'admin-owner'}});
   await db.$transaction(async tx=>{
    await tx.$queryRawUnsafe("SELECT set_config('app.marketing_tenant_id', $1, true)",org);
    await tx.creativeAsset.create({data:{id:assetId,organizationId:org,
     brandId,title:'Proof asset',createdBy:'admin-owner',version:1}});
    await tx.creativeAssetRevision.create({data:{id:revisionId,organizationId:org,
     assetId,version:1,sourceKind:'FLATTENED_EXPORT',
     sourceRef:'internal:creative-source/versioned-1',renditionDigest:sha(PNG),
     rightsExpiresAt:new Date(Date.now()+86400_000*60),createdBy:'author-1'}});
   });
   const declared=await hub.register(org,'admin-owner',{brandId,providerKey:'LINKEDIN',
    destinationLabel:'R2B sample destination'});
   expect(declared).toMatchObject({status:'PENDING_VERIFICATION',
    credentialsConnected:false,providerVerified:false,externalEffectsAuthorized:false});
   expect(declared.destinationRef).toMatch(/^internal:connected-destination\//);
   expect((await hub.list(other)).length).toBe(0);
   await expect(hub.get(other,declared.id)).rejects.toThrow('not found in tenant');
   await expect(hub.register(other,'other-owner',{brandId,providerKey:'LINKEDIN',
    destinationLabel:'Cross-tenant destination'})).rejects.toThrow('brand not found');
   await expect(hub.register(org,'admin-owner',{brandId,providerKey:'LINKEDIN',
    destinationLabel:'Unsafe',accessToken:'redacted'})).rejects.toThrow('Never submit credentials');
   await expect(hub.register(org,'admin-owner',{brandId,providerKey:'FAKE_PROVIDER',
    destinationLabel:'Unsupported'})).rejects.toThrow('Unsupported provider');
   await expect(hub.register(org,'admin-owner',{brandId,providerKey:'LINKEDIN',
    destinationLabel:'R2B sample destination'})).rejects.toThrow('already registered');
   const reader:VersionedMediaReader={readVersion:async(input)=>{
    expect(input).toEqual({organizationId:org,sourceRef:'internal:creative-source/versioned-1'});
    return{sourceRef:input.sourceRef,objectVersion:'immutable-v1',bytes:PNG};
   }};
   await expect(media.get(org,revisionId)).rejects.toThrow('not found');
   await expect(media.verifyReadback(other,'verifier',revisionId,reader))
    .rejects.toThrow('Creative revision not found');
   await expect(media.verifyReadback(org,'verifier',revisionId,{
    readVersion:async(input)=>({...await reader.readVersion(input),
     bytes:Buffer.from('not authentic media')})
   })).rejects.toThrow('Unsupported or unrecognized media signature');
   const corrupted=Buffer.from(PNG);
   corrupted[corrupted.length-2]=corrupted[corrupted.length-2]!^1;
   await expect(media.verifyReadback(org,'verifier',revisionId,{
    readVersion:async(input)=>({...await reader.readVersion(input),bytes:corrupted})
   })).rejects.toThrow('Readback SHA-256 differs');
   const accepted=await media.verifyReadback(org,'verifier',revisionId,reader);
   expect(accepted).toMatchObject({status:'VERIFIED_READBACK',replayed:false,
    sha256Digest:sha(PNG),externalEffectsAuthorized:false});
   expect(await media.verifyReadback(org,'verifier',revisionId,reader))
    .toMatchObject({replayed:true,evidenceId:accepted.evidenceId});
   expect(await media.get(org,revisionId)).toMatchObject({
    status:'VERIFIED_READBACK',detectedMime:'image/png',independentlyDecoded:false,
    remotePlatformMediaEligible:false,externalEffectsAuthorized:false});
   await expect(media.get(other,revisionId)).rejects.toThrow('not found in tenant');
   await expect(media.verifyReadback(org,'verifier',revisionId,{
    readVersion:async(input)=>({...await reader.readVersion(input),objectVersion:'immutable-v2'})
   })).rejects.toThrow('original immutable object version');
   const revoked=await media.revoke(org,'admin-owner',revisionId,
    'Object storage version revoked after compliance review');
   expect(revoked).toMatchObject({status:'REVOKED',replayed:false});
   expect(await media.revoke(org,'admin-owner',revisionId,
    'Object storage version revoked after compliance review')).toMatchObject({replayed:true});
   await expect(media.verifyReadback(org,'verifier',revisionId,reader))
    .rejects.toThrow('Media evidence differs');
   const suspended=await hub.change(org,'admin-owner',declared.id,
    declared.version,'SUSPEND','Provider verification not completed');
   expect(suspended.status).toBe('SUSPENDED');
   const stale=await hub.get(org,declared.id);
   expect(stale).toMatchObject({status:'SUSPENDED',version:2,externalEffectsAuthorized:false});
   await expect(hub.change(org,'admin-owner',declared.id,1,'REVOKE',
    'Client requested external destination withdrawal')).rejects.toThrow('Stale connection');
   expect(await hub.change(org,'admin-owner',declared.id,2,'REVOKE',
    'Client requested external destination withdrawal')).toMatchObject({status:'REVOKED'});
   expect(await hub.change(org,'admin-owner',declared.id,3,'REVOKE',
    'Client requested external destination withdrawal')).toMatchObject({replayed:true});
   // Even direct SQL with tenant context cannot mark account active or mutate attested bytes.
   await expect(db.$transaction(async tx=>{
    await tx.$queryRawUnsafe("SELECT set_config('app.marketing_tenant_id', $1, true)",org);
    return tx.integrationConnection.update({where:{id:declared.id},data:{status:'ACTIVE'}});
   })).rejects.toThrow();
   await expect(db.$transaction(async tx=>{
    await tx.$queryRawUnsafe("SELECT set_config('app.marketing_tenant_id', $1, true)",org);
    return tx.verifiedMediaEvidence.update({where:{id:accepted.evidenceId},
     data:{sha256Digest:'sha256:'+'f'.repeat(64)}});
   })).rejects.toThrow();
   expect(await db.auditEvent.count({where:{organizationId:org,
    action:{in:['MEDIA_BYTES_READBACK_VERIFIED','MEDIA_EVIDENCE_REVOKED',
     'INTEGRATION_DESTINATION_REGISTERED','INTEGRATION_CONNECTION_SUSPENDED',
     'INTEGRATION_CONNECTION_REVOKED']}}})).toBe(5);
  }finally{await db.$disconnect();}
 },90000);
 it('FORCE RLS hides connection and proof data without tenant context and across tenants',async()=>{
  const db=new PrismaClient(),org='r2b-rls-'+randomUUID(),brandId=randomUUID();
  const role='r2b_reader_'+randomUUID().replaceAll('-','').slice(0,17);
  let roleCreated=false;
  try{
   await db.$connect();
   await db.organization.create({data:{id:org,name:'R2B RLS tenant'}});
   await db.brand.create({data:{id:brandId,organizationId:org,slug:'r2b-rls',
    name:'R2B RLS Brand',createdBy:'creator'}});
   await new PlatformIntegrationHubService(db as any).register(org,'creator',{
    brandId,providerKey:'META_GRAPH',destinationLabel:'RLS registered destination'});
   await db.$executeRawUnsafe('CREATE ROLE "'+role+'" NOLOGIN');roleCreated=true;
   await db.$executeRawUnsafe(
    'GRANT SELECT ON "IntegrationConnection","VerifiedMediaEvidence" TO "'+role+'"');
   const result=await db.$transaction(async tx=>{
    await tx.$executeRawUnsafe('SET LOCAL ROLE "'+role+'"');
    const count=async()=>{
     const rows=await tx.$queryRawUnsafe<Array<{n:bigint}>>(
      'SELECT count(*)::bigint AS n FROM "IntegrationConnection"');
     return Number(rows[0]?.n);
    };
    const noScope=await count();
    await tx.$queryRawUnsafe("SELECT set_config('app.marketing_tenant_id', $1, true)",org);
    const own=await count();
    await tx.$queryRawUnsafe("SELECT set_config('app.marketing_tenant_id', $1, true)",'other-tenant');
    const other=await count();
    return{noScope,own,other};
   });
   expect(result).toEqual({noScope:0,own:1,other:0});
   const next=await db.$transaction(async tx=>{
    await tx.$executeRawUnsafe('SET LOCAL ROLE "'+role+'"');
    const rows=await tx.$queryRawUnsafe<Array<{n:bigint}>>(
     'SELECT count(*)::bigint AS n FROM "IntegrationConnection"');
    return Number(rows[0]?.n);
   });
   expect(next).toBe(0);
  }finally{
   if(roleCreated){
    await db.$executeRawUnsafe('REVOKE SELECT ON "IntegrationConnection","VerifiedMediaEvidence" FROM "'+role+'"');
    await db.$executeRawUnsafe('DROP ROLE IF EXISTS "'+role+'"');
   }
   await db.$disconnect();
  }
 },60000);
});
