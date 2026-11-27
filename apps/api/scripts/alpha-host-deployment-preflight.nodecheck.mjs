import test from 'node:test';
import assert from 'node:assert/strict';
import {assertAlphaCompose} from './alpha-host-deployment-preflight.mjs';
const reviewed={api:'registry.example.com/medsol/api@sha256:'+'a'.repeat(64),
 web:'registry.example.com/medsol/web@sha256:'+'b'.repeat(64)};
function fixture(){
 const shared={NODE_ENV:'production',MARKETING_DEPLOYMENT_ENV:'staging',
 MARKETING_IDENTITY_PROVIDER:'STAGING_OIDC',MARKETING_STAGING_OIDC_ENABLED:'OFFLINE_OPERATOR_TEST_ONLY',
 MARKETING_AUTH_MODE:'oidc',MARKETING_TENANT_RESOLUTION_MODE:'SIGNED_OIDC_CLAIM',
 MARKETING_EXTERNAL_EFFECTS_ENABLED:'false',MARKETING_AI_REASONING_ENABLED:'false',
 MARKETING_REAL_EMAIL_ENABLED:'false',MARKETING_REAL_PROVIDER_PUBLISHING_ENABLED:'false',
 MARKETING_LIVE_DELIVERY_ENABLED:'false',MARKETING_PROVIDER_EGRESS_ENABLED:'false',
 MARKETING_LIVE_CAMPAIGN_EXECUTION_ENABLED:'false',MARKETING_INCIDENT_ALERT_DELIVERY_ENABLED:'false',
 MARKETING_MODEL_PROVIDER:'disabled',MARKETING_OIDC_ISSUER:'https://identity.example.com/realms/test',
 MARKETING_STAGING_OIDC_TRUSTED_ISSUER:'https://identity.example.com/realms/test',
 MARKETING_OIDC_JWKS_URL:'https://identity.example.com/realms/test/certs',
 MARKETING_OIDC_CLIENT_ID:'fixture-web',MARKETING_OIDC_AUDIENCE:'fixture-api',
 MARKETING_STAGING_OIDC_CLIENT_SECRET:'synthetic-not-a-real-secret-for-pure-tests-only',
 MARKETING_PUBLIC_ORIGIN:'https://alpha.example.com'};
 const svc={read_only:true,cap_drop:['ALL'],security_opt:['no-new-privileges:true'],networks:{private:null}};
 return {services:{api:{...structuredClone(svc),image:reviewed.api,environment:{...shared,PORT:'3001',
 DATABASE_URL:'postgresql://restricted:fixture@db.example.com:5432/marketing_staging?sslmode=verify-full'}},
 web:{...structuredClone(svc),image:reviewed.web,environment:{...shared,PORT:'3000',
 MARKETING_API_INTERNAL_URL:'http://api:3001',MARKETING_SESSION_SECRET:Buffer.alloc(32,7).toString('base64url')},
 ports:[{host_ip:'127.0.0.1',published:'3100',target:3000,protocol:'tcp'}]}}};
}
test('valid configuration cannot certify deployment, identity or host egress',()=>{
 const evidence=assertAlphaCompose(fixture(),reviewed);
 assert.equal(evidence.verdict,'CONFIG_VALIDATED_NOT_DEPLOYED');
 assert.equal(evidence.releaseVerdict,'NO_GO');
 for(const key of ['actualDeploymentObserved','actualHostEgressVerified','actualDatabaseRoleVerified','actualTlsVerified','actualOperatorAuthenticated'])assert.equal(evidence[key],false);
 assert.equal(evidence.independentQaSignatures,0);
 assert.ok(!JSON.stringify(evidence).includes('synthetic-not-a-real-secret'));
 assert.ok(!JSON.stringify(evidence).includes('postgresql:'));
});
for(const [label,alter] of [
 ['mutable image',c=>{c.services.api.image='medsol/api:latest'}],
 ['extra service',c=>{c.services.proxy={}}],
 ['privileged',c=>{c.services.api.privileged=true}],
 ['host network',c=>{c.services.api.network_mode='host'}],
 ['Docker socket mount',c=>{c.services.api.volumes=[{source:'/var/run/docker.sock'}]}],
 ['public frontend',c=>{c.services.web.ports[0].host_ip='0.0.0.0'}],
 ['published backend',c=>{c.services.api.ports=[{target:3001}]}],
 ['weakened TLS',c=>{c.services.api.environment.DATABASE_URL=c.services.api.environment.DATABASE_URL.replace('verify-full','require')}],
 ['database secret in web',c=>{c.services.web.environment.DATABASE_URL=c.services.api.environment.DATABASE_URL}],
 ['session secret in API',c=>{c.services.api.environment.MARKETING_SESSION_SECRET=c.services.web.environment.MARKETING_SESSION_SECRET}],
 ['CI fixture flag',c=>{c.services.api.environment.MARKETING_T1E_STAGING_CI_ONLY='1'}],
 ['bootstrap token',c=>{c.services.api.environment.MARKETING_BOOTSTRAP_TOKEN='synthetic'}],
 ['live model',c=>{c.services.web.environment.MARKETING_MODEL_PROVIDER='openai'}],
 ['live provider credential',c=>{c.services.web.environment.OPENAI_API_KEY='synthetic'}],
 ['unsafe TLS flag',c=>{c.services.web.environment.NODE_TLS_REJECT_UNAUTHORIZED='0'}],
 ['live worker delivery',c=>{c.services.api.environment.MARKETING_INCIDENT_ALERT_DELIVERY_ENABLED='true'}],
 ['origin mismatch',c=>{c.services.web.environment.MARKETING_PUBLIC_ORIGIN='https://another.example.com'}],
 ['invalid session key',c=>{c.services.web.environment.MARKETING_SESSION_SECRET='short'}]
])test('reject '+label,()=>{const c=fixture();alter(c);assert.throws(()=>assertAlphaCompose(c,reviewed),/ALPHA_HOST_CONFIG_BLOCKED/)});
