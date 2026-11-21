/** Strict CI-only local OIDC fixture gate. No external deployment,
 * real provider, arbitrary issuer, remote identity or tenant selector.
 * Both web and API must independently satisfy this exact allowlist.
 */
export function disposableOidcCiAllowed(issuer:unknown,env:Readonly<Record<string,string|undefined>>):boolean{
 if(issuer!=='https://127.0.0.1:3215')return false;
 for(const [key,value] of Object.entries({
  CI:'true',GITHUB_ACTIONS:'true',MARKETING_DB_INTEGRATION:'1',
  MARKETING_R3Y_STAGING_CI_ONLY:'1',MARKETING_DISPOSABLE_OIDC_CI_ONLY:'1',
  MARKETING_AUTH_MODE:'oidc',
  MARKETING_EXTERNAL_EFFECTS_ENABLED:'false',
  MARKETING_AI_REASONING_ENABLED:'false',
  MARKETING_REAL_EMAIL_ENABLED:'false'
 }))if(env[key]!==value)return false;
 if(env.MARKETING_ENTRA_CLIENT_SECRET||env.META_ACCESS_TOKEN||
  env.OPENAI_API_KEY||env.ANTHROPIC_API_KEY||env.GEMINI_API_KEY)
  return false;
 try{
  const url=new URL(env.DATABASE_URL??'');
  return url.protocol==='postgresql:'&&url.hostname==='localhost'&&
   url.pathname==='/marketing_test'&&
   ['marketing_test','marketing_r3y_runtime'].includes(decodeURIComponent(url.username));
 }catch{return false;}
}
