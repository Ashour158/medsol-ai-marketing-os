import {describe,it,expect} from 'vitest';
import {disposableOidcCiAllowed} from './disposable-oidc.js';
const safe:Record<string,string>={
 CI:'true',GITHUB_ACTIONS:'true',MARKETING_DB_INTEGRATION:'1',
 MARKETING_R3Y_STAGING_CI_ONLY:'1',MARKETING_DISPOSABLE_OIDC_CI_ONLY:'1',
 MARKETING_AUTH_MODE:'oidc',MARKETING_EXTERNAL_EFFECTS_ENABLED:'false',
 MARKETING_AI_REASONING_ENABLED:'false',MARKETING_REAL_EMAIL_ENABLED:'false',
 DATABASE_URL:'postgresql://marketing_r3y_runtime:disposable@localhost:5432/marketing_test?schema=public'
};
describe('T1D explicit CI-only disposable OIDC trust boundary',()=>{
 it('permits only the exact ephemeral loopback issuer and disposable PG',()=>{
  expect(disposableOidcCiAllowed('https://127.0.0.1:3215',safe)).toBe(true);
  for(const issuer of ['https://127.0.0.1:3216','https://localhost:3215',
   'https://login.microsoftonline.com/evil','http://127.0.0.1:3215'])
   expect(disposableOidcCiAllowed(issuer,safe)).toBe(false);
 });
 it('fails closed for non-CI, real credentials, effectful flags or live DB',()=>{
  for(const [key,value] of Object.entries({
   GITHUB_ACTIONS:'false',CI:'false',MARKETING_DB_INTEGRATION:'0',
   MARKETING_DISPOSABLE_OIDC_CI_ONLY:'0',MARKETING_AUTH_MODE:'bootstrap',
   MARKETING_EXTERNAL_EFFECTS_ENABLED:'true',
   MARKETING_AI_REASONING_ENABLED:'true',MARKETING_REAL_EMAIL_ENABLED:'true',
   DATABASE_URL:'postgresql://marketing_app:pw@production-host:5432/live'
  })){
   expect(disposableOidcCiAllowed('https://127.0.0.1:3215',{...safe,[key]:value}),
    key).toBe(false);
  }
  for(const key of ['MARKETING_ENTRA_CLIENT_SECRET','META_ACCESS_TOKEN',
   'OPENAI_API_KEY','ANTHROPIC_API_KEY','GEMINI_API_KEY']){
   expect(disposableOidcCiAllowed('https://127.0.0.1:3215',{
    ...safe,[key]:'LIVE-SECRET'}),key).toBe(false);
  }
 });
});
