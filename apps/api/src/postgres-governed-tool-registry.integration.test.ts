import {describe,expect,it} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {generateKeyPairSync,randomUUID,sign} from 'node:crypto';
import {GovernedToolRegistryService} from './governed-tool-registry.service.js';
import {parseToolManifest,toolManifestDigest} from './governed-tool-manifest.js';
import {permissionForMarketingRoute} from './marketing-permissions.js';
const enabled=process.env.MARKETING_DB_INTEGRATION==='1';
describe('R3-E signed MCP/A2A registration with PostgreSQL tenant security',()=>{
 it.skipIf(!enabled)('enforces maker-checker, trusted signature, immutability, revocation, no-egress and FORCE RLS',async()=>{
  const db=new PrismaClient(),org='r3e-'+randomUUID(),
   other='r3e-other-'+randomUUID(),maker='r3e-maker-'+randomUUID(),
   reviewer='r3e-reviewer-'+randomUUID(),
   subjectA='oidc-maker-'+randomUUID(),subjectB='oidc-reviewer-'+randomUUID();
  const pair=generateKeyPairSync('ed25519');
  const oldKey=process.env.MARKETING_TOOL_REGISTRY_TRUSTED_PUBLIC_KEY_PEM;
  const oldId=process.env.MARKETING_TOOL_REGISTRY_TRUSTED_KEY_ID;
  process.env.MARKETING_TOOL_REGISTRY_TRUSTED_PUBLIC_KEY_PEM=
   pair.publicKey.export({type:'spki',format:'pem'}).toString();
  process.env.MARKETING_TOOL_REGISTRY_TRUSTED_KEY_ID='trusted-release-key';
  const manifest=parseToolManifest({kind:'MCP',serverKey:'science_read',
   name:'Scientific Research Reader',endpointOrigin:null,
   toolKeys:['search_citations'],declaredScopes:['read_internal'],
   trustTier:'T0',dataClass:'INTERNAL',supportsWrites:false,
   maxResponseBytes:20000,timeoutMs:1000});
  const signature=sign(null,Buffer.from('medsol-tool-manifest-signature-v1\n'+
   toolManifestDigest(manifest)),pair.privateKey).toString('base64url');
  const identity=(userId:string,subject:string,organizationId=org)=>({
   userId,organizationId,subject,role:'ADMIN',
   email:userId+'@example.invalid'
  });
  const actor=identity(maker,subjectA),checker=identity(reviewer,subjectB);
  try{
   await db.$connect();
   await db.organization.createMany({data:[
    {id:org,name:'R3E Primary'},{id:other,name:'R3E Foreign'}]});
   await db.user.createMany({data:[
    {id:maker,organizationId:org,email:actor.email,name:'Maker',
     role:'ADMIN',oidcSubject:subjectA},
    {id:reviewer,organizationId:org,email:checker.email,name:'Checker',
     role:'ADMIN',oidcSubject:subjectB}
   ]});
   const registry=new GovernedToolRegistryService(db as any);
   const draft=await registry.register(org,actor,{
    manifest,signature,signerKeyId:'trusted-release-key'
   });
   expect(draft).toMatchObject({status:'QUARANTINED',
    signatureTrusted:true,remoteExecutionAuthorized:false,replayed:false});
   const replay=await registry.register(org,actor,{
    manifest,signature,signerKeyId:'trusted-release-key'
   });
   expect(replay).toMatchObject({id:draft.id,replayed:true});
   await expect(registry.register(org,actor,{
    manifest:{...manifest,name:'Hijacked'},signature,
    signerKeyId:'trusted-release-key'
   })).rejects.toThrow('immutable manifest');
   await expect(registry.approve(org,actor,draft.id,1))
    .rejects.toThrow('Independent tool manifest reviewer');
   await expect(registry.approve(org,identity(reviewer,'forged'),draft.id,1))
    .rejects.toThrow('matching OIDC');
   const approved=await registry.approve(org,checker,draft.id,1);
   expect(approved).toMatchObject({status:'APPROVED',version:2,
    signatureTrusted:true,remoteExecutionAuthorized:false});
   const inspection=await registry.inspect(org,checker,draft.id,
    'search_citations','read_internal');
   expect(inspection).toMatchObject({approvedMetadata:true,
    declaredTool:true,declaredScope:true,remoteExecutionAuthorized:false,
    mcpCalls:0,a2aCalls:0,readyForNetwork:false});
   const missing=await registry.inspect(org,checker,draft.id,
    'write_prices','read_internal');
   expect(missing.declaredTool).toBe(false);
   expect(await registry.list(org,actor)).toHaveLength(1);
   await expect(registry.list(other,actor)).rejects.toThrow(/tenant/i);
   await expect(db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${org}, true)`;
    return tx.governedToolRegistration.update({
     where:{id:draft.id},data:{name:'Tampered',version:{increment:1}}
    });
   })).rejects.toThrow();
   await expect(db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${org}, true)`;
    return tx.governedToolRegistration.delete({where:{id:draft.id}});
   })).rejects.toThrow();
   const revoked=await registry.revoke(org,actor,draft.id,2,
    'Security incident requires permanent revocation');
   expect(revoked).toMatchObject({status:'REVOKED',version:3,
    remoteExecutionAuthorized:false});
   await expect(registry.approve(org,checker,draft.id,3))
    .rejects.toThrow('cannot reopen');
   const after=await registry.inspect(org,checker,draft.id,
    'search_citations','read_internal');
   expect(after).toMatchObject({approvedMetadata:false,
    remoteExecutionAuthorized:false,mcpCalls:0});
   expect(await db.auditEvent.count({where:{organizationId:org,
    objectType:'GovernedToolRegistration',objectId:draft.id}})).toBe(3);
   expect(await db.outboxEvent.count({where:{organizationId:org,
    aggregateType:'GovernedToolRegistration',aggregateId:draft.id}})).toBe(2);
   const role='r3e_probe_'+randomUUID().replaceAll('-','').slice(0,18);
   await db.$executeRawUnsafe('CREATE ROLE "'+role+'" NOLOGIN');
   try{
    await db.$executeRawUnsafe('GRANT SELECT ON "GovernedToolRegistration" TO "'+role+'"');
    const counts=await db.$transaction(async tx=>{
     await tx.$executeRawUnsafe('SET LOCAL ROLE "'+role+'"');
     const count=async()=>Number((await tx.$queryRaw<Array<{n:bigint}>>`
      SELECT count(*)::bigint AS n FROM "GovernedToolRegistration"`)[0]?.n);
     const before=await count();
     await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${org}, true)`;
     const own=await count();
     await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${other}, true)`;
     const foreign=await count();
     return{before,own,foreign};
    });
    expect(counts).toEqual({before:0,own:1,foreign:0});
   }finally{
    await db.$executeRawUnsafe('REVOKE SELECT ON "GovernedToolRegistration" FROM "'+role+'"');
    await db.$executeRawUnsafe('DROP ROLE "'+role+'"');
   }
  }finally{
   if(oldKey===undefined)delete process.env.MARKETING_TOOL_REGISTRY_TRUSTED_PUBLIC_KEY_PEM;
   else process.env.MARKETING_TOOL_REGISTRY_TRUSTED_PUBLIC_KEY_PEM=oldKey;
   if(oldId===undefined)delete process.env.MARKETING_TOOL_REGISTRY_TRUSTED_KEY_ID;
   else process.env.MARKETING_TOOL_REGISTRY_TRUSTED_KEY_ID=oldId;
   await db.$disconnect();
  }
 },90000);
 it('registers only metadata routes, never live tool dispatch',()=>{
  expect(permissionForMarketingRoute('GET','/marketing/tools/registrations'))
   .toBe('READ_TENANCY');
  expect(permissionForMarketingRoute('POST','/marketing/tools/registrations'))
   .toBe('MANAGE_TENANT');
  expect(permissionForMarketingRoute('POST','/marketing/tools/registrations/abc/approve'))
   .toBe('MANAGE_TENANT');
  expect(()=>permissionForMarketingRoute('POST','/marketing/tools/execute'))
   .toThrow('not in the permission registry');
 });
});
