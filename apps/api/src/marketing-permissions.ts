import { ForbiddenException } from '@nestjs/common';
import type { VerifiedIdentity } from './oidc-identity.js';

const managers = new Set(['SUPER_ADMIN', 'ADMIN', 'MARKETING_DIRECTOR', 'CMO']);
const operators = new Set([...managers, 'MARKETING_MANAGER', 'MARKETING_SPECIALIST']);
const viewers = new Set([...operators, 'USER', 'VIEWER', 'ANALYST']);
export type MarketingPermission = 'READ_PORTFOLIO' | 'READ_APPROVALS' | 'READ_AUDIT' | 'ASSESS' | 'EXECUTE_WORKFLOW' | 'RESUME_WORKFLOW' | 'MANAGE_CAMPAIGN' | 'MANAGE_OBJECTIVE' | 'DECIDE_APPROVAL';

export function hasMarketingPermission(identity: VerifiedIdentity | undefined, permission: MarketingPermission): boolean {
  if (!identity) return false;
  const role = identity.role.toUpperCase();
  switch (permission) {
    case 'READ_PORTFOLIO': return viewers.has(role);
    case 'READ_APPROVALS': case 'READ_AUDIT': return managers.has(role);
    case 'ASSESS': return operators.has(role);
    case 'EXECUTE_WORKFLOW': case 'RESUME_WORKFLOW': return operators.has(role);
    case 'MANAGE_CAMPAIGN': case 'MANAGE_OBJECTIVE': case 'DECIDE_APPROVAL': return managers.has(role);
    default: return false;
  }
}

export function assertMarketingPermission(identity: VerifiedIdentity | undefined, permission: MarketingPermission): void {
  if (!hasMarketingPermission(identity, permission)) throw new ForbiddenException('Marketing permission denied: ' + permission);
}

export function permissionForMarketingRoute(method: string, path: string): MarketingPermission | null {
  if (method === 'GET' && path === '/marketing/me') return null;
  if (method === 'POST' && (path === '/marketing/sessions' || path === '/marketing/sessions/revoke')) return null;
  if (method === 'GET' && path === '/marketing/brain/plan') return 'READ_AUDIT';
  if (method === 'POST' && path === '/marketing/brain/assess') return 'EXECUTE_WORKFLOW';
  if (method === 'GET' && path === '/marketing/approvals/pending') return 'READ_APPROVALS';
  if (method === 'POST' && path === '/marketing/approvals/decide') return 'DECIDE_APPROVAL';
  if (method === 'POST' && path === '/marketing/objectives') return 'MANAGE_OBJECTIVE';
  if (method === 'POST' && path === '/marketing/campaigns') return 'MANAGE_CAMPAIGN';
  if (method === 'POST' && path === '/marketing/campaigns/transition') return 'MANAGE_CAMPAIGN';
  if (method === 'POST' && path === '/marketing/requests') return 'ASSESS';
  if (method === 'POST' && path === '/marketing/workflows') return 'EXECUTE_WORKFLOW';
  if (method === 'POST' && /^\/marketing\/workflows\/[^/]+\/resume$/.test(path)) return 'RESUME_WORKFLOW';
  if (method === 'GET' && path === '/marketing/operations/delivery') return 'READ_AUDIT';
  if (method === 'GET' && ((path === '/marketing/agents/operations' || path === '/marketing/agents/budget') || /^\/marketing\/agents\/executions\/[^/]+$/.test(path))) return 'READ_AUDIT';
  if (method === 'GET' && /^\/marketing\/campaigns\/[^/]+$/.test(path)) return 'READ_AUDIT';
  if (method === 'GET' && (
    ['/marketing/overview','/marketing/campaigns','/marketing/objectives','/marketing/products','/marketing/workflows','/marketing/agents','/marketing/agents/executions'].includes(path) ||
    /^\/marketing\/workflows\/[^/]+$/.test(path)
  )) return 'READ_PORTFOLIO';
  throw new ForbiddenException('Marketing route is not in the permission registry');
}
