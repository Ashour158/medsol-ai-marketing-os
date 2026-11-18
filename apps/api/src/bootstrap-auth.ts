import { createHash, timingSafeEqual } from 'node:crypto';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';

/**
 * Single-tenant bootstrap gate. Replace with verified OIDC/JWT and per-user RBAC
 * before enabling multi-tenant production traffic.
 */
export function verifyBootstrapRequest(
  authorization: unknown,
  requestedOrganizationId: unknown,
  configuredToken: string,
  configuredOrganizationId: string
): string {
  if (!configuredToken || !configuredOrganizationId) throw new Error('Bootstrap security configuration is missing');
  if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ')) throw new UnauthorizedException('Bearer authentication required');
  const supplied = authorization.slice(7);
  const actual = createHash('sha256').update(supplied).digest();
  const expected = createHash('sha256').update(configuredToken).digest();
  if (!timingSafeEqual(actual, expected)) throw new UnauthorizedException('Invalid bearer token');
  if (requestedOrganizationId !== undefined && requestedOrganizationId !== configuredOrganizationId) throw new ForbiddenException('Cross-tenant access denied');
  return configuredOrganizationId;
}
