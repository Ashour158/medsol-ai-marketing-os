import {describe,expect,it} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {IntegrationOAuthLifecycleService}
 from './integration-oauth-lifecycle.service.js';
import {PlatformIntegrationHubService}
 from './platform-integration-hub.service.js';
import {ProviderSecretEnvelope} from './provider-secret-envelope.js';
import {EXTRA_TRIAL_OAUTH_PROVIDERS,extraTrialOAuthConfig}
 from './provider-trial-extra-oauth.js';
const enabled=process.env.MARKETING_DB_INTEGRATION==='1';
describe('New provider OAuth PKCE trials with actual PostgreSQL but no provider account',()=>{
 it.skipIf(!enabled)(
  'executes all five pinned authorization URL dialects, encrypts fake token, denies replay and revokes',
  async()=>{
   const db=new PrismaClient(),org='extra-oauth-trial-'+randomUUID(),
    actor='extra-actor-'+randomUUID(),brandId=randomUUID();
   const vault=new ProviderSecretEnvelope(randomBytes(32));
   const hub=new PlatformIntegrationHubService(db as any);
   const oauth=new IntegrationOAuthLifecycleService(db as any,vault);
   try{
    await db.$connect();
    await db.organization.create({data:{id:org,name:'Extra provider trials'}});
    await db.brand.create({data:{id:brandId,organizationId:org,
     slug:'extra-provider-trial',name:'Extra provider brand',createdBy:actor}});
    for(const providerKey of EXTRA_TRIAL_OAUTH_PROVIDERS){
     const config=extraTrialOAuthConfig(providerKey);
     const connection=await hub.register(org,actor,{brandId,
      providerKey,destinationLabel:'No-account provider fixture '+providerKey});
     expect(connection).toMatchObject({providerKey,
      status:'PENDING_VERIFICATION',externalEffectsAuthorized:false});
     const started=await oauth.begin(org,actor,connection.id,config);
     expect(started).toMatchObject({connectionVerified:false,
      externalEffectsAuthorized:false});
     const url=new URL(started.authorizationUrl);
     expect(url.origin).toBe(new URL(config.authorizationEndpoint).origin);
     expect(url.pathname).toBe(new URL(config.authorizationEndpoint).pathname);
     expect(url.searchParams.get('code_challenge_method')).toBe('S256');
     expect(url.searchParams.get('scope')).toBe(config.scopes.join(
      config.scopeDelimiter==='COMMA'?',':' '));
     const key=providerKey==='TIKTOK'?'client_key':'client_id';
     expect(url.searchParams.get(key)).toBe(config.clientId);
     expect(url.searchParams.has(key==='client_key'?'client_id':'client_key'))
      .toBe(false);
     const attempt=await db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${org}, true)`;
      return tx.oAuthAuthorizationAttempt.findFirstOrThrow({where:{
       organizationId:org,integrationConnectionId:connection.id}});
     });
     const verifier=vault.decrypt(attempt.encryptedCodeVerifier,
      org,connection.id,'pkce-'+attempt.id);
     expect(createHash('sha256').update(verifier).digest('base64url'))
      .toBe(url.searchParams.get('code_challenge'));
     const state=url.searchParams.get('state')!;
     let exchanges=0;
     const broker={providerKey,exchangeCode:async(input:{
      code:string;codeVerifier:string;redirectUri:string
     })=>{
      exchanges++;
      expect(input.code).toBe('dummy-provider-code-no-network');
      expect(input.codeVerifier).toBe(verifier);
      expect(input.redirectUri).toBe(config.redirectUri);
      return{accessToken:'TRIAL_ONLY_NOT_A_REAL_CREDENTIAL_000000',
       expiresAt:new Date(Date.now()+3600_000),
       grantedScopes:[...config.scopes]};
     }};
     const accepted=await oauth.exchange(org,state,
      'dummy-provider-code-no-network',broker);
     expect(accepted).toMatchObject({status:'PENDING_ATTESTATION',
      externalEffectsAuthorized:false});
     await expect(oauth.exchange(org,state,
      'dummy-provider-code-no-network',broker))
      .rejects.toThrow('already claimed');
     expect(exchanges).toBe(1);
     const health=await hub.connectionHealth(org,connection.id);
     expect(health).toMatchObject({providerKey,
      connectionStatus:'PENDING_VERIFICATION',
      accountOwnershipVerified:false,providerCapabilityVerified:false,
      externalEffectsAuthorized:false});
     const stored=await db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${org}, true)`;
      return tx.providerCredential.findFirstOrThrow({where:{
       organizationId:org,integrationConnectionId:connection.id}});
     });
     expect(stored.encryptedAccessToken).not.toContain('TRIAL_ONLY');
     expect(vault.decrypt(stored.encryptedAccessToken,
      org,connection.id,'access-v1')).toBe(
       'TRIAL_ONLY_NOT_A_REAL_CREDENTIAL_000000');
     await hub.change(org,actor,connection.id,1,'REVOKE',
      'Permanent no-account OAuth trial cleanup and revocation');
     const revoked=await hub.connectionHealth(org,connection.id);
     expect(revoked.tokenStatus).toBe('REVOKED');
     expect(revoked.externalEffectsAuthorized).toBe(false);
    }
    expect(await db.providerCredential.count({where:{organizationId:org}}))
     .toBe(5);
    expect(await db.providerAccountObservation.count({where:{organizationId:org}}))
     .toBe(0);
    expect(await db.publicationAttempt.count({where:{organizationId:org}}))
     .toBe(0);
    const allAudits=await db.auditEvent.findMany({where:{organizationId:org}});
    expect(JSON.stringify(allAudits)).not.toContain('TRIAL_ONLY_NOT_A_REAL_CREDENTIAL_000000');
    expect(JSON.stringify(allAudits)).not.toContain('dummy-provider-code-no-network');
   }finally{await db.$disconnect();}
  },90000);
});
