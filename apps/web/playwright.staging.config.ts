import {defineConfig,devices} from '@playwright/test';
import {createHash} from 'node:crypto';

/** R3-Y separate production-built Next + compiled Nest + actual PostgreSQL.
 * No synthetic API fixture, no production identity or provider credentials.
 * The signed RS256 JWT claims are minted by an isolated loopback JWKS ONLY.
 */
const browserOnlyKey=createHash('sha256')
 .update('R3Y-disposable-Next-cookie-key-GitHub-ephemeral-only')
 .digest('base64url');
process.env.MARKETING_SESSION_SECRET=browserOnlyKey;
const tenant='11111111-1111-4111-8111-111111111111';
const origin='https://127.0.0.1:3443';
const base={
 MARKETING_BOOTSTRAP_ORGANIZATION_ID:'r3y-tenant-a',
 MARKETING_ENTRA_TENANT_ID:tenant,
 MARKETING_ENTRA_API_SCOPE:'api://medsol-r3y/marketing',
 MARKETING_OIDC_ISSUER:'https://127.0.0.1:3215',
 MARKETING_DISPOSABLE_OIDC_CI_ONLY:'1',
 MARKETING_OFFLINE_OIDC_CLIENT_SECRET:'r3y-disposable-client-secret-ci-only',
 MARKETING_OIDC_AUDIENCE:'api://medsol-r3y',
 MARKETING_AUTH_MODE:'oidc',
 MARKETING_REQUIRE_TENANT_ROLE:'false',
 MARKETING_ENTRA_CLIENT_SECRET:'',
 MARKETING_EXTERNAL_EFFECTS_ENABLED:'false',
 MARKETING_AI_REASONING_ENABLED:'false',
 MARKETING_REAL_EMAIL_ENABLED:'false',
};
export default defineConfig({
 testDir:'./e2e',
 testMatch:'**/r3y-real-stack.pw.ts',
 fullyParallel:false,workers:1,retries:0,timeout:100000,
 expect:{timeout:12000},
 reporter:[['list'],['html',{open:'never',outputFolder:'r3y-playwright-report'}],
  ['json',{outputFile:'r3y-playwright-report/r3y-results.json'}]],
 outputDir:'r3y-test-results',
 use:{...devices['Desktop Chrome'],browserName:'chromium',
  baseURL:origin,ignoreHTTPSErrors:true,
  trace:'retain-on-failure',screenshot:'only-on-failure'},
 webServer:[
  {command:'node ../api/e2e/fixtures/r3y-local-oidc.mjs',
   url:'http://127.0.0.1:3216/__health',timeout:40000,reuseExistingServer:false,
   env:{...process.env,...base,MARKETING_R3Y_STAGING_CI_ONLY:'1'}},
  {command:'node ../api/dist/main.js',
   url:'http://127.0.0.1:3210/readyz',timeout:60000,reuseExistingServer:false,
   env:{...process.env,...base,PORT:'3210',NODE_ENV:'production',
    NODE_EXTRA_CA_CERTS:'/tmp/medsol-r3y-jwks/cert.pem',
    MARKETING_OIDC_JWKS_URL:'https://127.0.0.1:3215/.well-known/jwks.json',
    DATABASE_URL:'postgresql://marketing_r3y_runtime:r3y_disposable_password@localhost:5432/marketing_test?schema=public'
   }},
  {command:'pnpm exec next start --hostname 127.0.0.1 --port 3100',
   url:'http://127.0.0.1:3100',timeout:120000,reuseExistingServer:false,
   env:{...process.env,...base,NODE_ENV:'production',
    MARKETING_SESSION_SECRET:browserOnlyKey,
    MARKETING_API_INTERNAL_URL:'http://127.0.0.1:3210',
    NODE_EXTRA_CA_CERTS:'/tmp/medsol-r3y-jwks/cert.pem',
    MARKETING_PUBLIC_ORIGIN:origin,
    MARKETING_OIDC_CLIENT_ID:'r3y-disposable-browser'
   }},
  {command:'node e2e/fixtures/local-https-proxy.mjs',url:origin,
   ignoreHTTPSErrors:true,timeout:40000,reuseExistingServer:false}
 ]
});
