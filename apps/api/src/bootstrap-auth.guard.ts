import { CanActivate, ExecutionContext, Injectable, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { verifyBootstrapRequest } from './bootstrap-auth.js';
import { verifyOidcIdentity, type VerifiedIdentity } from './oidc-identity.js';
import { assertMarketingPermission, permissionForMarketingRoute } from './marketing-permissions.js';
import { PrismaService } from './prisma.service.js';

export type AuthenticatedRequest = {
  headers: Record<string, unknown>;
  body?: { organizationId?: unknown };
  method?: string;
  url?: string;
  identity?: VerifiedIdentity;
};

@Injectable()
export class BootstrapAuthGuard implements CanActivate {
  constructor(private readonly db: PrismaService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (req.url?.split('?')[0] === '/health' && req.method === 'GET') return true;
    const organizationId = process.env.MARKETING_BOOTSTRAP_ORGANIZATION_ID;
    if (!organizationId) throw new Error('MARKETING_BOOTSTRAP_ORGANIZATION_ID must be configured');
    const requested = req.body?.organizationId ?? req.headers['x-organization-id'];
    if (requested !== undefined && requested !== organizationId) throw new ForbiddenException('Cross-tenant access denied');
    const mode = process.env.MARKETING_AUTH_MODE ?? 'bootstrap';
    if (mode === 'oidc') {
      const identity = await verifyOidcIdentity(req.headers.authorization, organizationId, {
        issuer: process.env.MARKETING_OIDC_ISSUER ?? '',
        audience: process.env.MARKETING_OIDC_AUDIENCE ?? '',
        jwksUrl: process.env.MARKETING_OIDC_JWKS_URL ?? ''
      }, async (email, tenant) => this.db.user.findFirst({ where: { email, organizationId: tenant }, select: { id: true, email: true, role: true } }));
      req.identity = identity;
    } else if (mode === 'bootstrap') {
      const token = process.env.MARKETING_BOOTSTRAP_TOKEN;
      if (!token) throw new Error('MARKETING_BOOTSTRAP_TOKEN must be configured');
      verifyBootstrapRequest(req.headers.authorization, requested, token, organizationId);
      if (req.url?.split('?')[0] === '/marketing/approvals/decide') throw new ForbiddenException('Human approval requires OIDC user authentication');
    } else {
      throw new UnauthorizedException('Unsupported authentication mode');
    }
    const permission = permissionForMarketingRoute(req.method ?? '', req.url?.split('?')[0] ?? '');
    if (permission) assertMarketingPermission(req.identity, permission);
    if (req.body && 'organizationId' in req.body) req.body.organizationId = organizationId;
    req.headers['x-organization-id'] = organizationId;
    return true;
  }
}
