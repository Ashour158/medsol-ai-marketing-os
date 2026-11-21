import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { verifyOidcIdentity } from './oidc-identity.js';
import { jwtVerify } from 'jose';
vi.mock('jose', () => ({ jwtVerify: vi.fn(), createRemoteJWKSet: vi.fn(() => 'keys') }));
const config = { issuer: 'https://login.microsoftonline.com/11111111-1111-4111-8111-111111111111/v2.0', audience: 'marketing-api', jwksUrl: 'https://idp.example/jwks' };
const user = { id: 'u1', email: 'member@example.com', role: 'CMO', oidcSubject: 'entra:11111111-1111-4111-8111-111111111111:22222222-2222-4222-8222-222222222222', disabledAt: null };
const lookup = vi.fn();
const initialEnv={...process.env};
describe('immutable identity binding', () => {
  afterEach(()=>{process.env={...initialEnv};});
  beforeEach(() => { delete process.env.MARKETING_TENANT_RESOLUTION_MODE; process.env.MARKETING_ENTRA_TENANT_ID = '11111111-1111-4111-8111-111111111111'; process.env.MARKETING_ENTRA_API_SCOPE = 'api://api-id/Marketing.Access'; vi.clearAllMocks(); vi.mocked(jwtVerify).mockResolvedValue({ payload: { sub: 'subject-1', tid: '11111111-1111-4111-8111-111111111111', oid: '22222222-2222-4222-8222-222222222222', scp: 'Marketing.Access' } } as any); lookup.mockResolvedValue(user); });
  it('requires a signed organization claim in opt-in multi-org mode',async()=>{
    process.env.MARKETING_TENANT_RESOLUTION_MODE='SIGNED_OIDC_CLAIM';
    const payload={sub:'subject-1',tid:'11111111-1111-4111-8111-111111111111',
     oid:'22222222-2222-4222-8222-222222222222',scp:'Marketing.Access',
     marketing_org_id:'tenant-two'};
    vi.mocked(jwtVerify).mockResolvedValue({payload} as any);
    await expect(verifyOidcIdentity('Bearer valid','',config,lookup))
     .resolves.toMatchObject({organizationId:'tenant-two',userId:'u1'});
    expect(lookup).toHaveBeenCalledWith(user.oidcSubject,'tenant-two');
    lookup.mockClear();
    vi.mocked(jwtVerify).mockResolvedValue({payload:{...payload,marketing_org_id:undefined}} as any);
    await expect(verifyOidcIdentity('Bearer valid','',config,lookup))
     .rejects.toThrow('Verified OIDC organization context');
    expect(lookup).not.toHaveBeenCalled();
    vi.mocked(jwtVerify).mockResolvedValue({payload} as any);
    await expect(verifyOidcIdentity('Bearer valid','different-fixed-org',config,lookup))
     .rejects.toThrow('Verified OIDC organization context');
  });
  it('accepts a matching provisioned subject', async () => {
    await expect(verifyOidcIdentity('Bearer valid', 'tenant', config, lookup)).resolves.toMatchObject({ userId: 'u1', subject: 'entra:11111111-1111-4111-8111-111111111111:22222222-2222-4222-8222-222222222222' });
    expect(lookup).toHaveBeenCalledWith('entra:11111111-1111-4111-8111-111111111111:22222222-2222-4222-8222-222222222222','tenant');
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
  it('denies an incorrect Entra tenant', async () => {
    vi.mocked(jwtVerify).mockResolvedValue({ payload: { sub: 'subject-1', email: 'member@example.com', tid: '33333333-3333-4333-8333-333333333333', oid: '22222222-2222-4222-8222-222222222222' } } as any);
    await expect(verifyOidcIdentity('Bearer valid', 'tenant', config, lookup)).rejects.toThrow('tenant or object identity mismatch');
  });
  it('denies Graph-only and missing delegated Marketing API scope', async () => {
    vi.mocked(jwtVerify).mockResolvedValue({ payload: { tid: '11111111-1111-4111-8111-111111111111', oid: '22222222-2222-4222-8222-222222222222', scp: 'User.Read' } } as any);
    await expect(verifyOidcIdentity('Bearer valid', 'tenant', config, lookup)).rejects.toThrow('Delegated Marketing API scope required');
  });

  it('binds signed staging subject to its original issuer without Entra or email fallback',async()=>{
    const issuer='https://id.staging.medsol.example/realms/medsol';
    process.env.MARKETING_IDENTITY_PROVIDER='STAGING_OIDC';
    process.env.MARKETING_DEPLOYMENT_ENV='staging';
    process.env.MARKETING_STAGING_OIDC_ENABLED='OFFLINE_OPERATOR_TEST_ONLY';
    process.env.MARKETING_TENANT_RESOLUTION_MODE='SIGNED_OIDC_CLAIM';
    process.env.MARKETING_AUTH_MODE='oidc';
    process.env.MARKETING_EXTERNAL_EFFECTS_ENABLED='false';
    process.env.MARKETING_AI_REASONING_ENABLED='false';
    process.env.MARKETING_REAL_EMAIL_ENABLED='false';
    process.env.MARKETING_OIDC_ISSUER=issuer;
    process.env.MARKETING_STAGING_OIDC_TRUSTED_ISSUER=issuer;
    process.env.MARKETING_OIDC_JWKS_URL=issuer+'/protocol/openid-connect/certs';
    process.env.MARKETING_OIDC_CLIENT_ID='staging-browser';
    process.env.MARKETING_OIDC_AUDIENCE='staging-api';
    process.env.MARKETING_STAGING_OIDC_CLIENT_SECRET='operator-stage-secret-dedicated-32-bytes-long';
    delete process.env.MARKETING_BOOTSTRAP_ORGANIZATION_ID;
    const claims={sub:'opaque-user',marketing_org_id:'tenant-stage',scope:'openid marketing'};
    vi.mocked(jwtVerify).mockResolvedValue({payload:claims} as any);
    const subject='staging-oidc:'+encodeURIComponent(issuer)+'|opaque-user';
    lookup.mockResolvedValue({...user,oidcSubject:subject});
    const stageCfg={issuer,audience:'staging-api',jwksUrl:process.env.MARKETING_OIDC_JWKS_URL};
    await expect(verifyOidcIdentity('Bearer signed','',stageCfg,lookup))
     .resolves.toMatchObject({subject,organizationId:'tenant-stage'});
    expect(lookup).toHaveBeenCalledWith(subject,'tenant-stage');
    lookup.mockClear();
    await expect(verifyOidcIdentity('Bearer signed','',{
     ...stageCfg,issuer:'https://evil.example'},lookup)).rejects.toThrow();
    expect(lookup).not.toHaveBeenCalled();
    vi.mocked(jwtVerify).mockResolvedValue({payload:{...claims,scope:'openid profile'}} as any);
    await expect(verifyOidcIdentity('Bearer signed','',stageCfg,lookup))
     .rejects.toThrow('Delegated Marketing API scope required');
  });
  it('requires issuer and audience verification with a signed algorithm allowlist', async () => {
    await verifyOidcIdentity('Bearer valid', 'tenant', config, lookup);
    expect(jwtVerify).toHaveBeenCalledWith('valid', expect.anything(), { issuer: config.issuer, audience: config.audience, algorithms: ['RS256', 'ES256'] });
  });
});
