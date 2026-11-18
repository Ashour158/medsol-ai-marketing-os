import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { verifyBootstrapRequest } from './bootstrap-auth.js';

@Injectable()
export class BootstrapAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{
      headers: Record<string, unknown>;
      body?: { organizationId?: unknown };
      params?: { id?: string };
      method?: string;
      url?: string;
    }>();
    if (req.url?.split('?')[0] === '/health' && req.method === 'GET') return true;
    if (req.url?.split('?')[0] === '/marketing/approvals/decide') throw new ForbiddenException('Approval decisions require verified per-user authentication; bootstrap credentials are insufficient');
    const organizationId = process.env.MARKETING_BOOTSTRAP_ORGANIZATION_ID;
    const token = process.env.MARKETING_BOOTSTRAP_TOKEN;
    if (!organizationId || !token) throw new Error('MARKETING_BOOTSTRAP_TOKEN and MARKETING_BOOTSTRAP_ORGANIZATION_ID must be configured');
    verifyBootstrapRequest(req.headers.authorization, req.body?.organizationId ?? req.headers['x-organization-id'], token, organizationId);
    if (req.body && 'organizationId' in req.body) req.body.organizationId = organizationId;
    req.headers['x-organization-id'] = organizationId;
    return true;
  }
}
