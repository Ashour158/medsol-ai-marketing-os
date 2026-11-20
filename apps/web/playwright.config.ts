import {defineConfig,devices} from '@playwright/test';
import {createHash} from 'node:crypto';

// Only the browser test process uses this deterministic disposable key.
// Production code never imports this config or accepts it as a runtime default.
const browserOnlyKey=createHash('sha256')
 .update('Medsol R3-V Chromium simulation only; never a production secret')
 .digest('base64url');
process.env.MARKETING_SESSION_SECRET=browserOnlyKey;
const tenantGuid='11111111-1111-4111-8111-111111111111';
const origin='http://localhost:3100';

export default defineConfig({
 testDir:'./e2e',
 testMatch:'**/*.pw.ts',
 fullyParallel:false,
 workers:1,
 retries:0,
 timeout:35000,
 expect:{timeout:10000},
 reporter:[['list'],['html',{open:'never',outputFolder:'playwright-report'}]],
 outputDir:'test-results',
 use:{
  ...devices['Desktop Chrome'],browserName:'chromium',
  baseURL:origin,trace:'retain-on-failure',screenshot:'only-on-failure'
 },
 webServer:[
  {
   command:'node e2e/fixtures/simulated-upstream.mjs',
   url:'http://127.0.0.1:3209/__health',
   timeout:30000,reuseExistingServer:false,
  },
  {
   command:'pnpm exec next start --hostname localhost --port 3100',
   url:origin,
   timeout:120000,reuseExistingServer:false,
   env:{
    ...process.env,
    MARKETING_SESSION_SECRET:browserOnlyKey,
    MARKETING_API_INTERNAL_URL:'http://127.0.0.1:3209',
    MARKETING_PUBLIC_ORIGIN:origin,
    MARKETING_BOOTSTRAP_ORGANIZATION_ID:'tenant-a',
    MARKETING_ENTRA_TENANT_ID:tenantGuid,
    MARKETING_OIDC_ISSUER:'https://login.microsoftonline.com/'+tenantGuid+'/v2.0',
    MARKETING_OIDC_CLIENT_ID:'r3v-disposable-ui',
    MARKETING_ENTRA_API_SCOPE:'api://medsol-r3v/marketing',
    MARKETING_AUTH_MODE:'oidc',
    MARKETING_ENTRA_CLIENT_SECRET:'',
   }
  }
 ]
});
