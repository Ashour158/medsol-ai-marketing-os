import {marketingTenantResolutionMode,marketingIdentityProvider,pinnedStagingIssuer}
 from '@medsol/contracts';

/** Single startup trust policy, shared by fixed-Entra, signed-Entra and
 * STAGING_OIDC. Never manufactures a bootstrap tenant for signed claim mode.
 */
export function assertStartupAuthConfiguration(env:Readonly<Record<string,string|undefined>>){
 const auth=env.MARKETING_AUTH_MODE??'bootstrap';
 const mode=marketingTenantResolutionMode(env.MARKETING_TENANT_RESOLUTION_MODE);
 if(env.NODE_ENV==='production'&&auth!=='oidc')
  throw new Error('Production requires OIDC authentication');
 if(auth!=='bootstrap'&&auth!=='oidc')
  throw new Error('Unsupported authentication mode');
 if(mode==='FIXED'){
  if(!env.MARKETING_BOOTSTRAP_ORGANIZATION_ID)
   throw new Error('Fixed tenant configuration required');
 }else{
  if(auth!=='oidc')
   throw new Error('Signed-claim tenancy requires verified OIDC');
  if(env.MARKETING_BOOTSTRAP_ORGANIZATION_ID||env.MARKETING_BOOTSTRAP_TOKEN)
   throw new Error('Signed-claim tenancy cannot use a fixed tenant or bootstrap token');
 }
 if(auth==='bootstrap'&&!env.MARKETING_BOOTSTRAP_TOKEN)
  throw new Error('Bootstrap token required');
 if(auth==='oidc'&&(!env.MARKETING_OIDC_ISSUER||
    !env.MARKETING_OIDC_AUDIENCE||!env.MARKETING_OIDC_JWKS_URL))
  throw new Error('OIDC configuration required');
 if(marketingIdentityProvider(env.MARKETING_IDENTITY_PROVIDER)==='STAGING_OIDC')
  pinnedStagingIssuer(env);
}
