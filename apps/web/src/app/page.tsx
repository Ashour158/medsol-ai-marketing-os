"use client";
import { useState } from "react";

type Workflow = { workflowExecutionId?: string; id?: string; status?: string; currentStep?: string; correlationId?: string; output?: unknown; steps?: unknown[] };
export default function Home() {
  const [organizationId, setOrganizationId] = useState("");
  const [token, setToken] = useState("");
  const [goal, setGoal] = useState("");
  const [objectiveId, setObjectiveId] = useState("");
  const [workflowId, setWorkflowId] = useState("");
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [agents, setAgents] = useState<unknown>(null);
  const [pendingApprovals, setPendingApprovals] = useState<unknown>(null);
  const [assessment, setAssessment] = useState<unknown>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function call(path: string, body?: unknown): Promise<unknown> {
    if (!organizationId.trim() || !token.trim()) throw new Error("Enter your organization ID and access token.");
    const response = await fetch("/api/marketing/" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { authorization: "Bearer " + token.trim(), "x-organization-id": organizationId.trim(), ...(body === undefined ? {} : { "content-type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: "no-store"
    });
    const result: unknown = await response.json();
    if (!response.ok) throw new Error(typeof result === "object" && result !== null && "message" in result ? String(result.message) : "Request failed (" + response.status + ")");
    return result;
  }
  async function perform(action: () => Promise<void>) {
    setBusy(true); setError("");
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : "Unexpected error"); }
    finally { setBusy(false); }
  }
  const request = { organizationId: organizationId.trim(), requestedOutcome: goal.trim(), ...(objectiveId.trim() ? { objectiveId: objectiveId.trim() } : {}) };
  const buttonStyle = { padding: "11px 16px", background: "#124d83", color: "white", border: 0, borderRadius: 8, cursor: "pointer", fontWeight: 700 as const };
  const fieldStyle = { width: "100%", boxSizing: "border-box" as const, padding: 12, border: "1px solid #cbd5e1", borderRadius: 8, marginTop: 6 };
  return <main style={{ maxWidth: 1080, margin: "0 auto", padding: "42px 24px", fontFamily: "Arial,sans-serif" }}>
    <div style={{ color: "#124d83", fontSize: 13, fontWeight: 800, letterSpacing: 2 }}>MEDSOL · AI MARKETING OS</div>
    <h1 style={{ fontSize: 38, marginBottom: 8 }}>Marketing Command Center</h1>
    <p style={{ color: "#64748b" }}>Internal pilot console · human approval remains mandatory for governed campaigns.</p>
    <section style={{ background: "white", borderRadius: 14, padding: 24, marginTop: 24 }}>
      <h2 style={{ marginTop: 0 }}>1. Connect to your organization</h2>
      <p style={{ color: "#64748b", fontSize: 13 }}>The bearer token is held only in page memory, not browser storage. For production, use a proper OIDC sign-in flow; pasting tokens here is for restricted internal testing.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 16 }}>
        <label>Organization ID<input style={fieldStyle} value={organizationId} onChange={e => setOrganizationId(e.target.value)} autoComplete="off" placeholder="Configured organization ID" /></label>
        <label>Access token (pilot/OIDC)<input style={fieldStyle} type="password" value={token} onChange={e => setToken(e.target.value)} autoComplete="off" placeholder="Bearer token" /></label>
      </div>
      <button style={{ ...buttonStyle, marginTop: 16 }} disabled={busy} onClick={() => perform(async () => { setAgents(await call("agents")); })}>Verify access and load agents</button>
      {agents !== null && <details style={{ marginTop: 14 }}><summary>Agent roster</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(agents, null, 2)}</pre></details>}
    </section>
    <section style={{ background: "white", borderRadius: 14, padding: 24, marginTop: 20 }}>
      <h2 style={{ marginTop: 0 }}>2. Assess and initiate a campaign</h2>
      <label>Marketing objective<textarea style={{ ...fieldStyle, minHeight: 100 }} value={goal} onChange={e => setGoal(e.target.value)} placeholder="Launch an oncology genomics awareness campaign in Egypt" /></label>
      <label style={{ display: "block", marginTop: 14 }}>Existing marketing objective ID (required to create a campaign)<input style={fieldStyle} value={objectiveId} onChange={e => setObjectiveId(e.target.value)} placeholder="UUID from marketing objectives" /></label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 16 }}>
        <button style={buttonStyle} disabled={busy || !goal.trim()} onClick={() => perform(async () => { setAssessment(await call("requests", request)); })}>Assess objective</button>
        <button style={buttonStyle} disabled={busy || !goal.trim()} onClick={() => perform(async () => { const result = await call("workflows", request) as Workflow; setWorkflow(result); if (result.workflowExecutionId) setWorkflowId(result.workflowExecutionId); })}>Start governed workflow</button>
      </div>
      {assessment !== null && <details open style={{ marginTop: 16 }}><summary>Assessment result</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(assessment, null, 2)}</pre></details>}
    </section>
    <section style={{ background: "white", borderRadius: 14, padding: 24, marginTop: 20 }}>
      <h2 style={{ marginTop: 0 }}>3. Monitor and recover workflow</h2>
      <label>Workflow execution ID<input style={fieldStyle} value={workflowId} onChange={e => setWorkflowId(e.target.value)} placeholder="Workflow ID" /></label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 16 }}>
        <button style={buttonStyle} disabled={busy || !workflowId.trim()} onClick={() => perform(async () => { setWorkflow(await call("workflows/" + encodeURIComponent(workflowId.trim())) as Workflow); })}>Refresh status</button>
        <button style={buttonStyle} disabled={busy || !workflowId.trim() || (workflow?.status !== "FAILED")} onClick={() => perform(async () => { setWorkflow(await call("workflows/" + encodeURIComponent(workflowId.trim()) + "/resume", {}) as Workflow); })}>Resume failed workflow</button>
      </div>
      {workflow && <><p><strong>Status:</strong> {workflow.status ?? "Unknown"} · <strong>Step:</strong> {workflow.currentStep ?? "Unknown"}</p><details><summary>Workflow details and checkpoints</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(workflow, null, 2)}</pre></details></>}
    </section>
    <section style={{ background: "white", borderRadius: 14, padding: 24, marginTop: 20 }}>
      <h2 style={{ marginTop: 0 }}>4. Pending human approvals</h2>
      <p style={{ color: "#64748b" }}>Read-only approval inbox. Decisions are blocked until individual approver authentication is available.</p>
      <button style={buttonStyle} disabled={busy} onClick={() => perform(async () => { setPendingApprovals(await call("approvals/pending")); })}>Refresh approval inbox</button>
      {Array.isArray(pendingApprovals) && <p>{pendingApprovals.length} pending approval(s)</p>}
      {pendingApprovals !== null && <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", background: "#f1f5f9", padding: 16, borderRadius: 8 }}>{JSON.stringify(pendingApprovals, null, 2)}</pre>}
    </section>
    {error && <p role="alert" style={{ color: "#a11919", padding: 16, background: "#fff1f1", borderRadius: 8 }}>{error}</p>}
    <p style={{ marginTop: 24, color: "#64748b", fontSize: 13 }}>Approval decisions are intentionally unavailable in this console until per-user authentication and approver identity verification are implemented.</p>
  </main>;
}
