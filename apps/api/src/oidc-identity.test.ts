import { describe, expect, it, vi, beforeEach } from 'vitest';
import { verifyOidcIdentity } from './oidc-identity.js';
import { jwtVerify, createRemoteJWKSet } from 'jose';
vi.mock('jose', () => ({ jwtVerify: vi.fn(), createRemoteJWKSet: vi.fn(() => 'keys') }));
const config = { issuer: 'https://idp.example', audience: 'marketing-api', jwksUrl: 'https://idp.example/jwks' };
const user = { id: 'u1', email: 'member@example.com', role: 'CMO', oidcSubject: 'subject-1', disabledAt: null };
const lookup = vi.fn();
describe('immutable identity binding', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(jwtVerify).mockResolvedValue({ payload: { sub: 'subject-1', email: 'member@example.com', email_verified: true } } as any); lookup.mockResolvedValue(user); });
  it('accepts a matching provisioned subject', async () => {
    await expect(verifyOidcIdentity('Bearer valid', 'tenant', config, lookup)).resolves.toMatchObject({ userId: 'u1', subject: 'subject-1' });
    expect(lookup).toHaveBeenCalledWith('member@example.com','tenant');
  });
  it('denies email-based account takeover by a different subject', async () => {
    lookup.mockResolvedValue({ ...user, oidcSubject: 'other-subject' });
    await expect(verifyOidcIdentity('Bearer valid', 'tenant', config, lookup)).rejects.toThrow('subject is not bound');
  });
  it('denies unbound identities and disabled accounts', async () => {
    lookup.mockResolvedValue({ ...user, oidcSubject: null });
    await expect(verifyOidcIdentity('Bearer valid', 'tenant', config, lookup)).rejects.toThrow('subject is not bound');
    lookup.mockResolvedValue({ ...user, disabledAt: new Date() });
    await expect(verifyOidcIdentity('Bearer valid', 'tenant', config, lookup)).rejects.toThrow('not active');
  });
  it('denies an unverified email', async () => {
    vi.mocked(jwtVerify).mockResolvedValue({ payload: { sub: 'subject-1', email: 'member@example.com', email_verified: false } } as any);
    await expect(verifyOidcIdentity('Bearer valid', 'tenant', config, lookup)).rejects.toThrow('Verified email');
  });
  it('requires issuer and audience verification with a signed algorithm allowlist', async () => {
    await verifyOidcIdentity('Bearer valid', 'tenant', config, lookup);
    expect(jwtVerify).toHaveBeenCalledWith('valid', expect.anything(), { issuer: config.issuer, audience: config.audience, algorithms: ['RS256', 'ES256'] });
    expect(createRemoteJWKSet).toHaveBeenCalled();
  });
});
