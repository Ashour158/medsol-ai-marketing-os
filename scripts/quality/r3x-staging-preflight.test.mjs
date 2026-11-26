import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertDisposableStaging} from './r3x-staging-preflight.mjs';
const base=()=>({
 CI:'true',GITHUB_ACTIONS:'true',MARKETING_R3X_PREFLIGHT_CI_ONLY:'1',
 MARKETING_DB_INTEGRATION:'1',GITHUB_RUN_ID:'123456',
 DATABASE_URL:'postgresql://marketing_test:secret@localhost:5432/marketing_test?schema=public'
});
const census=()=>({
 schema:'medsol-r3n-postgresql-tenant-rls-inventory-v1',
 runId:'123456',releaseVerdict:'NOT_CERTIFIED',
 status:'DISPOSABLE_CI_INVENTORY_PASSED',
 uncoveredTenantTableCount:0,tenantTableCount:47,forceRlsTenantTableCount:47
});
test('R3X permits only disposable offline CI and emits no secrets or signoff',()=>{
 const manifest=assertDisposableStaging(base(),census());
 assert.equal(manifest.productionReady,false);
 assert.equal(manifest.externalProviderCredentialsPresent,false);
 assert.equal(manifest.database.forceRlsTables,46);
 assert.equal(JSON.stringify(manifest).includes('secret'),false);
});
test('R3X rejects customer and public network database URLs',()=>{
 for(const bad of [
  'postgresql://marketing_test:x@db.prod.internal:5432/marketing_test?schema=public',
  'postgresql://marketing_test:x@localhost:5432/customer_db?schema=public',
  'postgresql://postgres:x@localhost:5432/marketing_test?schema=public'
 ]){
  assert.throws(()=>assertDisposableStaging({...base(),DATABASE_URL:bad},census()),/BLOCKED/);
 }
});
test('R3X refuses real AI, Entra, SMTP and social credentials even if egress disabled',()=>{
 for(const key of ['OPENAI_API_KEY','MARKETING_ENTRA_CLIENT_SECRET',
  'SMTP_PASSWORD','META_ACCESS_TOKEN','MARKETING_RELEASE_TRUST_KEYS_JSON']){
  assert.throws(()=>assertDisposableStaging({...base(),[key]:'danger'},census()),new RegExp(key));
 }
});
test('R3X refuses live-effect toggles and production contexts',()=>{
 assert.throws(()=>assertDisposableStaging({...base(),MARKETING_AI_REASONING_ENABLED:'true'},census()),/switch enabled/);
 assert.throws(()=>assertDisposableStaging({...base(),NODE_ENV:'production'},census()),/production/);
 assert.throws(()=>assertDisposableStaging({...base(),CI:'false'},census()),/GitHub/);
});
test('R3X refuses fake, missing or failed actual FORCE RLS coverage',()=>{
 for(const patch of [
  {uncoveredTenantTableCount:1},{tenantTableCount:45},{forceRlsTenantTableCount:45},
  {runId:'another-run'},{status:'NOT_A_CENSUS'}]){
  assert.throws(()=>assertDisposableStaging(base(),{...census(),...patch}),/FORCE RLS/);
 }
});
