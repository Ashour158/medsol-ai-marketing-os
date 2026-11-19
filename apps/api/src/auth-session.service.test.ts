import { describe, expect, it, vi } from 'vitest';
import { AuthSessionService } from './auth-session.service.js';

const fixture = () => {
  const db: any = { authSession: { create: vi.fn().mockResolvedValue({}), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },$queryRaw:vi.fn().mockResolvedValue([]) };
  db.$transaction=vi.fn(async (cb:any)=>cb(db));
  return { db, service: new AuthSessionService(db) };
};
describe('authoritative revocable session', () => {
  it('rejects expired and excessively long sessions', async () => {
    const { service } = fixture();
    await expect(service.register('tenant', 'user', Date.now() - 1000)).rejects.toThrow('Invalid session expiry');
    await expect(service.register('tenant', 'user', Date.now() + 7200000)).rejects.toThrow('Invalid session expiry');
  });
  it('creates a tenant-owned session with bounded expiry', async () => {
    const { db, service } = fixture();
    const expiry = Date.now() + 600000;
    const session = await service.register('tenant', 'user', expiry);
    expect(session.sessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(db.authSession.create).toHaveBeenCalledWith({ data: { id: session.sessionId, organizationId: 'tenant', userId: 'user', expiresAt: new Date(expiry) } });
  });
  it('revokes only the caller-owned session', async () => {
    const { db, service } = fixture();
    await expect(service.revoke('tenant', 'user', 'session')).resolves.toEqual({ revoked: true });
    expect(db.authSession.updateMany).toHaveBeenCalledWith({ where: { id: 'session', organizationId: 'tenant', userId: 'user', revokedAt: null }, data: { revokedAt: expect.any(Date) } });
    db.authSession.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.revoke('tenant', 'user', 'foreign')).rejects.toThrow('Session not active');
  });
});
