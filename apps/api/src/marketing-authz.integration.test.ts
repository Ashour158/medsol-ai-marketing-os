import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { BootstrapAuthGuard } from './bootstrap-auth.guard.js';
import { verifyOidcIdentity } from './oidc-identity.js';
vi.mock('./oidc-identity.js', () => ({ verifyOidcIdentity: vi.fn() }));
const initial = { ...process.env };
const db: any = { user: { findFirst: vi.fn() }, authSession: { findFirst: vi.fn().mockResolvedValue({ id: 'session' }) },$queryRaw:vi.fn().mockResolvedValue([]) };
db.$transaction=vi.fn(async (cb:any)=>cb(db));
const req = (url: string, method = 'GET') => ({ url, method, headers: { authorization: 'Bearer secret', 'x-organization-id': 'tenant', 'x-marketing-session-id': '11111111-1111-4111-8111-111111111111' } as Record<string, unknown>, body: { organizationId: 'tenant' }, identity: undefined as unknown });
const ctx = (request: unknown): any => ({ switchToHttp: () => ({ getRequest: () => request }) });
describe('API-wide permission enforcement', () => {
  beforeEach(() => { process.env.MARKETING_BOOTSTRAP_ORGANIZATION_ID = 'tenant'; process.env.MARKETING_BOOTSTRAP_TOKEN = 'secret'; process.env.MARKETING_AUTH_MODE = 'bootstrap'; vi.clearAllMocks(); });
  afterEach(() => { process.env = { ...initial }; });
  it('bootstrap token may read portfolio but cannot execute workflows', async () => {
    const guard = new BootstrapAuthGuard(db,{assertActorPermission:vi.fn().mockResolvedValue(undefined)} as any);
    await expect(guard.canActivate(ctx(req('/marketing/overview')))).resolves.toBe(true);
    await expect(guard.canActivate(ctx(req('/marketing/workflows', 'POST')))).rejects.toThrow('limited to portfolio');
  });
  it('bootstrap pilot cannot read or write creative asset metadata without OIDC',async()=>{
    const guard=new BootstrapAuthGuard(db,{assertActorPermission:vi.fn()} as any);
    await expect(guard.canActivate(ctx(req('/marketing/assets'))))
      .rejects.toThrow('require verified OIDC identity');
    await expect(guard.canActivate(ctx(req('/marketing/assets','POST'))))
      .rejects.toThrow('require verified OIDC identity');
  });
    it('refuses all sandbox publication routes in bootstrap pilot mode', async()=>{
    const guard=new BootstrapAuthGuard(db,{assertActorPermission:vi.fn()} as any);
    await expect(guard.canActivate(ctx(req('/marketing/publications'))))
     .rejects.toThrow('require verified OIDC identity');
    await expect(guard.canActivate(ctx(req('/marketing/publications','POST'))))
     .rejects.toThrow('require verified OIDC identity');
    await expect(guard.canActivate(ctx(req('/marketing/publications/intent-1/simulate','POST'))))
     .rejects.toThrow('require verified OIDC identity');
  });
  it('bootstrap cannot register integrations or view/forge verified media proof',async()=>{
    const guard=new BootstrapAuthGuard(db,{assertActorPermission:vi.fn()} as any);
    for(const route of ['/marketing/integrations','/marketing/integrations/catalog',
      '/marketing/media/evidence','/marketing/media/evidence/revision-1']){
      await expect(guard.canActivate(ctx(req(route)))).rejects.toThrow('require verified OIDC identity');
    }
    await expect(guard.canActivate(ctx(req('/marketing/integrations','POST'))))
     .rejects.toThrow('require verified OIDC identity');
    await expect(guard.canActivate(ctx(req('/marketing/media/evidence/revision-1/revoke','POST'))))
     .rejects.toThrow('require verified OIDC identity');
  });
  it('bootstrap cannot inspect approval inbox or campaign audit history', async () => {
    const guard = new BootstrapAuthGuard(db,{assertActorPermission:vi.fn().mockResolvedValue(undefined)} as any);
    await expect(guard.canActivate(ctx(req('/marketing/approvals/pending')))).rejects.toThrow('limited to portfolio');
    await expect(guard.canActivate(ctx(req('/marketing/campaigns/secret')))).rejects.toThrow('limited to portfolio');
  });
  it('OIDC user role cannot create or transition campaigns', async () => {
    process.env.MARKETING_AUTH_MODE = 'oidc';
    vi.mocked(verifyOidcIdentity).mockResolvedValue({ userId: 'u', organizationId: 'tenant', email: 'u@example.com', role: 'USER', subject: 'sub' });
    const guard = new BootstrapAuthGuard(db,{assertActorPermission:vi.fn().mockResolvedValue(undefined)} as any);
    await expect(guard.canActivate(ctx(req('/marketing/campaigns', 'POST')))).rejects.toThrow('MANAGE_CAMPAIGN');
    await expect(guard.canActivate(ctx(req('/marketing/campaigns/transition', 'POST')))).rejects.toThrow('MANAGE_CAMPAIGN');
  });
  it('denies revoked or missing server sessions even with a valid OIDC token', async () => {
    process.env.MARKETING_AUTH_MODE = 'oidc';
    vi.mocked(verifyOidcIdentity).mockResolvedValue({ userId: 'cmo', organizationId: 'tenant', email: 'cmo@example.com', role: 'CMO', subject: 'sub' });
    db.authSession.findFirst.mockResolvedValueOnce(null);
    const guard = new BootstrapAuthGuard(db,{assertActorPermission:vi.fn().mockResolvedValue(undefined)} as any);
    await expect(guard.canActivate(ctx(req('/marketing/campaigns', 'POST')))).rejects.toThrow('Session expired or revoked');
    const noSession = req('/marketing/overview');
    delete noSession.headers['x-marketing-session-id'];
    await expect(guard.canActivate(ctx(noSession))).rejects.toThrow('Active server session required');
  });
  it('OIDC manager may manage campaigns and approval decisions', async () => {
    process.env.MARKETING_AUTH_MODE = 'oidc';
    vi.mocked(verifyOidcIdentity).mockResolvedValue({ userId: 'cmo', organizationId: 'tenant', email: 'cmo@example.com', role: 'CMO', subject: 'sub' });
    const guard = new BootstrapAuthGuard(db,{assertActorPermission:vi.fn().mockResolvedValue(undefined)} as any);
    await expect(guard.canActivate(ctx(req('/marketing/campaigns', 'POST')))).resolves.toBe(true);
    await expect(guard.canActivate(ctx(req('/marketing/approvals/decide', 'POST')))).resolves.toBe(true);
  });
});
