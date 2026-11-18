import { createRemoteJWKSet, jwtVerify } from 'jose';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';

export type VerifiedIdentity = { userId: string; organizationId: string; email: string; role: string; subject: string };
const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export async function verifyOidcIdentity(
  authorization: unknown,
  organizationId: string,
  config: { issuer: string; audience: string; jwksUrl: string },
  lookup: (email: string, organizationId: string) => Promise<{ id: string; email: string; role: string } | null>
): Promise<VerifiedIdentity> {
  if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) throw new UnauthorizedException('Bearer authentication required');
  if (!config.issuer || !config.audience || !config.jwksUrl) throw new Error('Incomplete OIDC configuration');
  let url: URL;
  try { url = new URL(config.jwksUrl); } catch { throw new Error('Invalid JWKS URL'); }
  if (url.protocol !== 'https:') throw new Error('OIDC JWKS must use HTTPS');
  let keys = keySets.get(url.href);
  if (!keys) { keys = createRemoteJWKSet(url); keySets.set(url.href, keys); }
  let payload;
  try {
    ({ payload } = await jwtVerify(authorization.slice(7), keys, { issuer: config.issuer, audience: config.audience, algorithms: ['RS256', 'ES256'] }));
  } catch { throw new UnauthorizedException('Invalid or expired OIDC token'); }
  if (typeof payload.sub !== 'string' || !payload.sub || typeof payload.email !== 'string' || payload.email_verified !== true) {
    throw new UnauthorizedException('Verified email and subject required');
  }
  const user = await lookup(payload.email.toLowerCase(), organizationId);
  if (!user) throw new ForbiddenException('User is not provisioned in this organization');
  return { userId: user.id, organizationId, email: user.email, role: user.role, subject: payload.sub };
}
