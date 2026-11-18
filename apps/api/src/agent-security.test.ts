import { describe, expect, it } from 'vitest';
import { AgentRegistry, AgentRuntime, AgentPolicyViolation } from '@medsol/agent-runtime';
import type { Agent, AgentContext } from '@medsol/agent-runtime';

const context: AgentContext = { executionId: 'execution', organizationId: 'tenant', correlationId: 'correlation', input: { goal: 'scientific awareness' }, capabilities: ['ASSESS_OBJECTIVE'] };
function mockAgent(id: string, action: string, riskLevel: 'R1'|'R3'|'R4' = 'R1'): Agent {
  return { id, version: 1, async decide() { return { agentId: id, action, riskLevel, rationale: 'test', approvalRequired: false, payload: { status: 'draft' } }; } };
}
describe('agent runtime authority boundary', () => {
  it('allows a registered manifest capability when explicitly granted', async () => {
    const registry = new AgentRegistry(); registry.register(mockAgent('MKT-CMO-001', 'ASSESS_OBJECTIVE'));
    await expect(new AgentRuntime(registry).execute('MKT-CMO-001', context)).resolves.toMatchObject({ executionAllowed: true, approvalRequired: false });
  });
  it('blocks a capability not owned by the agent manifest even if granted', async () => {
    const registry = new AgentRegistry(); registry.register(mockAgent('MKT-CMO-001', 'PUBLISH_SOCIAL'));
    await expect(new AgentRuntime(registry).execute('MKT-CMO-001', { ...context, capabilities: ['PUBLISH_SOCIAL'] })).rejects.toThrow('outside agent manifest');
  });
  it('blocks capabilities not granted by the orchestrator', async () => {
    const registry = new AgentRegistry(); registry.register(mockAgent('MKT-CMO-001', 'ASSESS_OBJECTIVE'));
    await expect(new AgentRuntime(registry).execute('MKT-CMO-001', { ...context, capabilities: [] })).rejects.toThrow('Capability not granted');
  });
  it('rejects identity substitution in agent output', async () => {
    const registry = new AgentRegistry();
    registry.register({ id: 'MKT-CMO-001', version: 1, async decide() { return { agentId: 'MKT-SOC-001', action: 'ASSESS_OBJECTIVE', riskLevel: 'R1', rationale: 'forged', approvalRequired: false, payload: {} }; } });
    await expect(new AgentRuntime(registry).execute('MKT-CMO-001', context)).rejects.toThrow('identity mismatch');
  });
  it('requires human approval for scientific R3 assessments', async () => {
    const registry = new AgentRegistry(); registry.register(mockAgent('MKT-SCI-001', 'CHECK_EVIDENCE', 'R3'));
    await expect(new AgentRuntime(registry).execute('MKT-SCI-001', { ...context, capabilities: ['CHECK_EVIDENCE'] })).resolves.toMatchObject({ executionAllowed: true, approvalRequired: true });
  });
  it('rejects excessive and unserializable input', async () => {
    const registry = new AgentRegistry(); registry.register(mockAgent('MKT-CMO-001', 'ASSESS_OBJECTIVE'));
    const runtime = new AgentRuntime(registry);
    await expect(runtime.execute('MKT-CMO-001', { ...context, input: { text: 'x'.repeat(70000) } })).rejects.toThrow('exceeds');
    const cyclic: any = {}; cyclic.self = cyclic;
    await expect(runtime.execute('MKT-CMO-001', { ...context, input: cyclic })).rejects.toThrow('JSON serializable');
  });
  it('rejects duplicate capability grants and unknown agent identifiers', async () => {
    const registry = new AgentRegistry(); registry.register(mockAgent('MKT-CMO-001', 'ASSESS_OBJECTIVE'));
    await expect(new AgentRuntime(registry).execute('MKT-CMO-001', { ...context, capabilities: ['ASSESS_OBJECTIVE','ASSESS_OBJECTIVE'] })).rejects.toThrow('Duplicate');
    registry.register(mockAgent('UNREGISTERED', 'ASSESS_OBJECTIVE'));
    await expect(new AgentRuntime(registry).execute('UNREGISTERED', context)).rejects.toBeInstanceOf(AgentPolicyViolation);
  });
});
