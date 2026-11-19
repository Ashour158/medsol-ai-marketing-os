import {describe,expect,it} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {PlatformIntegrationHubService}
 from './platform-integration-hub.service.js';
import {IntegrationOAuthLifecycleService}
 from './integration-oauth-lifecycle.service.js';
import {ProviderSecretEnvelope} from './provider-secret-envelope.js';
import {officialSocialTrialOAuthConfig}
 from './provider-trial-oauth.js';
const enabled=process.env.MARKETING_DB_INTEGRATION==='1';
describe('R2 official OAuth endpoint trial with real PostgreSQL but no providers',()=>{
 it.skipIf(!enabled)(
  'runs Meta and LinkedIn PKCE, one-use mock code exchange, encrypted fake tokens and revocation',
  async()=>{
   const db=new PrismaClient(),org='oauth-trial-'+randomUUID(),
    actor='trial-actor-'+randomUUID(),brandId=randomUUID();
   const hub=new PlatformIntegrationHubService(db as any);
   const vault=new ProviderSecretEnvelope(randomBytes(32));
   const oauth=new IntegrationOAuthLifecycleService(db as any,vault);
   try{
    await db.$connect();
    await db.organization.create({data:{id:org,name:'Official OAuth trial tenant'}});
    await db.brand.create({data:{id:brandId,organizationId:org,
     slug:'official-trial-brand',name:'Trial Brand',createdBy:actor}});
    for(const provider of ['META_GRAPH','LINKEDIN'] as const){
     const config=officialSocialTrialOAuthConfig(provider);
     const connection=await hub.register(org,actor,{
      brandId,providerKey:provider,
      destinationLabel:'Official OAuth contract '+provider});
     const opened=await oauth.begin(org,actor,connection.id,config);
     const url=new URL(opened.authorizationUrl);
     expect(url.origin).toBe(new URL(config.authorizationEndpoint).origin);
     expect(url.pathname).toBe(new URL(config.authorizationEndpoint).pathname);
     expect(url.searchParams.get('code_challenge_method')).toBe('S256');
     expect(url.searchParams.get('response_type')).toBe('code');
     expect(url.searchParams.get('scope')).toBe(config.scopes.join(' '));
     expect(opened).toMatchObject({connectionVerified:false,
      externalEffectsAuthorized:false});
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
     const broker={providerKey:provider,exchangeCode:async(input:{
      code:string;codeVerifier:string;redirectUri:string
     })=>{
      exchanges++;
      expect(input.code).toBe('offline-trial-authorization-code');
      expect(input.codeVerifier).toBe(verifier);
      expect(input.redirectUri).toBe(config.redirectUri);
      return{accessToken:'TRIAL_ONLY_NOT_A_REAL_CREDENTIAL_000000',
       expiresAt:new Date(Date.now()+3600_000),
       grantedScopes:[...config.scopes]};
     }};
     const result=await oauth.exchange(org,state,
      'offline-trial-authorization-code',broker);
     expect(result).toMatchObject({status:'PENDING_ATTESTATION',
      externalEffectsAuthorized:false});
     await expect(oauth.exchange(org,state,
      'offline-trial-authorization-code',broker))
      .rejects.toThrow('already claimed');
     expect(exchanges).toBe(1);
     const health=await hub.connectionHealth(org,connection.id);
     expect(health).toMatchObject({
      connectionStatus:'PENDING_VERIFICATION',
      accountOwnershipVerified:false,
      providerCapabilityVerified:false,
      externalEffectsAuthorized:false});
     const credential=await db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${org}, true)`;
      return tx.providerCredential.findFirstOrThrow({where:{
       organizationId:org,integrationConnectionId:connection.id}});
     });
     expect(credential.encryptedAccessToken).not.toContain('TRIAL_ONLY');
     expect(vault.decrypt(credential.encryptedAccessToken,
      org,connection.id,'access-v1')).toBe(
       'TRIAL_ONLY_NOT_A_REAL_CREDENTIAL_000000');
     await hub.change(org,actor,connection.id,1,'REVOKE',
      'Permanently revoke offline provider OAuth trial credential');
     const revoked=await hub.connectionHealth(org,connection.id);
     expect(revoked.tokenStatus).toBe('REVOKED');
     expect(revoked.externalEffectsAuthorized).toBe(false);
    }
    const audit=await db.auditEvent.findMany({where:{organizationId:org}});
    expect(JSON.stringify(audit)).not.toContain(
     'TRIAL_ONLY_NOT_A_REAL_CREDENTIAL_000000');
    expect(await db.providerAccountObservation.count({
     where:{organizationId:org}})).toBe(0);
    expect(await db.publicationAttempt.count({where:{organizationId:org}}))
     .toBe(0);
   }finally{await db.$disconnect();}
  },90000);
});
