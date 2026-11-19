import type {ApprovedOAuthProvider}
 from './integration-oauth-lifecycle.service.js';
import type {ApprovedSocialProvider}
 from './official-social-publishing.port.js';

/**
 * Fixed official OAuth authorization endpoint SHAPES for an in-process
 * provider handshake trial. These configs are never deployed as a live
 * broker: fake client IDs, example.invalid callback and no code exchange.
 * Scope entitlement/app review cannot be proven without the provider.
 */
export const TRIAL_OAUTH_CALLBACK='https://marketing.example.org/oauth/callback';
export function officialSocialTrialOAuthConfig(
 provider:ApprovedSocialProvider):ApprovedOAuthProvider{
 if(provider==='META_GRAPH')return{
  providerKey:'META_GRAPH',
  authorizationEndpoint:'https://www.facebook.com/v25.0/dialog/oauth',
  pinnedHostname:'www.facebook.com',
  clientId:'TRIAL_NOT_A_REGISTERED_META_APP',
  redirectUri:TRIAL_OAUTH_CALLBACK,
  scopes:['pages_manage_posts','pages_read_engagement']
 };
 if(provider==='LINKEDIN')return{
  providerKey:'LINKEDIN',
  authorizationEndpoint:'https://www.linkedin.com/oauth/v2/authorization',
  pinnedHostname:'www.linkedin.com',
  clientId:'TRIAL_NOT_A_REGISTERED_LINKEDIN_APP',
  redirectUri:TRIAL_OAUTH_CALLBACK,
  scopes:['w_organization_social','r_organization_social']
 };
 throw new Error('Unsupported OAuth contract trial provider');
}
