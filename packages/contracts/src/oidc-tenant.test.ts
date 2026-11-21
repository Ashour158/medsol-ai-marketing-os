import {describe,it,expect} from 'vitest';
import {marketingTenantResolutionMode,resolveMarketingOrganizationId}
 from './oidc-tenant.js';
describe('authoritative OIDC organization resolution policy',()=>{
 it('retains the explicit fixed tenant by default',()=>{
  expect(marketingTenantResolutionMode(undefined)).toBe('FIXED');
  expect(resolveMarketingOrganizationId({marketing_org_id:'ignored'},'tenant-fixed','FIXED'))
   .toBe('tenant-fixed');
  expect(()=>resolveMarketingOrganizationId({},'', 'FIXED')).toThrow();
 });
 it('selects tenant only from previously verified signed custom claims',()=>{
  expect(marketingTenantResolutionMode('SIGNED_OIDC_CLAIM')).toBe('SIGNED_OIDC_CLAIM');
  expect(resolveMarketingOrganizationId({marketing_org_id:'tenant-one'},undefined,
   'SIGNED_OIDC_CLAIM')).toBe('tenant-one');
  for(const wrong of [undefined,'',null,'../evil','tenant/other',55,{},'x'.repeat(129)])
   expect(()=>resolveMarketingOrganizationId({marketing_org_id:wrong},undefined,
    'SIGNED_OIDC_CLAIM')).toThrow('Valid signed');
 });
 it('rejects ambiguous fixed and dynamic mode, and unknown mode',()=>{
  expect(()=>resolveMarketingOrganizationId({marketing_org_id:'tenant-one'},
   'tenant-two','SIGNED_OIDC_CLAIM')).toThrow('cannot share');
  expect(()=>marketingTenantResolutionMode('CLIENT_HEADER')).toThrow();
  expect(()=>resolveMarketingOrganizationId({marketing_org_id:'tenant-one'},
   undefined,'CLIENT_HEADER' as 'FIXED')).toThrow();
 });
});
