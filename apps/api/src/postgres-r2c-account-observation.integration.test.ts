import {describe,expect,it} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {randomBytes,randomUUID} from 'node:crypto';
import {PlatformIntegrationHubService} from './platform-integration-hub.service.js';
import {IntegrationOAuthLifecycleService,type ApprovedOAuthProvider} from './integration-oauth-lifecycle.service.js';
import {ProviderSecretEnvelope} from './provider-secret-envelope.js';
import {ProviderAccountObservationService,type TrustedProviderAccountReader}
 from './provider-account-observation.service.js';

const enabled=process.env.MARKETING_DB_INTEGRATION==='1';
const cfg:ApprovedOAuthProvider={
 providerKey:'LINKEDIN',authorizationEndpoint:'https://accounts.example.net/oauth/authorize',
 pinnedHostname:'accounts.example.net',clientId:'ci-observation-client',
 redirectUri:'https://marketing.example.org/oauth/callback',scopes:['w_member_social']
};
describe('R2C-C trusted provider-account observation',()=>{
 it.skipIf(!enabled)('requires server-token readback, scopes, exact tenant and immutable source evidence',async()=>{
  const db=new PrismaClient();
  const org='r2c-obs-'+randomUUID(),foreign='r2c-foreign-'+randomUUID();
  const admin='admin-'+randomUUID(),brandId=randomUUID();
  const vault=new ProviderSecretEnvelope(randomBytes(32));
  const hub=new PlatformIntegrationHubService(db as any);
  const oauth=new IntegrationOAuthLifecycleService(db as any,vault);
  const service=new ProviderAccountObservationService(db as any);
  try{
   await db.$connect();
   await db.organization.createMany({data:[{id:org,name:'Observation owner'},
    {id:foreign,name:'Foreign observation tenant'}]});
   await db.brand.create({data:{id:brandId,organizationId:org,
    slug:'readback',name:'Readback',createdBy:admin}});
   const connection=await hub.register(org,admin,{
    brandId,providerKey:'LINKEDIN',destinationLabel:'Account evidence sandbox'});
   const begin=await oauth.begin(org,admin,connection.id,cfg);
   const state=new URL(begin.authorizationUrl).searchParams.get('state')!;
   const token='local-test-only-secret-access-abcdefg';
   await oauth.exchange(org,state,'observation-authorization-code',{
    providerKey:'LINKEDIN',exchangeCode:async()=>({
     accessToken:token,expiresAt:new Date(Date.now()+3600000),
     grantedScopes:['w_member_social']
    })
   });
   let calls=0;
   const adapter:TrustedProviderAccountReader={
    providerKey:'LINKEDIN',adapterId:'ci_readonly_adapter',
    readAccount:async input=>{
     calls++;
     expect(input).toEqual({accessToken:token,providerKey:'LINKEDIN'});
     return{providerKey:'LINKEDIN',accountRef:'acct:trusted_001',
      sourceRequestId:'req_123456789',observedScopes:['w_member_social'],
      reportedCapabilities:['ACCOUNT_READ']};
    }
   };
   await expect(service.observe(foreign,admin,connection.id,adapter,vault))
    .rejects.toThrow('Provider and pending');
   await expect(service.observe(org,admin,connection.id,{
    ...adapter,providerKey:'META_GRAPH'
   },vault)).rejects.toThrow('Provider and pending');
   await expect(service.observe(org,admin,connection.id,{
    ...adapter,readAccount:async()=>({
     providerKey:'LINKEDIN',accountRef:'acct:trusted_001',
     sourceRequestId:'req_123456789',
     observedScopes:['unauthorized-scope'],reportedCapabilities:['ACCOUNT_READ']
    })
   },vault)).rejects.toThrow('Unapproved scopes');
   await expect(service.observe(org,admin,connection.id,{
    ...adapter,readAccount:async()=>({
     providerKey:'LINKEDIN',accountRef:'acct:trusted_001',
     sourceRequestId:'req_123456789',
     observedScopes:['w_member_social'],reportedCapabilities:['UNKNOWN_CAPABILITY']
    })
   },vault)).rejects.toThrow('Unapproved scopes');
   const recorded=await service.observe(org,admin,connection.id,adapter,vault);
   expect(recorded).toMatchObject({status:'OBSERVED',
    customerDestinationBound:false,externalEffectsAuthorized:false});
   expect(calls).toBe(1);
   const health=await hub.connectionHealth(org,connection.id);
   expect(health).toMatchObject({accountReadbackObserved:true,
    accountReadbackFresh:true,customerDestinationBound:false,
    accountOwnershipVerified:false,providerCapabilityVerified:false,
    externalEffectsAuthorized:false});
   await expect(hub.connectionHealth(foreign,connection.id))
    .rejects.toThrow('not found');
   await expect(service.observe(org,admin,connection.id,adapter,vault))
    .rejects.toThrow('already exists');
   expect(calls).toBe(1);
   const evidence=await db.$transaction(async tx=>{
    await tx.$queryRawUnsafe("SELECT set_config('app.marketing_tenant_id', $1, true)",org);
    return tx.providerAccountObservation.findFirstOrThrow({where:{
     organizationId:org,integrationConnectionId:connection.id}});
   });
   expect(evidence.evidenceDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
   expect(JSON.stringify(evidence)).not.toContain(token);
   await expect(db.$transaction(async tx=>{
    await tx.$queryRawUnsafe("SELECT set_config('app.marketing_tenant_id', $1, true)",org);
    return tx.providerAccountObservation.update({where:{id:evidence.id},
     data:{providerAccountRef:'acct:forged_002'}});
   })).rejects.toThrow();
   await expect(db.$transaction(async tx=>{
    await tx.$queryRawUnsafe("SELECT set_config('app.marketing_tenant_id', $1, true)",org);
    return tx.providerAccountObservation.delete({where:{id:evidence.id}});
   })).rejects.toThrow();
   const audit=await db.auditEvent.findMany({where:{organizationId:org}});
   expect(JSON.stringify(audit)).not.toContain(token);
   expect(JSON.stringify(audit)).not.toContain('acct:trusted_001');
   const revoked=await service.revoke(org,admin,connection.id,
    'Account observation no longer trusted for this tenant');
   expect(revoked).toEqual({status:'REVOKED',replayed:false,externalEffectsAuthorized:false});
   const after=await hub.connectionHealth(org,connection.id);
   expect(after.accountReadbackObserved).toBe(true);
   expect(after.accountReadbackFresh).toBe(false);
   expect(after.externalEffectsAuthorized).toBe(false);
   const replay=await service.revoke(org,admin,connection.id,
    'Account observation no longer trusted for this tenant');
   expect(replay.replayed).toBe(true);
   await expect(db.$transaction(async tx=>{
    await tx.$queryRawUnsafe("SELECT set_config('app.marketing_tenant_id', $1, true)",org);
    return tx.providerAccountObservation.update({where:{id:evidence.id},
     data:{status:'OBSERVED',revokedAt:null,revokedBy:null}});
   })).rejects.toThrow();
  }finally{await db.$disconnect();}
 },90000);
 it.skipIf(!enabled)('enforces observation FORCE RLS across foreign tenant, absent tenant and pooled role',async()=>{
  const db=new PrismaClient();
  const org='r2c-row-'+randomUUID(),actor='admin-'+randomUUID(),brandId=randomUUID();
  const role='r2c_obs_'+randomUUID().replaceAll('-','').slice(0,18);
  const vault=new ProviderSecretEnvelope(randomBytes(32));
  const hub=new PlatformIntegrationHubService(db as any);
  const oauth=new IntegrationOAuthLifecycleService(db as any,vault);
  const service=new ProviderAccountObservationService(db as any);
  let roleCreated=false;
  try{
   await db.$connect();
   await db.organization.create({data:{id:org,name:'RLS observation tenant'}});
   await db.brand.create({data:{id:brandId,organizationId:org,
    slug:'rls-observation',name:'RLS Observation',createdBy:actor}});
   const connection=await hub.register(org,actor,{
    brandId,providerKey:'LINKEDIN',destinationLabel:'RLS observation case'});
   const begin=await oauth.begin(org,actor,connection.id,cfg);
   const state=new URL(begin.authorizationUrl).searchParams.get('state')!;
   await oauth.exchange(org,state,'rls-authorization-code-test',{
    providerKey:'LINKEDIN',exchangeCode:async()=>({
     accessToken:'rls-observation-access-token',expiresAt:new Date(Date.now()+3600000),
     grantedScopes:['w_member_social']
    })
   });
   await service.observe(org,actor,connection.id,{
    providerKey:'LINKEDIN',adapterId:'ci_readonly_adapter',
    readAccount:async()=>({
     providerKey:'LINKEDIN',accountRef:'acct:rls_123',
     sourceRequestId:'req_rls_12345',observedScopes:['w_member_social'],
     reportedCapabilities:['ACCOUNT_READ']
    })
   },vault);
   await db.$executeRawUnsafe('CREATE ROLE "'+role+'" NOLOGIN');roleCreated=true;
   await db.$executeRawUnsafe('GRANT SELECT ON "ProviderAccountObservation" TO "'+role+'"');
   const out=await db.$transaction(async tx=>{
    await tx.$executeRawUnsafe('SET LOCAL ROLE "'+role+'"');
    const count=async()=>{
     const rows=await tx.$queryRawUnsafe<Array<{n:bigint}>>(
      'SELECT count(*)::bigint AS n FROM "ProviderAccountObservation"');
     return Number(rows[0]?.n);
    };
    const none=await count();
    await tx.$queryRawUnsafe("SELECT set_config('app.marketing_tenant_id', $1, true)",org);
    const own=await count();
    await tx.$queryRawUnsafe("SELECT set_config('app.marketing_tenant_id', $1, true)",'other-org');
    const foreign=await count();
    return{none,own,foreign};
   });
   expect(out).toEqual({none:0,own:1,foreign:0});
   const pooled=await db.$transaction(async tx=>{
    await tx.$executeRawUnsafe('SET LOCAL ROLE "'+role+'"');
    const rows=await tx.$queryRawUnsafe<Array<{n:bigint}>>(
     'SELECT count(*)::bigint AS n FROM "ProviderAccountObservation"');
    return Number(rows[0]?.n);
   });
   expect(pooled).toBe(0);
  }finally{
   if(roleCreated){
    await db.$executeRawUnsafe('REVOKE SELECT ON "ProviderAccountObservation" FROM "'+role+'"');
    await db.$executeRawUnsafe('DROP ROLE IF EXISTS "'+role+'"');
   }
   await db.$disconnect();
  }
 },90000);
});
