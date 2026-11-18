import { AGENT_ROSTER, type AgentManifest } from './roster.js';

const manifests = new Map<string, AgentManifest>(AGENT_ROSTER.map(m => [m.id, m]));
export class AgentPolicyViolation extends Error {
  constructor(message: string) { super(message); this.name = 'AgentPolicyViolation'; }
}
export function authorizeAgentDecision(agentId: string, action: string, grantedCapabilities: readonly string[]) {
  const manifest = manifests.get(agentId);
  if (!manifest) throw new AgentPolicyViolation('Agent is not in the approved roster');
  if (!manifest.capabilities.includes(action)) throw new AgentPolicyViolation('Action is outside agent manifest');
  if (!grantedCapabilities.includes(action)) throw new AgentPolicyViolation('Capability not granted for execution');
  return manifest;
}
export function validateAgentInput(input: unknown, maxBytes = 65536): void {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new AgentPolicyViolation('Invalid input budget');
  let encoded: string | undefined;
  try { encoded = JSON.stringify(input); } catch { throw new AgentPolicyViolation('Agent input must be JSON serializable'); }
  if (encoded === undefined || new TextEncoder().encode(encoded).length > maxBytes) throw new AgentPolicyViolation('Agent input exceeds allowed size');
}
export function assertAgentExecutionBoundary(organizationId: string, correlationId: string, capabilities: readonly string[]) {
  if (!organizationId.trim() || !correlationId.trim()) throw new AgentPolicyViolation('Tenant and correlation ID are mandatory');
  if (capabilities.length > 20 || new Set(capabilities).size !== capabilities.length) throw new AgentPolicyViolation('Duplicate or excessive capabilities');
}
