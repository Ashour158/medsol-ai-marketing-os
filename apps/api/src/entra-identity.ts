import { UnauthorizedException } from '@nestjs/common';

const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function entraTenantId(): string {
  const tenant = process.env.MARKETING_ENTRA_TENANT_ID;
  if (!tenant || !guid.test(tenant)) throw new Error('MARKETING_ENTRA_TENANT_ID must be the Microsoft Entra tenant GUID');
  return tenant.toLowerCase();
}
export function entraIssuer(tenant: string) {
  if (!guid.test(tenant)) throw new Error('Invalid Microsoft Entra tenant');
  return 'https://login.microsoftonline.com/' + tenant.toLowerCase() + '/v2.0';
}
export function entraSubject(payload: Record<string, unknown>, tenant: string) {
  if (typeof payload.tid !== 'string' || payload.tid.toLowerCase() !== tenant.toLowerCase() || typeof payload.oid !== 'string' || !guid.test(payload.oid)) {
    throw new UnauthorizedException('Microsoft Entra tenant or object identity mismatch');
  }
  return 'entra:' + tenant.toLowerCase() + ':' + payload.oid.toLowerCase();
}
export function entraScope(): string {
  const scope = process.env.MARKETING_ENTRA_API_SCOPE;
  if (!scope || !/^api:\/\/[a-zA-Z0-9._/-]+\/[a-zA-Z0-9._-]+$/.test(scope)) throw new Error('MARKETING_ENTRA_API_SCOPE must be a delegated API scope');
  return scope;
}
