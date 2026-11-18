"use client";
import { useState } from "react";

type Workflow = { workflowExecutionId?: string; id?: string; status?: string; currentStep?: string; correlationId?: string; output?: unknown; steps?: unknown[] };
export default function Home() {
  const [organizationId, setOrganizationId] = useState("");
  const [token, setToken] = useState("");
  const [goal, setGoal] = useState("");
  const [objectiveId, setObjectiveId] = useState("");
  const [newObjectiveName, setNewObjectiveName] = useState("");
  const [newObjectiveDescription, setNewObjectiveDescription] = useState("");
  const [workflowId, setWorkflowId] = useState("");
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [agents, setAgents] = useState<unknown>(null);
  const [pendingApprovals, setPendingApprovals] = useState<unknown>(null);
  const [identity, setIdentity] = useState<{userId:string;organizationId:string;email:string;role:string}|null>(null);
  const [approvalRationale, setApprovalRationale] = useState("");
  const [selectedApprovalId, setSelectedApprovalId] = useState("");
  const [assessment, setAssessment] = useState<unknown>(null);
  const [overview, setOverview] = useState<Record<string, number> | null>(null);
  const [campaigns, setCampaigns] = useState<Array<{id:string;code:string;name:string;status:string;riskLevel:string;updatedAt:string}>>([]);
  const [objectives, setObjectives] = useState<Array<{id:string;name:string;status:string}>>([]);
  const [products, setProducts] = useState<Array<{id:string;name:string;code:string}>>([]);
  const [workflows, setWorkflows] = useState<Array<{id:string;status:string;currentStep:string}>>([]);
  const [agentHistory, setAgentHistory] = useState<Array<{id:string;agentId:string;status:string}>>([]);
  const [campaignDetail, setCampaignDetail] = useState<unknown>(null);
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
  async function decide(decision: "APPROVED" | "REJECTED") {
    if (!identity || identity.organizationId !== organizationId.trim()) throw new Error("Verify your individual OIDC identity before deciding");
    if (!selectedApprovalId || !approvalRationale.trim()) throw new Error("Select an approval and provide a rationale");
    await call("approvals/decide", {
      commandId: crypto.randomUUID(), correlationId: crypto.randomUUID(), organizationId: identity.organizationId,
      approvalId: selectedApprovalId, approverUserId: identity.userId, decision, rationale: approvalRationale.trim()
    });
    setPendingApprovals(await call("approvals/pending"));
    setApprovalRationale(""); setSelectedApprovalId("");
    await loadDashboard();
  }
  async function loadDashboard() {
    const [summary, portfolio, objectiveList, productList, workflowList, history, approvals] = await Promise.all([
      call("overview"), call("campaigns"), call("objectives"), call("products"), call("workflows"), call("agents/executions"), call("approvals/pending")
    ]);
    setOverview(summary as Record<string, number>);
    setCampaigns(portfolio as typeof campaigns);
    setObjectives(objectiveList as typeof objectives);
    setProducts(productList as typeof products);
    setWorkflows(workflowList as typeof workflows);
    setAgentHistory(history as typeof agentHistory);
    setPendingApprovals(approvals);
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
      <button style={{ ...buttonStyle, marginTop: 16, marginLeft: 12 }} disabled={busy} onClick={() => perform(async () => { setIdentity(await call("me") as typeof identity); })}>Verify individual identity (OIDC)</button>
      {identity && <p>Signed in as {identity.email} · {identity.role}</p>}
      {agents !== null && <details style={{ marginTop: 14 }}><summary>Agent roster</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(agents, null, 2)}</pre></details>}
    </section>
    <section style={{ background: "white", borderRadius: 14, padding: 24, marginTop: 20 }}>
      <h2 style={{ marginTop: 0 }}>2. Portfolio and operational overview</h2>
      <button style={buttonStyle} disabled={busy} onClick={() => perform(loadDashboard)}>Refresh command center</button>
      {overview && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(145px,1fr))", gap: 12, marginTop: 18 }}>
        {Object.entries(overview).map(([label, value]) => <div key={label} style={{ border: "1px solid #dbe4ed", borderRadius: 12, padding: 16, background: "#f8fafc" }}><div style={{ fontSize: 28, fontWeight: 800, color: "#124d83" }}>{value}</div><div style={{ fontSize: 12, color: "#64748b" }}>{label.replace(/([A-Z])/g, " $1")}</div></div>)}
      </div>}
      <h3>Campaign portfolio</h3>
      {campaigns.length === 0 ? <p style={{ color: "#64748b" }}>No campaigns loaded.</p> : <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}><thead><tr><th>Campaign</th><th>Status</th><th>Risk</th><th>Action</th></tr></thead><tbody>{campaigns.map(c => <tr key={c.id}><td style={{ padding: 10, borderTop: "1px solid #e2e8f0" }}><strong>{c.name}</strong><div style={{ fontSize: 12 }}>{c.code}</div></td><td>{c.status}</td><td>{c.riskLevel}</td><td><button disabled={busy} onClick={() => perform(async () => { setCampaignDetail(await call("campaigns/" + encodeURIComponent(c.id))); })}>Inspect</button></td></tr>)}</tbody></table></div>}
      {campaignDetail !== null && <details open style={{ marginTop: 12 }}><summary>Campaign detail, approval records and audit history</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(campaignDetail, null, 2)}</pre></details>}
      {identity && <div style={{ border: "1px solid #dbe4ed", padding: 14, borderRadius: 10, marginBottom: 12 }}>
        <label>New objective name<input style={fieldStyle} value={newObjectiveName} onChange={e => setNewObjectiveName(e.target.value)} /></label>
        <label style={{ display: "block", marginTop: 10 }}>Description<textarea style={fieldStyle} value={newObjectiveDescription} onChange={e => setNewObjectiveDescription(e.target.value)} /></label>
        <button style={{ ...buttonStyle, marginTop: 12 }} disabled={busy || newObjectiveName.trim().length < 3 || !newObjectiveDescription.trim()} onClick={() => perform(async () => {
          const created = await call("objectives", { name: newObjectiveName.trim(), description: newObjectiveDescription.trim() }) as {id:string};
          setObjectiveId(created.id); setNewObjectiveName(""); setNewObjectiveDescription(""); await loadDashboard();
        })}>Create governed objective</button>
      </div>}
      <h3>Active marketing objectives</h3>
      <label>Choose objective<select style={fieldStyle} value={objectiveId} onChange={e => setObjectiveId(e.target.value)}><option value="">Choose an existing objective</option>{objectives.map(o => <option key={o.id} value={o.id}>{o.name} ({o.status})</option>)}</select></label>
      <details style={{ marginTop: 12 }}><summary>Products ({products.length})</summary><ul>{products.map(p => <li key={p.id}>{p.code} — {p.name}</li>)}</ul></details>
      <details style={{ marginTop: 12 }}><summary>Recent workflows ({workflows.length})</summary><ul>{workflows.map(w => <li key={w.id}><button onClick={() => { setWorkflowId(w.id); setWorkflow({ id: w.id, status: w.status, currentStep: w.currentStep }); }}>{w.id}</button> — {w.status} / {w.currentStep}</li>)}</ul></details>
      <details style={{ marginTop: 12 }}><summary>Agent execution history ({agentHistory.length})</summary><ul>{agentHistory.map(a => <li key={a.id}>{a.agentId} — {a.status}</li>)}</ul></details>
    </section>
    <section style={{ background: "white", borderRadius: 14, padding: 24, marginTop: 20 }}>
      <h2 style={{ marginTop: 0 }}>3. Assess and initiate a campaign</h2>
      <label>Marketing objective<textarea style={{ ...fieldStyle, minHeight: 100 }} value={goal} onChange={e => setGoal(e.target.value)} placeholder="Launch an oncology genomics awareness campaign in Egypt" /></label>
      <label style={{ display: "block", marginTop: 14 }}>Existing marketing objective ID (required to create a campaign)<input style={fieldStyle} value={objectiveId} onChange={e => setObjectiveId(e.target.value)} placeholder="UUID from marketing objectives" /></label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 16 }}>
        <button style={buttonStyle} disabled={busy || !goal.trim()} onClick={() => perform(async () => { setAssessment(await call("requests", request)); })}>Assess objective</button>
        <button style={buttonStyle} disabled={busy || !goal.trim()} onClick={() => perform(async () => { const result = await call("workflows", request) as Workflow; setWorkflow(result); if (result.workflowExecutionId) setWorkflowId(result.workflowExecutionId); })}>Start governed workflow</button>
      </div>
      {assessment !== null && <details open style={{ marginTop: 16 }}><summary>Assessment result</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(assessment, null, 2)}</pre></details>}
    </section>
    <section style={{ background: "white", borderRadius: 14, padding: 24, marginTop: 20 }}>
      <h2 style={{ marginTop: 0 }}>4. Monitor and recover workflow</h2>
      <label>Workflow execution ID<input style={fieldStyle} value={workflowId} onChange={e => setWorkflowId(e.target.value)} placeholder="Workflow ID" /></label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 16 }}>
        <button style={buttonStyle} disabled={busy || !workflowId.trim()} onClick={() => perform(async () => { setWorkflow(await call("workflows/" + encodeURIComponent(workflowId.trim())) as Workflow); })}>Refresh status</button>
        <button style={buttonStyle} disabled={busy || !workflowId.trim() || (workflow?.status !== "FAILED")} onClick={() => perform(async () => { setWorkflow(await call("workflows/" + encodeURIComponent(workflowId.trim()) + "/resume", {}) as Workflow); })}>Resume failed workflow</button>
      </div>
      {workflow && <><p><strong>Status:</strong> {workflow.status ?? "Unknown"} · <strong>Step:</strong> {workflow.currentStep ?? "Unknown"}</p><details><summary>Workflow details and checkpoints</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(workflow, null, 2)}</pre></details></>}
    </section>
    <section style={{ background: "white", borderRadius: 14, padding: 24, marginTop: 20 }}>
      <h2 style={{ marginTop: 0 }}>5. Pending human approvals</h2>
      <p style={{ color: "#64748b" }}>Approval decisions require a verified OIDC user and an authorized marketing role. Shared bootstrap tokens cannot approve.</p>
      <button style={buttonStyle} disabled={busy} onClick={() => perform(async () => { setPendingApprovals(await call("approvals/pending")); })}>Refresh approval inbox</button>
      {Array.isArray(pendingApprovals) && <p>{pendingApprovals.length} pending approval(s)</p>}
      {identity && Array.isArray(pendingApprovals) && pendingApprovals.length > 0 && <div style={{ marginTop: 16 }}>
        <label>Approval to decide<select style={fieldStyle} value={selectedApprovalId} onChange={e => setSelectedApprovalId(e.target.value)}>
          <option value="">Choose pending approval</option>
          {(pendingApprovals as Array<{id:string;objectType:string;objectId:string;riskLevel:string}>).map(a => <option key={a.id} value={a.id}>{a.objectType} {a.objectId} ({a.riskLevel})</option>)}
        </select></label>
        <label style={{ display: "block", marginTop: 12 }}>Decision rationale<textarea style={{ ...fieldStyle, minHeight: 70 }} value={approvalRationale} onChange={e => setApprovalRationale(e.target.value)} /></label>
        <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
          <button style={buttonStyle} disabled={busy || !selectedApprovalId || !approvalRationale.trim()} onClick={() => perform(() => decide("APPROVED"))}>Approve</button>
          <button style={{ ...buttonStyle, background: "#9f3030" }} disabled={busy || !selectedApprovalId || !approvalRationale.trim()} onClick={() => perform(() => decide("REJECTED"))}>Reject</button>
        </div>
      </div>}
      {pendingApprovals !== null && <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", background: "#f1f5f9", padding: 16, borderRadius: 8 }}>{JSON.stringify(pendingApprovals, null, 2)}</pre>}
    </section>
    {error && <p role="alert" style={{ color: "#a11919", padding: 16, background: "#fff1f1", borderRadius: 8 }}>{error}</p>}
    <p style={{ marginTop: 24, color: "#64748b", fontSize: 13 }}>Approval decisions require a verified OIDC identity and an authorized database role. Manual token entry is for restricted pilot testing only.</p>
  </main>;
}
