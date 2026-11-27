import {describe,it,expect} from 'vitest';
import {marketingIdentityProvider,pinnedStagingIssuer,stagingOidcSubject,
 assertStagingDiscoveryUrl,hasOidcScope} from './staging-oidc.js';
const issuer='https://id.staging.medsol.example/realms/medsol';
const good:Record<string,string>={
 MARKETING_IDENTITY_PROVIDER:'STAGING_OIDC',
 MARKETING_DEPLOYMENT_ENV:'staging',
 MARKETING_STAGING_OIDC_ENABLED:'OFFLINE_OPERATOR_TEST_ONLY',
 MARKETING_AUTH_MODE:'oidc',
 MARKETING_TENANT_RESOLUTION_MODE:'SIGNED_OIDC_CLAIM',
 MARKETING_EXTERNAL_EFFECTS_ENABLED:'false',
 MARKETING_REAL_EMAIL_ENABLED:'false',
 MARKETING_AI_REASONING_ENABLED:'false',
 MARKETING_OIDC_ISSUER:issuer,MARKETING_STAGING_OIDC_TRUSTED_ISSUER:issuer,
 MARKETING_OIDC_JWKS_URL:issuer+'/protocol/openid-connect/certs',
 MARKETING_OIDC_CLIENT_ID:'medsol-staging-web',
 MARKETING_OIDC_AUDIENCE:'medsol-staging-api',
 MARKETING_STAGING_OIDC_CLIENT_SECRET:'some-random-staging-only-secret-with-32-bytes-or-more'
};
describe('T1E self-hosted staging OIDC must never become production or tenant bypass',()=>{
 it('requires explicit self-hosted staging identity with pinned issuer and scoped HTTPS JWKS',()=>{
  expect(pinnedStagingIssuer(good)).toBe(issuer);
  expect(pinnedStagingIssuer({...good,MARKETING_MODEL_PROVIDER:'simulation'})).toBe(issuer);
  for(const provider of ['anthropic','gemini','unknown'])expect(()=>pinnedStagingIssuer({...good,MARKETING_MODEL_PROVIDER:provider})).toThrow();
  expect(marketingIdentityProvider(undefined)).toBe('ENTRA');
  expect(()=>marketingIdentityProvider('anything')).toThrow();
  expect(assertStagingDiscoveryUrl(issuer,issuer+'/protocol/openid-connect/auth'))
   .toContain('/auth');
  for(const endpoint of ['https://evil.example/steal',
    'http://id.staging.medsol.example/realms/medsol/token',
    'https://id.staging.medsol.example/otherrealm/token',
    'https://id.staging.medsol.example@evil.example/token'])
   expect(()=>assertStagingDiscoveryUrl(issuer,endpoint)).toThrow();
 });
 it('staging organization and trust context cannot be selected by bootstrap or browser input',()=>{
  for(const [key,value] of Object.entries({
   MARKETING_DEPLOYMENT_ENV:'production',
   MARKETING_STAGING_OIDC_ENABLED:'true',
   MARKETING_AUTH_MODE:'bootstrap',
   MARKETING_TENANT_RESOLUTION_MODE:'FIXED',
   MARKETING_BOOTSTRAP_ORGANIZATION_ID:'tenant-a',
   MARKETING_BOOTSTRAP_TOKEN:'shared-token',
   MARKETING_EXTERNAL_EFFECTS_ENABLED:'true',
   MARKETING_REAL_EMAIL_ENABLED:'true',
   MARKETING_AI_REASONING_ENABLED:'true',
   MARKETING_PROVIDER_EGRESS_ENABLED:'true',
   MARKETING_STAGING_OIDC_TRUSTED_ISSUER:'https://evil.example',
   MARKETING_OIDC_ISSUER:'https://evil.example',
   MARKETING_OIDC_JWKS_URL:'https://evil.example/jwks',
   MARKETING_ENTRA_CLIENT_SECRET:'sensitive-entra',
   OPENAI_API_KEY:'sensitive-ai',
   SMTP_PASSWORD:'smtp-secret',
   MARKETING_ANTHROPIC_API_KEY:'test-rejected',
   MARKETING_GEMINI_API_KEY:'test-rejected',
   MARKETING_MODEL_PROVIDER:'openai',
   MARKETING_INCIDENT_ALERT_DELIVERY_ENABLED:'true',
   MARKETING_INCIDENT_WEBHOOK_URL:'https://alerts.example/notify',
   MARKETING_INCIDENT_WEBHOOK_HMAC_SECRET:'test-rejected'
  }))
   expect(()=>pinnedStagingIssuer({...good,[key]:value}),key).toThrow();
 });
 it('does not allow CI loopback issuer or weak secret in real staging',()=>{
  expect(()=>pinnedStagingIssuer({...good,
   MARKETING_OIDC_ISSUER:'https://127.0.0.1:3215',
   MARKETING_STAGING_OIDC_TRUSTED_ISSUER:'https://127.0.0.1:3215',
   MARKETING_OIDC_JWKS_URL:'https://127.0.0.1:3215/jwks'})).toThrow();
  expect(()=>pinnedStagingIssuer({...good,
   MARKETING_STAGING_OIDC_CLIENT_SECRET:'short'})).toThrow();
 });
 it('derives deterministic issuer-specific immutable subject and exact scope',()=>{
  expect(stagingOidcSubject(issuer,'opaque-user-id'))
   .toBe('staging-oidc:'+encodeURIComponent(issuer)+'|opaque-user-id');
  expect(stagingOidcSubject(issuer,'opaque-user-id'))
   .not.toBe(stagingOidcSubject(issuer+'/changed','opaque-user-id'));
  for(const bad of ['',123,null,' bad ','x'.repeat(300)])
   expect(()=>stagingOidcSubject(issuer,bad)).toThrow();
  expect(hasOidcScope({scope:'openid profile marketing'},'marketing')).toBe(true);
  expect(hasOidcScope({scp:'marketing User.Read'},'marketing')).toBe(true);
  expect(hasOidcScope({scope:'marketing.admin'},'marketing')).toBe(false);
 });
});
