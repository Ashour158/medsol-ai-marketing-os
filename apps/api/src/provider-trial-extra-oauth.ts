import type {ApprovedOAuthProvider}
 from './integration-oauth-lifecycle.service.js';
import {TRIAL_FAKE_TOKEN,type TrialWireRequest}
 from './provider-trial-wire.js';

/**
 * Exact authorization endpoint shapes; fake app IDs, fake redirect, no
 * browser redirects, network, auth codes or customer accounts.
 * PKCE starts/claims via the existing IntegrationOAuthLifecycleService.
 * Adobe Firefly is *server-to-server*, never a forged user OAuth grant.
 */
export const EXTRA_TRIAL_OAUTH_PROVIDERS=[
 'INSTAGRAM','TIKTOK','YOUTUBE','X_API','CANVA'
] as const;
export type ExtraTrialOAuthProvider=typeof EXTRA_TRIAL_OAUTH_PROVIDERS[number];
const callback='https://marketing.example.org/oauth/callback';
export function extraTrialOAuthConfig(key:ExtraTrialOAuthProvider):
 ApprovedOAuthProvider{
 switch(key){
  case 'INSTAGRAM':return{
   providerKey:key,authorizationEndpoint:'https://www.instagram.com/oauth/authorize',
   pinnedHostname:'www.instagram.com',
   clientId:'TRIAL_INSTAGRAM_APP_NOT_REGISTERED',redirectUri:callback,
   scopes:['instagram_business_basic','instagram_business_content_publishing'],
   scopeDelimiter:'COMMA'
  };
  case 'TIKTOK':return{
   providerKey:key,authorizationEndpoint:'https://www.tiktok.com/v2/auth/authorize/',
   pinnedHostname:'www.tiktok.com',
   clientId:'TRIAL_TIKTOK_CLIENT_KEY_NOT_REGISTERED',redirectUri:callback,
   scopes:['user.info.basic','video.publish'],
   clientIdQueryParam:'client_key',scopeDelimiter:'COMMA'
  };
  case 'YOUTUBE':return{
   providerKey:key,
   authorizationEndpoint:'https://accounts.google.com/o/oauth2/v2/auth',
   pinnedHostname:'accounts.google.com',
   clientId:'TRIAL_GOOGLE_OAUTH_CLIENT_NOT_REGISTERED',redirectUri:callback,
   scopes:['https://www.googleapis.com/auth/youtube.upload']
  };
  case 'X_API':return{
   providerKey:key,
   authorizationEndpoint:'https://twitter.com/i/oauth2/authorize',
   pinnedHostname:'twitter.com',
   clientId:'TRIAL_X_CLIENT_ID_NOT_REGISTERED',redirectUri:callback,
   scopes:['tweet.read','tweet.write','users.read','media.write']
  };
  case 'CANVA':return{
   providerKey:key,
   authorizationEndpoint:'https://www.canva.com/api/oauth/authorize',
   pinnedHostname:'www.canva.com',
   clientId:'TRIAL_CANVA_CLIENT_ID_NOT_REGISTERED',redirectUri:callback,
   scopes:['design:content:read','design:content:write']
  };
 }
}
export const ADOBE_TRIAL_AUTH_CONTRACT={
 authorizationModel:'OAUTH_SERVER_TO_SERVER' as const,
 tokenEndpoint:'https://ims-na1.adobelogin.com/ims/token/v3',
 scope:'firefly_api,ff_apis'
};
/** Local-only OAuth client-credentials request *shape*, never a real token. */
export function buildAdobeTrialTokenRequest():TrialWireRequest{
 return{method:'POST',url:ADOBE_TRIAL_AUTH_CONTRACT.tokenEndpoint,
  headers:{'content-type':'application/x-www-form-urlencoded',
   accept:'application/json'},body:{
    grant_type:'client_credentials',
    client_id:'TRIAL_ADOBE_PROJECT_NOT_REGISTERED',
    client_secret:'TRIAL_ONLY_SECRET_NOT_REAL',
    scope:ADOBE_TRIAL_AUTH_CONTRACT.scope
   }};
}
export function parseAdobeTrialToken(raw:unknown){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))
  throw new Error('Adobe IMS token response must be an object');
 const x=raw as Record<string,unknown>;
 if(x.access_token!==TRIAL_FAKE_TOKEN||x.token_type!=='bearer'||
   !Number.isSafeInteger(x.expires_in)||(x.expires_in as number)<60)
  throw new Error('Adobe trial token response did not match expected synthetic credentials');
 return{syntheticOnly:true,storedCredentials:0,realProviderCalls:0,
  externalEffectsAuthorized:false};
}
