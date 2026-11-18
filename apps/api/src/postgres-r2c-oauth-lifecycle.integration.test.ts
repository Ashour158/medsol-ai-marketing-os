import {describe,expect,it} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {PlatformIntegrationHubService} from './platform-integration-hub.service.js';
import {IntegrationOAuthLifecycleService,requireActiveOAuthWindow,type ApprovedOAuthProvider} from './integration-oauth-lifecycle.service.js';
import {ProviderSecretEnvelope} from './provider-secret-envelope.js';
import {permissionForMarketingRoute} from './marketing-permissions.js';
const enabled=process.env.MARKETING_DB_INTEGRATION==='1';
const cfg:ApprovedOAuthProvider={
 providerKey:'LINKEDIN',authorizationEndpoint:'https://accounts.example.net/oauth/authorize',
 pinnedHostname:'accounts.example.net',clientId:'local-ci-only-client',
 redirectUri:'https://marketing.example.org/oauth/callback',
 scopes:['w_member_social']
};
describe('R2C OAuth/PKCE security contract',()=>{
 it('expires authorization even if an exchange began before the callback deadline',()=>{
  const now=new Date('2026-11-18T19:00:00.000Z');
  expect(()=>requireActiveOAuthWindow(new Date(now.getTime()+1000),now)).not.toThrow();
  expect(()=>requireActiveOAuthWindow(now,now)).toThrow('window expired');
  expect(()=>requireActiveOAuthWindow(new Date(now.getTime()-1),now)).toThrow('window expired');
  expect(()=>requireActiveOAuthWindow(new Date('invalid'),now)).toThrow();
 });
 it('does not expose raw-token or provider-verification endpoints',()=>{
  expect(permissionForMarketingRoute('GET','/marketing/integrations/abc/health')).toBe('READ_TENANCY');
  expect(()=>permissionForMarketingRoute('POST','/marketing/integrations/abc/token')).toThrow();
  expect(()=>permissionForMarketingRoute('POST','/marketing/integrations/abc/oauth/exchange')).toThrow();
  expect(()=>permissionForMarketingRoute('POST','/marketing/publications/abc/publish')).toThrow();
 });
 it.skipIf(!enabled)('records one-use state, encrypts tokens, detects replay and cascades revocation',async()=>{
  const db=new PrismaClient();
  const org='r2c-org-'+randomUUID(),other='r2c-other-'+randomUUID();
  const actor='r2c-admin-'+randomUUID(),brandId=randomUUID();
  const vault=new ProviderSecretEnvelope(randomBytes(32));
  const hub=new PlatformIntegrationHubService(db as any);
  const oauth=new IntegrationOAuthLifecycleService(db as any,vault);
  try{
   await db.$connect();
   await db.organization.createMany({data:[{id:org,name:'R2C tenant'},
    {id:other,name:'R2C foreign tenant'}]});
   await db.brand.create({data:{id:brandId,organizationId:org,
    slug:'oauth-brand',name:'OAuth brand',createdBy:actor}});
   const connection=await hub.register(org,actor,{brandId,providerKey:'LINKEDIN',
    destinationLabel:'OAuth connection test'});
   expect(connection.status).toBe('PENDING_VERIFICATION');
   await expect(oauth.begin(other,actor,connection.id,cfg)).rejects.toThrow('Pending tenant');
   await expect(oauth.begin(org,actor,connection.id,{...cfg,authorizationEndpoint:'http://local/authorize'}))
    .rejects.toThrow();
   await expect(oauth.begin(org,actor,connection.id,{...cfg,scopes:['w_member_social','w_member_social']}))
    .rejects.toThrow('explicit');
   const opened=await oauth.begin(org,actor,connection.id,cfg);
   const url=new URL(opened.authorizationUrl);
   const state=url.searchParams.get('state')!;
   const challenge=url.searchParams.get('code_challenge')!;
   expect(url.hostname).toBe(cfg.pinnedHostname);
   expect(url.searchParams.get('code_challenge_method')).toBe('S256');
   expect(url.searchParams.get('redirect_uri')).toBe(cfg.redirectUri);
   expect(opened.externalEffectsAuthorized).toBe(false);
   await expect(oauth.begin(org,actor,connection.id,cfg)).rejects.toThrow('unexpired');
   const attempts=await db.$transaction(async tx=>{
    await tx.$queryRawUnsafe("SELECT set_config('app.marketing_tenant_id', $1, true)",org);
    return tx.oAuthAuthorizationAttempt.findMany({where:{organizationId:org}});
   });
   expect(attempts).toHaveLength(1);
   expect(attempts[0]?.stateDigest).toBe('sha256:'+createHash('sha256').update(state).digest('hex'));
   expect(attempts[0]?.encryptedCodeVerifier).not.toContain(challenge);
   expect(attempts[0]?.encryptedCodeVerifier).not.toContain(state);
   const plainPkce=vault.decrypt(attempts[0]!.encryptedCodeVerifier,org,connection.id,
    'pkce-'+attempts[0]!.id);
   expect(createHash('sha256').update(plainPkce).digest('base64url')).toBe(challenge);
   const broker={providerKey:'LINKEDIN',exchangeCode:async(input:{
    code:string;codeVerifier:string;redirectUri:string
   })=>{
    expect(input.code).toBe('oauth-authorization-code-123');
    expect(input.codeVerifier).toBe(plainPkce);
    expect(input.redirectUri).toBe(cfg.redirectUri);
    return{
     accessToken:'sensitive-access-token-abcdef-12345',
     refreshToken:'sensitive-refresh-token-abcdef-12345',
     expiresAt:new Date(Date.now()+7200_000),grantedScopes:['w_member_social']
    };
   }};
   await expect(oauth.exchange(other,state,'oauth-authorization-code-123',broker))
    .rejects.toThrow('expired or already claimed');
   await expect(oauth.exchange(org,state,'oauth-authorization-code-123',{
    ...broker,providerKey:'FAKE'})).rejects.toThrow('Trusted provider broker');
   const accepted=await oauth.exchange(org,state,'oauth-authorization-code-123',broker);
   expect(accepted).toMatchObject({connectionId:connection.id,status:'PENDING_ATTESTATION',
    externalEffectsAuthorized:false});
   await expect(oauth.exchange(org,state,'oauth-authorization-code-123',broker))
    .rejects.toThrow('already claimed');
   const credential=await db.$transaction(async tx=>{
    await tx.$queryRawUnsafe("SELECT set_config('app.marketing_tenant_id', $1, true)",org);
    return tx.providerCredential.findFirstOrThrow({where:{
     organizationId:org,integrationConnectionId:connection.id}});
   });
   expect(credential.encryptedAccessToken).not.toContain('sensitive-access-token');
   expect(credential.encryptedRefreshToken).not.toContain('sensitive-refresh-token');
   expect(vault.decrypt(credential.encryptedAccessToken,org,connection.id,'access-v1'))
    .toBe('sensitive-access-token-abcdef-12345');
   expect(()=>vault.decrypt(credential.encryptedAccessToken,other,connection.id,'access-v1'))
    .toThrow();
   const health=await hub.connectionHealth(org,connection.id);
   expect(health).toMatchObject({tokenReceived:true,tokenStatus:'PENDING_ATTESTATION',
    connectionStatus:'PENDING_VERIFICATION',accountOwnershipVerified:false,
    providerCapabilityVerified:false,externalEffectsAuthorized:false});
   await expect(hub.connectionHealth(other,connection.id)).rejects.toThrow('not found');
   await expect(oauth.begin(org,actor,connection.id,cfg)).rejects.toThrow('Existing or revoked');
   await expect(db.$transaction(async tx=>{
    await tx.$queryRawUnsafe("SELECT set_config('app.marketing_tenant_id', $1, true)",org);
    return tx.providerCredential.update({where:{id:credential.id},
     data:{encryptedAccessToken:'forged-token'}});
   })).rejects.toThrow();
   await expect(db.$transaction(async tx=>{
    await tx.$queryRawUnsafe("SELECT set_config('app.marketing_tenant_id', $1, true)",org);
    return tx.oAuthAuthorizationAttempt.update({where:{id:attempts[0]!.id},
     data:{status:'PENDING',claimedAt:null,completedAt:null}});
   })).rejects.toThrow();
   await hub.change(org,actor,connection.id,1,'REVOKE',
    'Permanent governance revocation of provider connection');
   const post=await hub.connectionHealth(org,connection.id);
   expect(post.tokenStatus).toBe('REVOKED');
   expect(post.tokenReceived).toBe(false);
   expect(post.externalEffectsAuthorized).toBe(false);
   const after=await db.$transaction(async tx=>{
    await tx.$queryRawUnsafe("SELECT set_config('app.marketing_tenant_id', $1, true)",org);
    return tx.providerCredential.findFirstOrThrow({where:{id:credential.id}});
   });
   expect(after.status).toBe('REVOKED');
   const audit=await db.auditEvent.findMany({where:{organizationId:org}});
   expect(JSON.stringify(audit)).not.toContain('sensitive-access-token');
   expect(JSON.stringify(audit)).not.toContain('sensitive-refresh-token');
   expect(JSON.stringify(audit)).not.toContain('oauth-authorization-code-123');
   expect(await db.auditEvent.count({where:{
    organizationId:org,
    action:{in:['OAUTH_PKCE_HANDSHAKE_STARTED',
     'OAUTH_TOKEN_ENCRYPTED_PENDING_ATTESTATION','INTEGRATION_CONNECTION_REVOKED']}
   }})).toBe(3);
  }finally{await db.$disconnect();}
 },90000);
 it.skipIf(!enabled)('fails closed when broker reports unexpected scope, retaining consumed claim',async()=>{
  const db=new PrismaClient();
  const org='r2c-fail-'+randomUUID(),actor='admin-'+randomUUID(),brandId=randomUUID();
  const hub=new PlatformIntegrationHubService(db as any);
  const oauth=new IntegrationOAuthLifecycleService(db as any,
   new ProviderSecretEnvelope(randomBytes(32)));
  try{
   await db.$connect();
   await db.organization.create({data:{id:org,name:'Failed exchange tenant'}});
   await db.brand.create({data:{id:brandId,organizationId:org,
    slug:'failed-exchange',name:'Failed exchange',createdBy:actor}});
   const conn=await hub.register(org,actor,{brandId,providerKey:'LINKEDIN',
    destinationLabel:'Failed broker account'});
   const intent=await oauth.begin(org,actor,conn.id,cfg);
   const state=new URL(intent.authorizationUrl).searchParams.get('state')!;
   let calls=0;
   const broker={providerKey:'LINKEDIN',exchangeCode:async()=>{
    calls++;
    return{accessToken:'should-not-store-this-token',
     expiresAt:new Date(Date.now()+3600_000),grantedScopes:['unrequested_admin_scope']};
   }};
   await expect(oauth.exchange(org,state,'another-authorization-code-123',broker))
    .rejects.toThrow('new authorization required');
   await expect(oauth.exchange(org,state,'another-authorization-code-123',broker))
    .rejects.toThrow('already claimed');
   expect(calls).toBe(1);
   const attempt=await db.$transaction(async tx=>{
    await tx.$queryRawUnsafe("SELECT set_config('app.marketing_tenant_id', $1, true)",org);
    return tx.oAuthAuthorizationAttempt.findFirstOrThrow({where:{organizationId:org}});
   });
   expect(attempt.status).toBe('FAILED');
   const health=await hub.connectionHealth(org,conn.id);
   expect(health.tokenReceived).toBe(false);
   expect(health.accountOwnershipVerified).toBe(false);
  }finally{await db.$disconnect();}
 },60000);
 it.skipIf(!enabled)('FORCE RLS hides PKCE verifier and encrypted provider credentials with missing/foreign tenant context',async()=>{
  const db=new PrismaClient(),org='r2c-rls-'+randomUUID();
  const actor='admin-'+randomUUID(),brandId=randomUUID();
  const role='r2c_reader_'+randomUUID().replaceAll('-','').slice(0,18);
  const hub=new PlatformIntegrationHubService(db as any);
  const oauth=new IntegrationOAuthLifecycleService(db as any,
   new ProviderSecretEnvelope(randomBytes(32)));
  let roleCreated=false;
  try{
   await db.$connect();
   await db.organization.create({data:{id:org,name:'R2C RLS tenant'}});
   await db.brand.create({data:{id:brandId,organizationId:org,
    slug:'oauth-rls',name:'OAuth RLS',createdBy:actor}});
   const conn=await hub.register(org,actor,{brandId,providerKey:'LINKEDIN',
    destinationLabel:'RLS authorization test'});
   const handshake=await oauth.begin(org,actor,conn.id,cfg);
   const state=new URL(handshake.authorizationUrl).searchParams.get('state')!;
   await oauth.exchange(org,state,'r2c-rls-authorization-code',{
    providerKey:'LINKEDIN',exchangeCode:async()=>({
     accessToken:'encrypted-in-rls-test',expiresAt:new Date(Date.now()+3600_000),
     grantedScopes:['w_member_social']
    })
   });
   await db.$executeRawUnsafe('CREATE ROLE "'+role+'" NOLOGIN');roleCreated=true;
   await db.$executeRawUnsafe(
    'GRANT SELECT ON "OAuthAuthorizationAttempt","ProviderCredential" TO "'+role+'"');
   const results=await db.$transaction(async tx=>{
    await tx.$executeRawUnsafe('SET LOCAL ROLE "'+role+'"');
    const count=async(table:'OAuthAuthorizationAttempt'|'ProviderCredential')=>{
     const rows=await tx.$queryRawUnsafe<Array<{n:bigint}>>(
      'SELECT count(*)::bigint AS n FROM "'+table+'"');
     return Number(rows[0]?.n);
    };
    const noTenant=[await count('OAuthAuthorizationAttempt'),await count('ProviderCredential')];
    await tx.$queryRawUnsafe("SELECT set_config('app.marketing_tenant_id', $1, true)",org);
    const own=[await count('OAuthAuthorizationAttempt'),await count('ProviderCredential')];
    await tx.$queryRawUnsafe("SELECT set_config('app.marketing_tenant_id', $1, true)",'another-tenant');
    const foreign=[await count('OAuthAuthorizationAttempt'),await count('ProviderCredential')];
    return{noTenant,own,foreign};
   });
   expect(results).toEqual({noTenant:[0,0],own:[1,1],foreign:[0,0]});
   const fresh=await db.$transaction(async tx=>{
    await tx.$executeRawUnsafe('SET LOCAL ROLE "'+role+'"');
    const rows=await tx.$queryRawUnsafe<Array<{n:bigint}>>(
     'SELECT count(*)::bigint AS n FROM "ProviderCredential"');
    return Number(rows[0]?.n);
   });
   expect(fresh).toBe(0);
  }finally{
   if(roleCreated){
    await db.$executeRawUnsafe(
     'REVOKE SELECT ON "OAuthAuthorizationAttempt","ProviderCredential" FROM "'+role+'"');
    await db.$executeRawUnsafe('DROP ROLE IF EXISTS "'+role+'"');
   }
   await db.$disconnect();
  }
 },60000);
});
