import { ForbiddenException } from '@nestjs/common';
import type { VerifiedIdentity } from './oidc-identity.js';

const managers = new Set(['SUPER_ADMIN', 'ADMIN', 'MARKETING_DIRECTOR', 'CMO']);
const operators = new Set([...managers, 'MARKETING_MANAGER', 'MARKETING_SPECIALIST']);
const viewers = new Set([...operators, 'USER', 'VIEWER', 'ANALYST']);
export type MarketingPermission = 'READ_TENANCY' | 'MANAGE_TENANT' | 'READ_PORTFOLIO' | 'READ_APPROVALS' | 'READ_AUDIT' | 'ASSESS' | 'SUBMIT_EVIDENCE' | 'EXECUTE_WORKFLOW' | 'RESUME_WORKFLOW' | 'MANAGE_CAMPAIGN' | 'MANAGE_OBJECTIVE' | 'DECIDE_APPROVAL';

export const MARKETING_PERMISSION_KEYS:readonly MarketingPermission[] = [
 'READ_TENANCY','MANAGE_TENANT','READ_PORTFOLIO','READ_APPROVALS','READ_AUDIT',
 'ASSESS','SUBMIT_EVIDENCE','EXECUTE_WORKFLOW','RESUME_WORKFLOW',
 'MANAGE_CAMPAIGN','MANAGE_OBJECTIVE','DECIDE_APPROVAL'
] as const;
export function isMarketingPermission(value:unknown):value is MarketingPermission{
 return typeof value==='string'&&MARKETING_PERMISSION_KEYS.includes(value as MarketingPermission);
}

export function hasMarketingPermission(identity: VerifiedIdentity | undefined, permission: MarketingPermission): boolean {
  if (!identity) return false;
  const role = identity.role.toUpperCase();
  switch (permission) {
    case 'READ_TENANCY': case 'MANAGE_TENANT': return role==='ADMIN'||role==='SUPER_ADMIN';
    case 'READ_PORTFOLIO': return viewers.has(role);
    case 'READ_APPROVALS': case 'READ_AUDIT': return managers.has(role);
    case 'ASSESS': case 'SUBMIT_EVIDENCE': return operators.has(role);
    case 'EXECUTE_WORKFLOW': case 'RESUME_WORKFLOW': return operators.has(role);
    case 'MANAGE_CAMPAIGN': case 'MANAGE_OBJECTIVE': case 'DECIDE_APPROVAL': return managers.has(role);
    default: return false;
  }
}

export function assertMarketingPermission(identity: VerifiedIdentity | undefined, permission: MarketingPermission): void {
  if (!hasMarketingPermission(identity, permission)) throw new ForbiddenException('Marketing permission denied: ' + permission);
}

export function permissionForMarketingRoute(method: string, path: string): MarketingPermission | null {
  if(method==='GET'&&/^\/marketing\/journeys\/[A-Za-z0-9_-]+$/.test(path))
   return 'READ_AUDIT';
  if(method==='GET'&&/^\/marketing\/journeys\/[A-Za-z0-9_-]+\/dossier$/.test(path))
   return 'READ_AUDIT';
  if(/^\/marketing\/campaigns\/[A-Za-z0-9_-]+\/channel-plans\/[A-Za-z0-9_-]+\/rehearse$/.test(path)&&method==='POST')return 'MANAGE_CAMPAIGN';
  if(/^\/marketing\/campaigns\/[A-Za-z0-9_-]+\/channel-plans$/.test(path)&&method==='GET')return 'READ_AUDIT';
  if(/^\/marketing\/campaigns\/[A-Za-z0-9_-]+\/channel-plans$/.test(path)&&method==='POST')return 'MANAGE_CAMPAIGN';
  if(path==='/marketing/products/synthetic-price-proposals'&&method==='POST')return 'MANAGE_CAMPAIGN';
  if(path==='/marketing/products/synthetic-price-proposals'&&method==='GET')return 'READ_AUDIT';
  if(method==='POST'&&path==='/marketing/performance/experiments')return 'MANAGE_CAMPAIGN';
  if(method==='GET'&&/^\/marketing\/performance\/experiments\/[A-Za-z0-9_-]+$/.test(path))return 'READ_AUDIT';
  if(method==='GET'&&path==='/marketing/performance/forms')return 'READ_AUDIT';
  if(method==='POST'&&path==='/marketing/performance/forms')return 'MANAGE_CAMPAIGN';
  if(method==='POST'&&/^\/marketing\/performance\/forms\/[A-Za-z0-9_-]+\/submit$/.test(path))return 'SUBMIT_EVIDENCE';
  if(method==='POST'&&/^\/marketing\/performance\/submissions\/[A-Za-z0-9_-]+\/qualification$/.test(path))return 'SUBMIT_EVIDENCE';
  if(method==='GET'&&path==='/marketing/learning/watches')return 'READ_AUDIT';
  if(method==='POST'&&(path==='/marketing/learning/watches'||/^\/marketing\/learning\/watches\/[A-Za-z0-9_-]+\/transition$/.test(path)))return 'DECIDE_APPROVAL';
  if((method==='GET'||method==='POST')&&path==='/marketing/social/cases')
   return 'ASSESS';
  if(method==='POST'&&/^\/marketing\/social\/cases\/[A-Za-z0-9_-]+\/transition$/.test(path))
   return 'ASSESS'; // manager-only actions are additionally checked in the case service
  if(method==='POST'&&path==='/marketing/social/discussions/triage-preview')
   return 'ASSESS';
  if(method==='POST'&&/^\/marketing\/assets\/[A-Za-z0-9_-]+\/offline-layered-revisions$/.test(path))return 'MANAGE_CAMPAIGN';
  if(method==='GET'&&/^\/marketing\/assets\/revisions\/[A-Za-z0-9_-]+\/layered-preview$/.test(path))return 'READ_PORTFOLIO';
  if(method==='POST'&&(path==='/marketing/assets/offline-raster'||
    /^\/marketing\/assets\/[A-Za-z0-9_-]+\/offline-revisions$/.test(path)))
   return 'MANAGE_CAMPAIGN';
  if(method==='GET'&&/^\/marketing\/assets\/revisions\/[A-Za-z0-9_-]+\/offline-preview$/.test(path))
   return 'READ_PORTFOLIO';
  if(method==='POST'&&/^\/marketing\/media\/evidence\/[A-Za-z0-9_-]+\/verify-offline$/.test(path))
   return 'MANAGE_CAMPAIGN';
  if(method==='GET'&&/^\/marketing\/agents\/manifests\/baseline\/[A-Za-z0-9_-]+$/.test(path))
   return 'READ_TENANCY';
  if(method==='GET'&&path==='/marketing/agents/specialists')return 'READ_TENANCY';
  if(method==='POST'&&['/marketing/agents/specialists','/marketing/agents/specialists/rehearse','/marketing/agents/specialists/execute-rehearsal','/marketing/agents/specialists/execute-batch','/marketing/agents/specialists/allocation-preview'].includes(path))return 'MANAGE_TENANT';
  if(method==='GET'&&path==='/marketing/agents/manifests')return 'READ_TENANCY';
  if(method==='POST'&&(path==='/marketing/agents/manifests'||
    path==='/marketing/agents/manifests/preview'||path==='/marketing/agents/team-preview'||
    /^\/marketing\/agents\/manifests\/[^/]+\/(approve|activate|revoke|rollback)$/.test(path)))
   return 'MANAGE_TENANT';
  if(method==='GET'&&path==='/marketing/tools/registrations')return 'READ_TENANCY';
  if(method==='POST'&&(path==='/marketing/tools/registrations'||
   (path.startsWith('/marketing/tools/registrations/') &&
    path.split('/').length===6 &&
    ['approve','revoke','inspect'].includes(path.split('/')[5]??'') &&
    !!path.split('/')[4])))
   return 'MANAGE_TENANT';
  if(method==='GET'&&['/marketing/integrations/trials/catalog','/marketing/integrations/trials/history'].includes(path))return 'READ_TENANCY';
  if(method==='POST'&&path==='/marketing/integrations/trials/run')return 'MANAGE_TENANT';
  if(method==='GET'&&(
    path==='/marketing/integrations/catalog'||
    path==='/marketing/integrations'||/^\/marketing\/integrations\/[^/]+$/.test(path)))
   return 'READ_TENANCY';
  if(method==='GET'&&/^\/marketing\/integrations\/[^/]+\/health$/.test(path))return 'READ_TENANCY';
  if(method==='POST'&&(path==='/marketing/integrations'||
    /^\/marketing\/integrations\/[^/]+\/(suspend|revoke)$/.test(path)))
   return 'MANAGE_TENANT';
  if(method==='GET'&&(path==='/marketing/media/evidence'||
    /^\/marketing\/media\/evidence\/[^/]+$/.test(path)))
   return 'READ_TENANCY';
  if(method==='POST'&&/^\/marketing\/media\/evidence\/[^/]+\/revoke$/.test(path))
   return 'MANAGE_TENANT';
  if(/^\/marketing\/audience\/loyalty\/[A-Za-z0-9_-]+$/.test(path)&&method==='GET')return 'READ_TENANCY';
  if(path==='/marketing/audience/loyalty'&&method==='POST')return 'MANAGE_TENANT';
  if(path==='/marketing/audience/message-rehearsals'&&method==='GET')return 'READ_TENANCY';
  if(path==='/marketing/audience/message-rehearsals'&&method==='POST')return 'MANAGE_TENANT';
  if(method==='GET'&&path==='/marketing/audience/synthetic-contacts')return 'READ_TENANCY';
  if(method==='POST'&&(path==='/marketing/audience/synthetic-contacts'||
    /^\/marketing\/audience\/synthetic-contacts\/[^/]+\/consent$/.test(path)))
   return 'MANAGE_TENANT';
  if(method==='GET'&&path==='/marketing/email/simulations')return 'READ_TENANCY';
  if(method==='POST'&&path==='/marketing/email/simulations')return 'MANAGE_TENANT';
  if(method==='GET'&&path==='/marketing/publications')return 'READ_PORTFOLIO';
  if(method==='GET'&&/^\/marketing\/publications\/[^/]+$/.test(path))return 'READ_AUDIT';
  if(method==='GET'&&/^\/marketing\/publications\/[^/]+\/(preflight|performance|reconciliation|release-readiness)$/.test(path))
   return 'READ_AUDIT';
  if(method==='POST'&&path==='/marketing/publications')return 'MANAGE_CAMPAIGN';
  if(method==='POST'&&/^\/marketing\/publications\/[^/]+\/simulate$/.test(path))
   return 'EXECUTE_WORKFLOW';
  if(method==='POST'&&/^\/marketing\/publications\/[^/]+\/cancel$/.test(path))
   return 'MANAGE_CAMPAIGN';
  if(method==='POST'&&/^\/marketing\/publications\/[^/]+\/dispatch-hold$/.test(path))
   return 'MANAGE_TENANT';
  if(method==='POST'&&/^\/marketing\/publications\/[^/]+\/dispatch-reservation(?:\/expire)?$/.test(path))
   return 'MANAGE_TENANT';
  if(method==='GET'&&/^\/marketing\/publications\/[^/]+\/dispatch-reservation$/.test(path))
   return 'READ_AUDIT';
  if(method==='GET'&&(
    path==='/marketing/assets'||/^\/marketing\/assets\/[^/]+$/.test(path)))
   return 'READ_PORTFOLIO';
  if(method==='GET'&&/^\/marketing\/assets\/approvals\/[^/]+$/.test(path))
   return 'READ_APPROVALS';
  if(method==='POST'&&(path==='/marketing/assets'||
    /^\/marketing\/assets\/[^/]+\/revisions$/.test(path)||
    /^\/marketing\/assets\/revisions\/[^/]+\/submit-approval$/.test(path)))
   return 'MANAGE_CAMPAIGN';
  if(method==='POST'&&/^\/marketing\/assets\/revisions\/[^/]+\/rights-review$/.test(path))
   return 'DECIDE_APPROVAL';
  if(path==='/marketing/tenancy/offline-subscription'&&method==='GET')return 'READ_TENANCY';
  if(path==='/marketing/tenancy/offline-subscription'&&method==='POST')return 'MANAGE_TENANT';
  if(path==='/marketing/tenancy/activation-reviews'&&method==='GET')return 'READ_TENANCY';
  if(path==='/marketing/tenancy/activation-reviews'&&method==='POST')return 'MANAGE_TENANT';
  if(method==='GET'&&path==='/marketing/tenancy/roles')return 'READ_TENANCY';
  if(method==='POST'&&(path==='/marketing/tenancy/roles'||
   path==='/marketing/tenancy/roles/assign'||
   /^\/marketing\/tenancy\/roles\/[^/]+\/disable$/.test(path)))
   return 'MANAGE_TENANT';
  if(method==='GET'&&
   /^\/marketing\/tenancy\/clients\/[A-Za-z0-9_-]+\/brands\/[A-Za-z0-9_-]+\/campaigns(?:\/[A-Za-z0-9_-]+)?$/.test(path))
   return 'READ_PORTFOLIO';
  if(method==='GET'&&(path==='/marketing/tenancy/brands'||path==='/marketing/tenancy/agency-grants'))
   return 'READ_TENANCY';
  if(method==='POST'&&(path==='/marketing/tenancy/brands'||
      path==='/marketing/tenancy/agency-grants'||
      /^\/marketing\/tenancy\/agency-grants\/[^/]+\/revoke$/.test(path)))
   return 'MANAGE_TENANT';
  if(method==='GET'&&(path==='/marketing/performance/observations'||/^\/marketing\/performance\/campaigns\/[^/]+$/.test(path)))return 'READ_AUDIT';
  if(method==='POST'&&path==='/marketing/performance/ingest')return 'SUBMIT_EVIDENCE';
  if(method==='POST'&&path==='/marketing/performance/review')return 'DECIDE_APPROVAL';
  if(method==='GET'&&(path==='/marketing/command-center'||/^\/marketing\/command-center\/incidents\/(BRAIN_NEEDS_INTERVENTION|BRAIN_STALE|OUTBOX_DEAD_LETTER)$/.test(path)))return 'READ_AUDIT';
  if(method==='POST'&&/^\/marketing\/command-center\/incidents\/(BRAIN_STALE|BRAIN_NEEDS_INTERVENTION|OUTBOX_DEAD_LETTER)\/[^/]+\/acknowledge$/.test(path))return 'DECIDE_APPROVAL';
  if(method==='GET'&&(path==='/marketing/brand/active'||path==='/marketing/brand/revisions'))return 'READ_AUDIT';
  if(method==='POST'&&(path==='/marketing/brand/propose'||path==='/marketing/brand/decide'))return 'DECIDE_APPROVAL';
  if (method === 'GET' && path === '/marketing/me') return null;
  if (method === 'POST' && (path === '/marketing/sessions' || path === '/marketing/sessions/revoke')) return null;
  if(method==='GET'&&(
   path==='/marketing/learning/memories'||
   path==='/marketing/learning/knowledge/feedback'||
   /^\/marketing\/learning\/graph\/[^/]+$/.test(path)
  ))return 'READ_AUDIT';
  if(method==='POST'&&(
   path==='/marketing/learning/graph'||
   path==='/marketing/learning/memories'||
   path==='/marketing/learning/knowledge/feedback'||
   path==='/marketing/learning/knowledge/evaluate'||
   /^\/marketing\/learning\/(graph|memories)\/[^/]+\/(review|revoke)$/.test(path)
  ))return 'MANAGE_TENANT';
  if(method==='GET'&&path==='/marketing/learning/knowledge')return 'READ_AUDIT';
  if(method==='POST'&&(path==='/marketing/learning/knowledge/search'||
    path==='/marketing/learning/knowledge/agent-context-preview'))return 'READ_AUDIT';
  if(method==='POST'&&(path==='/marketing/learning/knowledge'||
    /^\/marketing\/learning\/knowledge\/[^/]+\/(review|revoke|promote)$/.test(path)))
   return 'MANAGE_TENANT';
  if (method === 'GET' && (path === '/marketing/learning/signals' || path === '/marketing/learning/proposals' || path === '/marketing/learning/trends')) return 'READ_AUDIT';
  if (method === 'POST' && (path === '/marketing/learning/skills/evaluate' || path === '/marketing/learning/skills/decide')) return 'DECIDE_APPROVAL';
  if (method === 'POST' && path === '/marketing/learning/discover') return 'SUBMIT_EVIDENCE';
  if (method === 'POST' && path === '/marketing/learning/signals') return 'SUBMIT_EVIDENCE';
  if (method === 'POST' && (path === '/marketing/learning/verify' || path === '/marketing/learning/proposals')) return 'DECIDE_APPROVAL';
  if (method === 'GET' && (path === '/marketing/brain/runs' || /^\/marketing\/brain\/runs\/[^/]+$/.test(path) || /^\/marketing\/brain\/runs\/[^/]+\/recovery$/.test(path))) return 'READ_AUDIT';
  if (method === 'POST' && /^\/marketing\/brain\/runs\/[^/]+\/(quarantine|cancel)$/.test(path)) return 'DECIDE_APPROVAL';
  if (method === 'POST' && /^\/marketing\/brain\/runs\/[^/]+\/execute$/.test(path)) return 'EXECUTE_WORKFLOW';
  if (method === 'POST' && path === '/marketing/brain/runs') return 'EXECUTE_WORKFLOW';
  if(method==='GET'&&(path==='/marketing/architecture/readiness'||
    /^\/marketing\/architecture\/runs\/[^/]+\/recovery$/.test(path)))
    return 'READ_AUDIT';
  if(method==='GET'&&path==='/marketing/architecture/deployments')return 'READ_TENANCY';
  if(method==='POST'&&(path==='/marketing/architecture/deployments'||
    /^\/marketing\/architecture\/deployments\/[^/]+\/(approve|activate|revoke)$/.test(path)))
   return 'MANAGE_TENANT';
  if(method==='POST'&&(path==='/marketing/architecture/runs'||
    /^\/marketing\/architecture\/runs\/[^/]+\/tick$/.test(path)))
   return 'EXECUTE_WORKFLOW';
  if (method === 'GET' && path === '/marketing/architecture/blueprint') return 'READ_AUDIT';
  if (method === 'POST' && path === '/marketing/architecture/blueprint/simulate') return 'EXECUTE_WORKFLOW';
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
  if (method === 'GET' && (path === '/marketing/operations/delivery'||path === '/marketing/operations/workers')) return 'READ_AUDIT';
  if (method === 'GET' && ((path === '/marketing/agents/operations' || path === '/marketing/agents/budget') || /^\/marketing\/agents\/executions\/[^/]+$/.test(path))) return 'READ_AUDIT';
  if (method === 'GET' && /^\/marketing\/campaigns\/[^/]+$/.test(path)) return 'READ_AUDIT';
  if (method === 'GET' && (
    ['/marketing/overview','/marketing/campaigns','/marketing/objectives','/marketing/products','/marketing/workflows','/marketing/agents','/marketing/agents/executions'].includes(path) ||
    /^\/marketing\/workflows\/[^/]+$/.test(path)
  )) return 'READ_PORTFOLIO';
  throw new ForbiddenException('Marketing route is not in the permission registry');
}
