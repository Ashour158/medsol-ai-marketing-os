import { describe, expect, it } from 'vitest';
import { hasMarketingPermission, permissionForMarketingRoute, assertMarketingPermission } from './marketing-permissions.js';
import type { VerifiedIdentity } from './oidc-identity.js';
const identity = (role: string): VerifiedIdentity => ({ userId: 'u', organizationId: 'tenant', email: 'u@example.com', subject: 'sub', role });
describe('centralized marketing authorization', () => {
  it('denies all permissions to unverified callers', () => {
    for (const p of ['READ_PORTFOLIO','READ_APPROVALS','READ_AUDIT','ASSESS','EXECUTE_WORKFLOW','RESUME_WORKFLOW','MANAGE_CAMPAIGN','MANAGE_OBJECTIVE','DECIDE_APPROVAL'] as const) {
      expect(hasMarketingPermission(undefined,p)).toBe(false);
    }
  });
  it('prevents analysts and specialists from approving or viewing sensitive approvals', () => {
    for (const role of ['ANALYST','USER','VIEWER','MARKETING_SPECIALIST']) {
      expect(hasMarketingPermission(identity(role),'DECIDE_APPROVAL')).toBe(false);
      expect(hasMarketingPermission(identity(role),'READ_APPROVALS')).toBe(false);
      expect(hasMarketingPermission(identity(role),'READ_AUDIT')).toBe(false);
    }
  });
  it('permits a provisioned CMO to manage campaigns and approvals', () => {
    expect(hasMarketingPermission(identity('CMO'),'MANAGE_CAMPAIGN')).toBe(true);
    expect(hasMarketingPermission(identity('CMO'),'DECIDE_APPROVAL')).toBe(true);
  });
  it('rejects unknown routes and methods', () => {
    expect(() => permissionForMarketingRoute('DELETE','/marketing/campaigns')).toThrow('permission registry');
    expect(() => permissionForMarketingRoute('POST','/marketing/agents')).toThrow('permission registry');
  });
  it('requires distinct permissions for approval, workflow recovery and campaign audit', () => {
    expect(permissionForMarketingRoute('POST','/marketing/approvals/decide')).toBe('DECIDE_APPROVAL');
    expect(permissionForMarketingRoute('POST','/marketing/workflows/abc/resume')).toBe('RESUME_WORKFLOW');
    expect(permissionForMarketingRoute('GET','/marketing/campaigns/abc')).toBe('READ_AUDIT');
    expect(permissionForMarketingRoute('GET','/marketing/journeys/abc/dossier')).toBe('READ_AUDIT');
    expect(hasMarketingPermission(identity('VIEWER'),'READ_AUDIT')).toBe(false);
    expect(() => assertMarketingPermission(identity('USER'),'MANAGE_OBJECTIVE')).toThrow('permission denied');
  });
});
