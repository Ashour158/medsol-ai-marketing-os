import { createRemoteJWKSet, jwtVerify } from 'jose';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import {marketingTenantResolutionMode,resolveMarketingOrganizationId} from '@medsol/contracts';
import { entraSubject, entraTenantId, entraIssuer } from './entra-identity.js';

export type VerifiedIdentity = { userId: string; organizationId: string; email: string; role: string; subject: string };
const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export async function verifyOidcIdentity(
  authorization: unknown,
  organizationId: string,
  config: { issuer: string; audience: string; jwksUrl: string },
  lookup: (subject: string, organizationId: string) => Promise<{ id: string; email: string; role: string; oidcSubject: string | null; disabledAt: Date | null } | null>
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
  const tenant = entraTenantId();
  if (config.issuer !== entraIssuer(tenant)) throw new Error('Microsoft Entra issuer mismatch');
  const subject = entraSubject(payload, tenant);
  const requiredScope = process.env.MARKETING_ENTRA_API_SCOPE?.split('/').at(-1);
  if (!requiredScope || typeof payload.scp !== 'string' || !payload.scp.split(' ').includes(requiredScope)) throw new ForbiddenException('Delegated Marketing API scope required');
  // Signed tenant claim is considered only AFTER jose validates issuer/audience,
  // token signature, expiry and delegated scope. The DB membership remains decisive.
  let verifiedOrganizationId:string;
  try{verifiedOrganizationId=resolveMarketingOrganizationId(payload,organizationId,
   marketingTenantResolutionMode(process.env.MARKETING_TENANT_RESOLUTION_MODE));}
  catch{throw new UnauthorizedException('Verified OIDC organization context required');}
  const user = await lookup(subject, verifiedOrganizationId);
  if (!user || user.disabledAt) throw new ForbiddenException('User is not active in this organization');
  if (!user.oidcSubject || user.oidcSubject !== subject) throw new ForbiddenException('OIDC subject is not bound to the provisioned user');
  return { userId: user.id, organizationId:verifiedOrganizationId, email: user.email, role: user.role, subject };
}
