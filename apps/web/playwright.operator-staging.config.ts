import {defineConfig,type WebServerConfig} from '@playwright/test';
import existing from './playwright.staging.config';
/** Same actual Chromium -> Next -> Nest -> restricted PostgreSQL stack as R3-Y.
 * Only the identity-provider policy changes to self-hosted staging OIDC.
 * CI uses a disposable loopback OIDC *simulator*, never Keycloak production.
 */
const issuer='https://127.0.0.1:3215';
const staging={
 MARKETING_IDENTITY_PROVIDER:'STAGING_OIDC',
 MARKETING_DEPLOYMENT_ENV:'staging',
 MARKETING_STAGING_OIDC_ENABLED:'OFFLINE_OPERATOR_TEST_ONLY',
 MARKETING_TENANT_RESOLUTION_MODE:'SIGNED_OIDC_CLAIM',
 MARKETING_BOOTSTRAP_ORGANIZATION_ID:'',
 MARKETING_BOOTSTRAP_TOKEN:'',
 MARKETING_STAGING_OIDC_TRUSTED_ISSUER:issuer,
 MARKETING_STAGING_OIDC_CLIENT_SECRET:'r3y-disposable-client-secret-ci-only',
 MARKETING_OIDC_JWKS_URL:issuer+'/.well-known/jwks.json',
 MARKETING_OIDC_CLIENT_ID:'r3y-disposable-browser',
 MARKETING_OIDC_AUDIENCE:'api://medsol-r3y',
 MARKETING_T1E_STAGING_CI_ONLY:'1',
 MARKETING_BRAIN_WORKER_ENABLED:'true',
 MARKETING_SPECIALIST_SCHEDULER_ENABLED:'true',
 MARKETING_BRAIN_RUN_DISPATCH_ENABLED:'false',
 MARKETING_BRAIN_POLL_MS:'1000'
};
const servers=Array.isArray(existing.webServer)?existing.webServer:
 [existing.webServer! as WebServerConfig];
export default defineConfig({
 ...existing,
 testMatch:'**/t1e-operator-staging.pw.ts',
 reporter:[['list'],['html',{open:'never',outputFolder:'t1e-playwright-report'}],
  ['json',{outputFile:'t1e-playwright-report/t1e-results.json'}]],
 outputDir:'t1e-test-results',
 webServer:servers.map(server=>({...server,env:{...server.env,...staging}}))
});
