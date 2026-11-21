/** Canonical tenant-resolution policy shared by web OIDC callback and Nest
 * access-token verification. The signed claim is never read from a request
 * header, query, body or unverified JWT payload.
 */
export type MarketingTenantResolutionMode='FIXED'|'SIGNED_OIDC_CLAIM';
export const MARKETING_SIGNED_ORG_CLAIM='marketing_org_id' as const;
export function marketingTenantResolutionMode(raw:unknown):MarketingTenantResolutionMode{
 if(raw===undefined||raw===null||raw===''||raw==='FIXED')return 'FIXED';
 if(raw==='SIGNED_OIDC_CLAIM')return 'SIGNED_OIDC_CLAIM';
 throw new Error('Unsupported marketing tenant resolution mode');
}
const tenantId=(raw:unknown):raw is string=>typeof raw==='string'&&
 /^[A-Za-z0-9_-]{1,128}$/.test(raw);
export function resolveMarketingOrganizationId(
 verifiedSignedClaims:Record<string,unknown>,
 configuredFixedTenant:unknown,
 mode:MarketingTenantResolutionMode
):string{
 if(mode==='FIXED'){
  if(!tenantId(configuredFixedTenant))
   throw new Error('Fixed marketing organization must be configured');
  return configuredFixedTenant;
 }
 if(mode!=='SIGNED_OIDC_CLAIM')throw new Error('Unknown organization resolution policy');
 if(configuredFixedTenant!==undefined&&configuredFixedTenant!==null&&
  configuredFixedTenant!=='')
  throw new Error('Signed-claim tenancy cannot share a fixed organization configuration');
 const claim=verifiedSignedClaims[MARKETING_SIGNED_ORG_CLAIM];
 if(!tenantId(claim))throw new Error('Valid signed OIDC organization claim required');
 return claim;
}
