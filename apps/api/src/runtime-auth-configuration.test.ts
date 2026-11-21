import {describe,it,expect} from 'vitest';
import {assertStartupAuthConfiguration} from './runtime-auth-configuration.js';
const base:Record<string,string>={
 NODE_ENV:'production',MARKETING_AUTH_MODE:'oidc',
 MARKETING_OIDC_ISSUER:'https://login.microsoftonline.com/11111111-1111-4111-8111-111111111111/v2.0',
 MARKETING_OIDC_AUDIENCE:'api://medsol',
 MARKETING_OIDC_JWKS_URL:'https://login.microsoftonline.com/common/discovery/keys',
 MARKETING_BOOTSTRAP_ORGANIZATION_ID:'tenant-a'
};
describe('T1E real Nest bootstrap tenancy mode fail-closed validation',()=>{
 it('keeps original fixed-tenant Entra startup strict',()=>{
  expect(()=>assertStartupAuthConfiguration(base)).not.toThrow();
  expect(()=>assertStartupAuthConfiguration({...base,MARKETING_BOOTSTRAP_ORGANIZATION_ID:''}))
   .toThrow('Fixed tenant');
 });
 it('unblocks individually signed tenant IDs without installing a shadow fixed tenant',()=>{
  const multi={...base,MARKETING_TENANT_RESOLUTION_MODE:'SIGNED_OIDC_CLAIM',
   MARKETING_BOOTSTRAP_ORGANIZATION_ID:''};
  expect(()=>assertStartupAuthConfiguration(multi)).not.toThrow();
  expect(()=>assertStartupAuthConfiguration({...multi,MARKETING_BOOTSTRAP_ORGANIZATION_ID:'org-b'}))
   .toThrow('fixed tenant');
  expect(()=>assertStartupAuthConfiguration({...multi,MARKETING_BOOTSTRAP_TOKEN:'shared'}))
   .toThrow('bootstrap token');
  expect(()=>assertStartupAuthConfiguration({...multi,MARKETING_AUTH_MODE:'bootstrap'}))
   .toThrow('Production requires OIDC');
 });
 it('rejects unknown auth modes and incomplete API trust',()=>{
  expect(()=>assertStartupAuthConfiguration({...base,MARKETING_AUTH_MODE:'unsafe'})).toThrow();
  expect(()=>assertStartupAuthConfiguration({...base,MARKETING_OIDC_JWKS_URL:''}))
   .toThrow('OIDC configuration required');
  expect(()=>assertStartupAuthConfiguration({...base,MARKETING_IDENTITY_PROVIDER:'STAGING_OIDC'}))
   .toThrow();
 });
});
