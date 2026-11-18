import type { Agent, AgentContext, AgentDecision } from './index.js';
import { assessDomain } from './domain-intelligence.js';
import { AGENT_ROSTER, type AgentManifest } from './roster.js';

type StructuredInput = Record<string, unknown>;
function record(value: unknown): StructuredInput {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as StructuredInput : {};
}
const HIGH_RISK_ACTIONS = new Set(['PUBLISH_SOCIAL','APPROVE_STRATEGY','APPROVE_BRAND_ASSET','BLOCK_BRAND_VIOLATION','BLOCK_UNSUPPORTED_CLAIM','CAPTURE_EVENT_LEADS','CREATE_AUDIENCE','CREATE_NURTURE']);
const EXTERNAL_ACTIONS = new Set(['PUBLISH_SOCIAL','CAPTURE_EVENT_LEADS','CREATE_AUDIENCE','CREATE_NURTURE','SCHEDULE_CONTENT']);
export type EngineState = 'DRAFT' | 'REVIEW_REQUIRED' | 'BLOCKED' | 'INSUFFICIENT_EVIDENCE';
export interface EngineOutput {
  engine: string; state: EngineState; proposal: Record<string, unknown>;
  evidence: { references: string[]; verified: boolean };
  controls: { humanApproval: boolean; externalEffectPermitted: false; missing: string[] };
  next: string[];
}
function references(input: StructuredInput): string[] {
  const refs = input.evidenceReferences;
  return Array.isArray(refs) ? refs.filter((x): x is string => typeof x === 'string' && x.length > 0).slice(0, 20) : [];
}
const NEXT: Record<string,string[]> = {
 'MKT-CMO-001':['MKT-STR-001','MKT-OPS-001'],
 'MKT-OPS-001':['MKT-PM-001','MKT-GROWTH-001','MKT-CONT-001','MKT-EVENT-001'],
 'MKT-STR-001':['MKT-PM-001','MKT-ANA-001'],
 'MKT-ANA-001':['MKT-CMO-001','MKT-GROWTH-001'],
 'MKT-PM-001':['MKT-CONT-001','MKT-SCI-001'],
 'MKT-GROWTH-001':['MKT-ANA-001','MKT-CRM-001'],
 'MKT-CRM-001':['MKT-ANA-001'],
 'MKT-CONT-001':['MKT-SCI-001','MKT-BRAND-001','MKT-CREATIVE-001'],
 'MKT-SOC-001':['MKT-SCI-001','MKT-BRAND-001'],
 'MKT-CREATIVE-001':['MKT-BRAND-001'],
 'MKT-BRAND-001':['MKT-OPS-001'],
 'MKT-EVENT-001':['MKT-CRM-001','MKT-ANA-001'],
 'MKT-SCI-001':['MKT-BRAND-001']
};
export const AGENT_NERVOUS_SYSTEM = Object.freeze(NEXT);
export function engineDecision(manifest: AgentManifest, context: AgentContext): AgentDecision {
  const input = record(context.input);
  const action = manifest.capabilities.find(x => context.capabilities.includes(x));
  if (!action) throw new Error('No engine capability granted');
  const refs = references(input);
  const scientific = manifest.id === 'MKT-SCI-001';
  const brand = manifest.id === 'MKT-BRAND-001';
  const highRisk = HIGH_RISK_ACTIONS.has(action);
  const external = EXTERNAL_ACTIONS.has(action);
  const missing: string[] = [];
  if (scientific && refs.length === 0) missing.push('scientific_evidence_references');
  if (brand && !input.brandMasterVersion) missing.push('authoritative_brand_master_version');
  if (manifest.id === 'MKT-CRM-001' && !input.consentReference) missing.push('consent_reference');
  if (external) missing.push('approved_external_connector_and_execution_authority');
  const state: EngineState = scientific && refs.length === 0 ? 'INSUFFICIENT_EVIDENCE' : missing.length ? 'REVIEW_REQUIRED' : 'DRAFT';
  const assessment = assessDomain(manifest.id, { organizationId: context.organizationId, objective: String(input.objective ?? input.requestedOutcome ?? 'Unspecified objective'), market: String(input.market ?? 'Unspecified market'), audience: String(input.targetAudience ?? 'Unspecified audience'), productId: typeof input.productId === 'string' ? input.productId : null, evidence: [], brandMasterVersion: typeof input.brandMasterVersion === 'string' ? input.brandMasterVersion : null, consentReference: typeof input.consentReference === 'string' ? input.consentReference : null });
  const output: EngineOutput = {
    engine: manifest.id, state,
    proposal: {
      action, objective: input.objective ?? input.requestedOutcome ?? null,
      targetAudience: input.targetAudience ?? null, productId: input.productId ?? null,
      market: input.market ?? null, correlationId: context.correlationId,
      recommendation: 'Draft for owner validation; authoritative records and live integrations are not inferred'
    },
    evidence: { references: refs, verified: false },
    controls: { humanApproval: scientific || brand || highRisk || external || missing.length > 0, externalEffectPermitted: false, missing },
    next: NEXT[manifest.id] ?? []
  };
  return {
    agentId: manifest.id, action,
    riskLevel: scientific ? 'R3' : highRisk || external ? 'R2' : 'R1',
    rationale: manifest.mission + ' Output is a deterministic proposal, not an authoritative write or verified external fact.',
    approvalRequired: output.controls.humanApproval,
    payload: {...output, domainAssessment: assessment}
  };
}
export class MarketingDomainAgent implements Agent {
  readonly id: string; readonly version = 1;
  constructor(private readonly manifest: AgentManifest) { this.id = manifest.id; }
  async decide(context: AgentContext): Promise<AgentDecision> { return engineDecision(this.manifest, context); }
}
export function registerDomainAgents(register: (agent: Agent) => void): void {
  for (const manifest of AGENT_ROSTER) register(new MarketingDomainAgent(manifest));
}
