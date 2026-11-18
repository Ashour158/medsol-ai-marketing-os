import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { BootstrapAuthGuard } from './bootstrap-auth.guard.js';
import { verifyOidcIdentity } from './oidc-identity.js';

vi.mock('./oidc-identity.js', () => ({ verifyOidcIdentity: vi.fn() }));
const original = { ...process.env };
function context(req: any): any { return { switchToHttp: () => ({ getRequest: () => req }) }; }
function request(url: string, body: any = { organizationId: 'org-1' }) {
  return { url, method: 'POST', headers: { authorization: 'Bearer pilot-token', 'x-organization-id': 'org-1' } as Record<string, unknown>, body };
}
describe('authentication and approval authority', () => {
  beforeEach(() => { process.env.MARKETING_BOOTSTRAP_ORGANIZATION_ID = 'org-1'; process.env.MARKETING_BOOTSTRAP_TOKEN = 'pilot-token'; process.env.MARKETING_AUTH_MODE = 'bootstrap'; vi.clearAllMocks(); });
  afterEach(() => { process.env = { ...original }; });
  const db: any = { user: { findFirst: vi.fn() } };
  it('rejects human approval with a shared bootstrap credential', async () => {
    const guard = new BootstrapAuthGuard(db);
    await expect(guard.canActivate(context(request('/marketing/approvals/decide')))).rejects.toThrow('limited to portfolio');
  });
  it('prevents cross-tenant bootstrap requests', async () => {
    const guard = new BootstrapAuthGuard(db);
    await expect(guard.canActivate(context(request('/marketing/agents', { organizationId: 'other-org' })))).rejects.toThrow('Cross-tenant');
  });
  it('binds a verified OIDC identity to the request and tenant', async () => {
    process.env.MARKETING_AUTH_MODE = 'oidc';
    vi.mocked(verifyOidcIdentity).mockResolvedValue({ userId: 'u-1', organizationId: 'org-1', email: 'reviewer@example.com', role: 'CMO', subject: 'oidc-sub' });
    const req = request('/marketing/approvals/decide');
    const guard = new BootstrapAuthGuard(db);
    await expect(guard.canActivate(context(req))).resolves.toBe(true);
    expect((req as any).identity.userId).toBe('u-1');
  });
  it('rejects unsupported auth modes', async () => {
    process.env.MARKETING_AUTH_MODE = 'unsafe';
    await expect(new BootstrapAuthGuard(db).canActivate(context(request('/marketing/agents')))).rejects.toThrow('Unsupported authentication mode');
  });
});
