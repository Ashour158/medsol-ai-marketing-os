import { describe, expect, it } from 'vitest';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { verifyBootstrapRequest } from './bootstrap-auth.js';

describe('bootstrap authentication', () => {
  const token = 'long-secret-for-test';
  const tenant = 'medsol-tenant';
  it('accepts matching bearer and tenant', () => {
    expect(verifyBootstrapRequest('Bearer '+token, tenant, token, tenant)).toBe(tenant);
  });
  it('rejects missing bearer', () => {
    expect(() => verifyBootstrapRequest(undefined, tenant, token, tenant)).toThrow(UnauthorizedException);
  });
  it('rejects incorrect token', () => {
    expect(() => verifyBootstrapRequest('Bearer wrong', tenant, token, tenant)).toThrow(UnauthorizedException);
  });
  it('rejects cross-tenant access', () => {
    expect(() => verifyBootstrapRequest('Bearer '+token, 'another-tenant', token, tenant)).toThrow(ForbiddenException);
  });
  it('fails closed on missing configuration', () => {
    expect(() => verifyBootstrapRequest('Bearer '+token, tenant, '', tenant)).toThrow('Bootstrap security configuration');
  });
});
