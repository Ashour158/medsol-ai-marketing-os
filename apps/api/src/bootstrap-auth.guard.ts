import { CanActivate, ExecutionContext, Injectable, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import {marketingTenantResolutionMode} from '@medsol/contracts';
import { verifyBootstrapRequest } from './bootstrap-auth.js';
import { verifyOidcIdentity, type VerifiedIdentity } from './oidc-identity.js';
import { assertMarketingPermission, permissionForMarketingRoute } from './marketing-permissions.js';
import { PrismaService,withMarketingTenant } from './prisma.service.js';
import {TenantRolePolicyService} from './tenant-role-policy.service.js';

export type AuthenticatedRequest = {
  headers: Record<string, unknown>;
  body?: { organizationId?: unknown };
  method?: string;
  url?: string;
  identity?: VerifiedIdentity;
};

@Injectable()
export class BootstrapAuthGuard implements CanActivate {
  constructor(private readonly db: PrismaService,private readonly roles:TenantRolePolicyService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (req.method === 'GET' && ['/health','/readyz'].includes(req.url?.split('?')[0] ?? '')) return true;
    const authMode=process.env.MARKETING_AUTH_MODE??'bootstrap';
    const tenantMode=marketingTenantResolutionMode(process.env.MARKETING_TENANT_RESOLUTION_MODE);
    const fixedOrganizationId=process.env.MARKETING_BOOTSTRAP_ORGANIZATION_ID;
    if(tenantMode==='SIGNED_OIDC_CLAIM'&&authMode!=='oidc')
      throw new UnauthorizedException('Signed organization mode requires verified OIDC');
    if(tenantMode==='FIXED'&&!fixedOrganizationId)
      throw new Error('MARKETING_BOOTSTRAP_ORGANIZATION_ID must be configured');
    if(tenantMode==='SIGNED_OIDC_CLAIM'&&fixedOrganizationId)
      throw new Error('Signed organization mode cannot use a fixed organization');
    const bodyTenant=req.body?.organizationId;
    const headerTenant=req.headers['x-organization-id'];
    const requested=bodyTenant??headerTenant;
    // In signed mode the actual tenant is extracted AFTER JWT verification,
    // never from the request header/body. Both are optional consistency checks.
    let organizationId=fixedOrganizationId??'';
    if (authMode === 'oidc') {
      const identity = await verifyOidcIdentity(req.headers.authorization, organizationId, {
        issuer: process.env.MARKETING_OIDC_ISSUER ?? '',
        audience: process.env.MARKETING_OIDC_AUDIENCE ?? '',
        jwksUrl: process.env.MARKETING_OIDC_JWKS_URL ?? ''
      }, async (subject, tenant) => withMarketingTenant(this.db,tenant,tx=>tx.user.findFirst({ where: { oidcSubject: subject, organizationId: tenant }, select: { id: true, email: true, role: true, oidcSubject: true, disabledAt: true } })));
      organizationId=identity.organizationId;
      if((bodyTenant!==undefined&&bodyTenant!==organizationId)||
         (headerTenant!==undefined&&headerTenant!==organizationId))
       throw new ForbiddenException('Cross-tenant access denied');
      req.identity = identity;
      const route = req.url?.split('?')[0];
      if (route !== '/marketing/sessions' || req.method !== 'POST') {
        const sessionId = req.headers['x-marketing-session-id'];
        if (typeof sessionId !== 'string' || !/^[0-9a-f-]{36}$/i.test(sessionId)) throw new UnauthorizedException('Active server session required');
        const session = await withMarketingTenant(this.db,organizationId,tx=>
          tx.authSession.findFirst({where:{id:sessionId,organizationId,
           userId:identity.userId,revokedAt:null,expiresAt:{gt:new Date()}}}));
        if (!session) throw new UnauthorizedException('Session expired or revoked');
      }
    } else if (authMode === 'bootstrap') {
      // Shared bootstrap tokens remain restricted to one explicitly configured org.
      if ((bodyTenant!==undefined&&bodyTenant!==organizationId)||
          (headerTenant!==undefined&&headerTenant!==organizationId))
        throw new ForbiddenException('Cross-tenant access denied');
      const token = process.env.MARKETING_BOOTSTRAP_TOKEN;
      if (!token) throw new Error('MARKETING_BOOTSTRAP_TOKEN must be configured');
      verifyBootstrapRequest(req.headers.authorization, requested, token, organizationId);
      if (req.url?.split('?')[0] === '/marketing/approvals/decide') throw new ForbiddenException('Human approval requires OIDC user authentication');
      if (req.url?.split('?')[0]?.startsWith('/marketing/assets')) throw new ForbiddenException('Creative assets require verified OIDC identity');
      if (req.url?.split('?')[0]?.startsWith('/marketing/publications')) throw new ForbiddenException('Publication intents require verified OIDC identity');
      if (req.url?.split('?')[0]?.startsWith('/marketing/integrations')) throw new ForbiddenException('Platform integrations require verified OIDC identity');
      if (req.url?.split('?')[0]?.startsWith('/marketing/media/evidence')) throw new ForbiddenException('Media evidence APIs require verified OIDC identity');
    } else {
      throw new UnauthorizedException('Unsupported authentication mode');
    }
    const permission = permissionForMarketingRoute(req.method ?? '', req.url?.split('?')[0] ?? '');
    if (permission && authMode === 'bootstrap') {
      if (permission !== 'READ_PORTFOLIO' && permission !== 'ASSESS') throw new ForbiddenException('Bootstrap pilot access is limited to portfolio reads and assessment');
    } else if (permission) {
      assertMarketingPermission(req.identity, permission);
      await this.roles.assertActorPermission(req.identity!,permission);
    }
    if (req.body && 'organizationId' in req.body) req.body.organizationId = organizationId;
    req.headers['x-organization-id'] = organizationId;
    return true;
  }
}
