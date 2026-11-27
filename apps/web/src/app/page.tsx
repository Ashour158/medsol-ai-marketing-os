"use client";
import { useEffect, useState } from "react";
import AlphaExecutiveDashboard from "./alpha-executive-dashboard";
import AlphaBrainMap from "./alpha-brain-map";
import { WORKSPACE_LINKS } from "../lib/workspace-navigation";
import OperationsConsole from "./operations-console";
import WorkspaceNavigation from "./workspace-navigation";
import CreativeGovernanceStudio from "./creative-governance-studio";
import CampaignPublicationStudio from "./campaign-publication-studio";
import SyntheticEmailStudio from "./synthetic-email-studio";
import IntegrationGovernanceStudio from "./integration-governance-studio";
import {BlueprintVirtualStudio} from "./blueprint-virtual-studio";
import OfflineDagStudio from "./offline-dag-studio";
import KnowledgeFabricStudio from "./knowledge-fabric-studio";
import MarketIntelligenceStudio from "./market-intelligence-studio";
import MemoryGraphStudio from "./memory-graph-studio";
import R3AcceptanceStudio from "./r3-release-acceptance-studio";
import GovernedToolRegistryStudio from "./governed-tool-registry-studio";
import AgentReleaseStudio from "./agent-release-studio";
import OfflineTeamAssemblyStudio from "./offline-team-assembly-studio";
import ProviderContractTrialStudio from "./provider-contract-trial-studio";
import OfflineSubscriptionStudio from "./offline-subscription-studio";
import OfflineCampaignJourneyStudio from "./offline-campaign-journey-studio";
import CampaignReadinessBoard from "./campaign-readiness-board";
import CustomerDeliveryDossierStudio from "./customer-delivery-dossier-studio";
import {gapCounts,gapInventoryCsv,gapClosureStatus} from "../lib/blueprint-gap-register";

class MarketingRequestError extends Error {
  constructor(message:string,readonly status:number){super(message);}
}

type Workflow = { workflowExecutionId?: string; id?: string; status?: string; currentStep?: string; correlationId?: string; output?: unknown; steps?: unknown[] };
export default function Home() {
  const [focused,setFocused]=useState("");
  const [brainRunsLoaded,setBrainRunsLoaded]=useState(false);
  const [navigationRevision,setNavigationRevision]=useState(0);
  const [campaignHandoff,setCampaignHandoff]=useState<{organizationId:string;userId:string;campaignId:string;revision:number}|null>(null);
  const focusRoot=focused==="performance"?"operations":["workflow-studio","blueprint-studio","market-intelligence","knowledge","memory","acceptance"].includes(focused)?"agent-brain":focused;
  const isHidden=(id:string)=>!!focusRoot&&focusRoot!==id;
  function navigateWorkspace(id:string){
    if(!WORKSPACE_LINKS.some(x=>x.id===id))return;
    setFocused(id);setNavigationRevision(n=>n+1);
  }
  useEffect(()=>{
    if(!focused)return;
    const target=document.getElementById(focused);
    if(!target)return;
    // The campaign handoff remounts its editor to clear stale state.
    // Its root is a closed details element inside the navigation wrapper,
    // not an ancestor. Open that exact workspace before focusing.
    if(focused==="journey"){
      const journey=target.querySelector('details[aria-label="Complete offline campaign journey workspace"]');
      if(journey instanceof HTMLDetailsElement)journey.open=true;
    }
    let current=target.parentElement;
    while(current){if(current instanceof HTMLDetailsElement)current.open=true;current=current.parentElement;}
    target.scrollIntoView({block:"start"});
    target.setAttribute("tabindex","-1");target.focus({preventScroll:true});
  },[focused,navigationRevision]);
  const [organizationId, setOrganizationId] = useState("");
  const [goal, setGoal] = useState("");
  const [objectiveId, setObjectiveId] = useState("");
  const [campaignBrandId, setCampaignBrandId] = useState("");
  const [newObjectiveName, setNewObjectiveName] = useState("");
  const [newObjectiveDescription, setNewObjectiveDescription] = useState("");
  const [workflowId, setWorkflowId] = useState("");
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [agents, setAgents] = useState<unknown>(null);
  const [pendingApprovals, setPendingApprovals] = useState<unknown>(null);
  const [approvalInboxUnavailable,setApprovalInboxUnavailable]=useState(false);
  const [identity, setIdentity] = useState<{userId:string;organizationId:string;email:string;role:string}|null>(null);
  const [offlineHandoff,setOfflineHandoff]=useState<{
   organizationId:string;userId:string;manifest:string;revision:number
  }|null>(null);
  const [approvalRationale, setApprovalRationale] = useState("");
  const [selectedApprovalId, setSelectedApprovalId] = useState("");
  const [assessment, setAssessment] = useState<unknown>(null);
  const [overview, setOverview] = useState<Record<string, number> | null>(null);
  const [campaigns, setCampaigns] = useState<Array<{id:string;code:string;name:string;status:string;riskLevel:string;updatedAt:string}>>([]);
  const [objectives, setObjectives] = useState<Array<{id:string;name:string;status:string}>>([]);
  const [products, setProducts] = useState<Array<{id:string;name:string;code:string;lifecycle?:string}>>([]);
  const [workflows, setWorkflows] = useState<Array<{id:string;status:string;currentStep:string}>>([]);
  const [modelBudget, setModelBudget] = useState<{enabled:boolean;limitMicros?:string;spentMicros?:string;reservedMicros?:string}|null>(null);
  const [agentOperations, setAgentOperations] = useState<{total:number;byStatus:Record<string,number>;recent:Array<{id:string;agentId:string;status:string}>}|null>(null);
  const [agentDetail, setAgentDetail] = useState<unknown>(null);
  const [brainPlan, setBrainPlan] = useState<unknown>(null);
  const [blueprintInventory,setBlueprintInventory]=useState<{
   version:string;targetStateOnly:boolean;counts:Record<string,number>;
   engines:Array<{id:string;name:string;release:string;state:string;owner:string}>;
   workflows:Array<{id:string;name:string;release:string;state:string;owner:string}>;
   studios:Array<{id:string;name:string;release:string;state:string;owner:string}>;
   brains:Array<{id:string;name:string;canonicalAgentId:string}>;
   personas:Array<{id:string;name:string;canonicalAgentId:string}>;
  }|null>(null);
  const [brainAssessment, setBrainAssessment] = useState<unknown>(null);
  const [brainRuns, setBrainRuns] = useState<Array<{id:string;status:string;commandKey:string;updatedAt:string;currentAgentId?:string|null}>>([]);
  const [brainRunId, setBrainRunId] = useState("");
  const [brainCampaignId, setBrainCampaignId] = useState("");
  const [brainRunDetail, setBrainRunDetail] = useState<unknown>(null);
  const [brainRecovery, setBrainRecovery] = useState<unknown>(null);
  const [quarantineReason, setQuarantineReason] = useState("");
  const [cancelBrainReason,setCancelBrainReason]=useState("");
  const canManageBrain=!!identity&&["ADMIN","SUPER_ADMIN","CMO","MARKETING_DIRECTOR"].includes(identity.role.toUpperCase());
  const [learningSignals, setLearningSignals] = useState<unknown>(null);
  const [skillProposals, setSkillProposals] = useState<unknown>(null);
  const [agentHistory, setAgentHistory] = useState<Array<{id:string;agentId:string;status:string}>>([]);
  const [campaignDetail, setCampaignDetail] = useState<unknown>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Presentation-only handoff: the receiving journey must re-read canonical
  // campaign data under its signed tenant session before taking any action.
  function openCampaign(id:string){
    if(!identity||! /^[A-Za-z0-9_-]{1,128}$/.test(id))return;
    setCampaignHandoff(previous=>({organizationId:identity.organizationId,userId:identity.userId,campaignId:id,revision:(previous?.revision??0)+1}));
    navigateWorkspace("journey");
  }
  async function call(path: string, body?: unknown): Promise<unknown> {

    const response = await fetch("/api/marketing/" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { ...(body === undefined ? {} : { "content-type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: "no-store"
    });
    const result: unknown = await response.json();
    if (!response.ok) throw new MarketingRequestError(typeof result === "object" && result !== null && "message" in result ? String(result.message) : "Request failed (" + response.status + ")",response.status);
    return result;
  }
  async function decide(decision: "APPROVED" | "REJECTED") {
    if (!identity || identity.organizationId !== organizationId.trim()) throw new Error("Verify your individual OIDC identity before deciding");
    if (!selectedApprovalId || !approvalRationale.trim()) throw new Error("Select an approval and provide a rationale");
    await call("approvals/decide", {
      commandId: crypto.randomUUID(), correlationId: crypto.randomUUID(), organizationId: identity.organizationId,
      approvalId: selectedApprovalId, approverUserId: identity.userId, decision, rationale: approvalRationale.trim()
    });
    setApprovalRationale(""); setSelectedApprovalId("");
    await loadDashboard();
  }
  async function loadApprovalInbox(){
    setPendingApprovals(null);setSelectedApprovalId("");setApprovalRationale("");setApprovalInboxUnavailable(false);
    try{
      const approvals=await call("approvals/pending");
      if(!Array.isArray(approvals))throw new Error("Invalid approval inbox response");
      setPendingApprovals(approvals);
    }catch(e){
      // The server decides access, including custom role policy. Only an explicit
      // forbidden inbox response is optional; never suppress session or service failures.
      if(e instanceof MarketingRequestError&&e.status===403){setApprovalInboxUnavailable(true);return;}
      throw e;
    }
  }
  async function loadDashboard() {
    const [summary, portfolio, objectiveList, productList, workflowList, history] = await Promise.all([
      call("overview"), call("campaigns"), call("objectives"), call("products"), call("workflows"), call("agents/executions")
    ]);
    setOverview(summary as Record<string, number>);
    setCampaigns(portfolio as typeof campaigns);
    setObjectives(objectiveList as typeof objectives);
    setProducts(productList as typeof products);
    setWorkflows(workflowList as typeof workflows);
    setAgentHistory(history as typeof agentHistory);
    await loadApprovalInbox();
  }
  async function perform(action: () => Promise<void>) {
    setBusy(true); setError("");
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : "Unexpected error"); }
    finally { setBusy(false); }
  }
  const request = { organizationId: organizationId.trim(), requestedOutcome: goal.trim(), ...(objectiveId.trim() ? { objectiveId: objectiveId.trim() } : {}), ...(campaignBrandId.trim()?{brandId:campaignBrandId.trim()}: {}) };
  const buttonStyle = { padding: "11px 16px", background: "#124d83", color: "white", border: 0, borderRadius: 8, cursor: "pointer", fontWeight: 700 as const };
  const fieldStyle = { width: "100%", boxSizing: "border-box" as const, padding: 12, border: "1px solid #cbd5e1", borderRadius: 8, marginTop: 6 };
  return <main className="alpha-shell">
    <header className="alpha-header">
      <div><div className="alpha-brand"><span className="alpha-brand-mark" aria-hidden="true">M</span>MEDSOL · AI MARKETING OS</div>
      <h1>Marketing Command Center</h1>
      <p>One workspace for campaign strategy, governed AI agents, creative production and operational intelligence.</p></div>
      <div className="alpha-environment"><strong>Internal Alpha</strong><br/>Offline simulations · Human approval required</div>
    </header>
    <WorkspaceNavigation authenticated={Boolean(identity)} focused={focused} onNavigate={navigateWorkspace} onShowAll={()=>setFocused("")}/>
    <div className="alpha-content">
    {focused&&<div className="alpha-focus-bar"><strong>{WORKSPACE_LINKS.find(x=>x.id===focused)?.label}</strong><button type="button" onClick={()=>navigateWorkspace("identity")}>Account & session</button><button type="button" onClick={()=>setFocused("")}>Return to all workspaces</button><span className="alpha-subtle">If a workspace is unavailable, sign in with an authorized role or return to the directory.</span></div>}
    {!focused&&<AlphaExecutiveDashboard authenticated={!!identity} overview={overview} campaigns={campaigns} runs={brainRunsLoaded?brainRuns:null} approvals={pendingApprovals} approvalUnavailable={approvalInboxUnavailable} busy={busy} onRefresh={()=>void perform(async()=>{await loadDashboard();try{setBrainRuns(await call("brain/runs") as typeof brainRuns);setBrainRunsLoaded(true);}catch(e){setBrainRuns([]);setBrainRunsLoaded(false);if(!(e instanceof MarketingRequestError&&e.status===403))throw e;}})} onNavigate={navigateWorkspace} onOpenCampaign={openCampaign}/>}
    <section id="identity" hidden={isHidden("identity")} style={{ scrollMarginTop: 120, background: "white", borderRadius: 14, padding: 24, marginTop: 24 }}>
      <h2 style={{ marginTop: 0 }}>1. Connect to your organization</h2>
      <p style={{ color: "#64748b", fontSize: 13 }}>Sign in through your organization's identity provider. Sessions use encrypted HTTP-only cookies and authenticated requests are proxied server-side.</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <a href="/api/auth/login" style={{ ...buttonStyle, textDecoration: "none" }}>Sign in with organization SSO</a>
        <button style={buttonStyle} disabled={busy} onClick={() => perform(async () => {
          const me = await call("me") as {userId:string;organizationId:string;email:string;role:string};
          setIdentity(me); setOrganizationId(me.organizationId); setAgents(await call("agents")); await loadDashboard();
        })}>Load authenticated workspace</button>
        <button style={{ ...buttonStyle, background: "#475569" }} disabled={busy} onClick={() => perform(async () => {
          const response = await fetch("/api/auth/logout", { method: "POST", headers: { "content-type": "application/json" } });
          if (!response.ok) throw new Error("Logout failed");
          window.location.reload();
        })}>Sign out</button>
      </div>
      {identity && <p>Signed in as {identity.email} · {identity.role}</p>}
      {identity&&<OfflineSubscriptionStudio identity={identity}/>}
      {agents !== null && <details style={{ marginTop: 14 }}><summary>Agent roster</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(agents, null, 2)}</pre></details>}
    </section>
    <div data-workspace-panel hidden={isHidden("readiness-board")}><CampaignReadinessBoard key={identity?identity.organizationId+":"+identity.userId:"signed-out"} identity={identity} onNavigate={navigateWorkspace} onOpenCampaign={openCampaign}/></div>
    <div data-workspace-panel hidden={isHidden("delivery-dossier")}><CustomerDeliveryDossierStudio key={identity?identity.organizationId+":"+identity.userId:"signed-out"} identity={identity}/></div>
    <div id="journey" data-workspace-panel hidden={isHidden("journey")} style={{scrollMarginTop:120}}><OfflineCampaignJourneyStudio key={identity?identity.organizationId+":"+identity.userId+":"+(campaignHandoff?.organizationId===identity.organizationId&&campaignHandoff?.userId===identity.userId?campaignHandoff.revision:0):"signed-out"} identity={identity} campaigns={identity?campaigns:[]} products={identity?products:[]} campaignHandoff={campaignHandoff}/></div>
    <div id="creative" data-workspace-panel hidden={isHidden("creative")} style={{scrollMarginTop:120}}><CreativeGovernanceStudio key={identity?identity.organizationId+":"+identity.userId:"signed-out"} identity={identity} /></div>
    <div id="social" data-workspace-panel hidden={isHidden("social")} style={{scrollMarginTop:120}}><CampaignPublicationStudio key={identity?identity.organizationId+":"+identity.userId:"signed-out"} identity={identity}/></div>
    <div id="email" data-workspace-panel hidden={isHidden("email")} style={{scrollMarginTop:120}}><SyntheticEmailStudio key={identity?identity.organizationId+":"+identity.userId:"signed-out"} identity={identity}/></div>
    <div id="tool-registry" data-workspace-panel hidden={isHidden("tool-registry")} style={{scrollMarginTop:120}}><GovernedToolRegistryStudio identity={identity}/></div>
    <div id="agent-studio" data-workspace-panel hidden={isHidden("agent-studio")} style={{scrollMarginTop:120}}><AgentReleaseStudio identity={identity}/>{identity&&<OfflineTeamAssemblyStudio key={identity.organizationId+":"+identity.userId} identity={identity} onPrepare={manifest=>{setOfflineHandoff(previous=>({organizationId:identity.organizationId,userId:identity.userId,manifest,revision:(previous?.revision??0)+1}));navigateWorkspace("workflow-studio");}}/>}</div>
    <div id="provider-trials" data-workspace-panel hidden={isHidden("provider-trials")} style={{scrollMarginTop:120}}><ProviderContractTrialStudio identity={identity}/></div>
    <div id="integrations" data-workspace-panel hidden={isHidden("integrations")} style={{scrollMarginTop:120}}><IntegrationGovernanceStudio identity={identity}/></div>
    <div id="operations" data-workspace-panel hidden={isHidden("operations")} style={{scrollMarginTop:120}}><OperationsConsole key={identity?identity.organizationId+":"+identity.userId:"signed-out"}
      identity={identity} onRunSelected={id => {
      setBrainRunId(id);setBrainRunDetail(null);setBrainRecovery(null);
      if(focused)navigateWorkspace("agent-brain");
      void perform(async()=>setBrainRunDetail(await call("brain/runs/"+encodeURIComponent(id))));
    }} /></div>
    <section id="portfolio" hidden={isHidden("portfolio")} style={{ scrollMarginTop: 120, background: "white", borderRadius: 14, padding: 24, marginTop: 20 }}>
      <h2 style={{ marginTop: 0 }}>2. Portfolio and operational overview</h2>
      <button style={buttonStyle} disabled={busy} onClick={() => perform(loadDashboard)}>Refresh command center</button>
      {overview && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(145px,1fr))", gap: 12, marginTop: 18 }}>
        {Object.entries(overview).map(([label, value]) => <div key={label} style={{ border: "1px solid #dbe4ed", borderRadius: 12, padding: 16, background: "#f8fafc" }}><div style={{ fontSize: 28, fontWeight: 800, color: "#124d83" }}>{value}</div><div style={{ fontSize: 12, color: "#64748b" }}>{label.replace(/([A-Z])/g, " $1")}</div></div>)}
      </div>}
      <h3>Campaign portfolio</h3>
      {campaigns.length === 0 ? <p style={{ color: "#64748b" }}>No campaigns loaded.</p> : <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}><thead><tr><th>Campaign</th><th>Status</th><th>Risk</th><th>Action</th></tr></thead><tbody>{campaigns.map(c => <tr key={c.id}><td style={{ padding: 10, borderTop: "1px solid #e2e8f0" }}><strong>{c.name}</strong><div style={{ fontSize: 12 }}>{c.code}</div></td><td>{c.status}</td><td>{c.riskLevel}</td><td><button disabled={busy} onClick={() => perform(async () => { setCampaignDetail(await call("campaigns/" + encodeURIComponent(c.id))); })}>Inspect</button>{" "}<button disabled={!identity||busy} type="button" onClick={()=>openCampaign(c.id)}>Open campaign</button></td></tr>)}</tbody></table></div>}
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
      <div style={{ marginTop: 18, borderTop: "1px solid #e2e8f0", paddingTop: 14 }}>
        <h3>Agent operations and policy trace</h3>
        <p style={{ color: "#64748b", fontSize: 13 }}>Restricted to marketing audit-authorized roles. Trace output is advisory and may contain sensitive operational metadata.</p>
        <button style={buttonStyle} disabled={busy} onClick={() => perform(async () => {
          const [operations, budget] = await Promise.all([call("agents/operations"), call("agents/budget")]);
          setAgentOperations(operations as typeof agentOperations);
          setModelBudget(budget as typeof modelBudget);
        })}>Load agent operations</button>
        {modelBudget && <p><strong>Model budget:</strong> {modelBudget.enabled
          ? "Limit " + (Number(modelBudget.limitMicros) / 1000000).toFixed(2) + " · Spent " + (Number(modelBudget.spentMicros) / 1000000).toFixed(2) + " · Reserved " + (Number(modelBudget.reservedMicros) / 1000000).toFixed(2) + " (provider currency units)"
          : "Disabled — no tenant budget provisioned"}</p>}
        {agentOperations && <><p>Total executions: {agentOperations.total} · {Object.entries(agentOperations.byStatus).map(([k,v]) => k + ": " + v).join(" · ")}</p>
          <ul>{agentOperations.recent.map(a => <li key={a.id}>{a.agentId} — {a.status} <button disabled={busy} onClick={() => perform(async () => setAgentDetail(await call("agents/executions/" + encodeURIComponent(a.id))))}>Inspect trace</button></li>)}</ul>
        </>}
        {agentDetail !== null && <details open><summary>Selected execution audit trace</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(agentDetail, null, 2)}</pre></details>}
      </div>
    </section>
    <section id="strategy" hidden={isHidden("strategy")} style={{ scrollMarginTop: 120, background: "white", borderRadius: 14, padding: 24, marginTop: 20 }}>
      <h2 style={{ marginTop: 0 }}>3. Assess and initiate a campaign</h2>
      <label>Marketing objective<textarea style={{ ...fieldStyle, minHeight: 100 }} value={goal} onChange={e => setGoal(e.target.value)} placeholder="Launch an oncology genomics awareness campaign in Egypt" /></label>
      <label style={{ display: "block", marginTop: 14 }}>Existing marketing objective ID (required to create a campaign)<input style={fieldStyle} value={objectiveId} onChange={e => setObjectiveId(e.target.value)} placeholder="UUID from marketing objectives" /></label>
      <label style={{display:"block",marginTop:14}}>Tenant brand ID (required for R2 sandbox publication)<input style={fieldStyle} value={campaignBrandId} onChange={e=>setCampaignBrandId(e.target.value)} placeholder="Existing active tenant Brand ID"/></label>
      <p style={{fontSize:12,color:"#64748b"}}>The existing 13-agent governed workflow creates a brand-bound campaign. It still requires independent human campaign approval, plus a separate creative approval, before any R2 sandbox simulation.</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 16 }}>
        <button style={buttonStyle} disabled={busy || !goal.trim()} onClick={() => perform(async () => { setAssessment(await call("requests", request)); })}>Assess objective</button>
        <button style={buttonStyle} disabled={busy || !goal.trim()} onClick={() => perform(async () => { const result = await call("workflows", request) as Workflow; setWorkflow(result); if (result.workflowExecutionId) setWorkflowId(result.workflowExecutionId); })}>Start governed workflow</button>
      </div>
      {assessment !== null && <details open style={{ marginTop: 16 }}><summary>Assessment result</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(assessment, null, 2)}</pre></details>}
    </section>
    <section id="workflow-operations" hidden={isHidden("workflow-operations")} style={{ scrollMarginTop: 120, background: "white", borderRadius: 14, padding: 24, marginTop: 20 }}>
      <h2 style={{ marginTop: 0 }}>4. Monitor and recover workflow</h2>
      <label>Workflow execution ID<input style={fieldStyle} value={workflowId} onChange={e => setWorkflowId(e.target.value)} placeholder="Workflow ID" /></label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 16 }}>
        <button style={buttonStyle} disabled={busy || !workflowId.trim()} onClick={() => perform(async () => { setWorkflow(await call("workflows/" + encodeURIComponent(workflowId.trim())) as Workflow); })}>Refresh status</button>
        <button style={buttonStyle} disabled={busy || !workflowId.trim() || (workflow?.status !== "FAILED")} onClick={() => perform(async () => { setWorkflow(await call("workflows/" + encodeURIComponent(workflowId.trim()) + "/resume", {}) as Workflow); })}>Resume failed workflow</button>
      </div>
      {workflow && <><p><strong>Status:</strong> {workflow.status ?? "Unknown"} · <strong>Step:</strong> {workflow.currentStep ?? "Unknown"}</p><details><summary>Workflow details and checkpoints</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(workflow, null, 2)}</pre></details></>}
    </section>
    <section id="approvals" hidden={isHidden("approvals")} style={{ scrollMarginTop: 120, background: "white", borderRadius: 14, padding: 24, marginTop: 20 }}>
      <h2 style={{ marginTop: 0 }}>5. Pending human approvals</h2>
      <p style={{ color: "#64748b" }}>Approval decisions require a verified OIDC user and an authorized marketing role. Shared bootstrap tokens cannot approve.</p>
      <button style={buttonStyle} disabled={busy||!identity} onClick={() => perform(loadApprovalInbox)}>Refresh approval inbox</button>
      {approvalInboxUnavailable&&<p>Approval inbox is not available for your current permissions. Your permitted portfolio remains accessible.</p>}
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
    <section id="agent-brain" hidden={isHidden("agent-brain")} style={{ scrollMarginTop: 120, background: "white", borderRadius: 14, padding: 24, marginTop: 20 }}>
      <h2 style={{ marginTop: 0 }} id="brain-operations">Marketing Brain & Learning Intelligence</h2>
      <p style={{ color: "#64748b" }}>Review all agent stages, evidence quarantine and proposed skills. No automatic skill activation or external publishing.</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <button style={buttonStyle} disabled={busy} onClick={() => perform(async () => setBrainPlan(await call("brain/plan")))}>Load brain map</button>
        <button style={buttonStyle} disabled={busy || !goal.trim()} onClick={() => perform(async () => setBrainAssessment(await call("brain/assess", {requestedOutcome:goal,correlationId:crypto.randomUUID()})))}>Run 13-agent review</button>
        <button style={buttonStyle} disabled={busy} onClick={() => perform(async () => { const [signals,proposals]=await Promise.all([call("learning/signals"),call("learning/proposals")]);setLearningSignals(signals);setSkillProposals(proposals); })}>Refresh learning intelligence</button>
      </div>
      <AlphaBrainMap key={identity?identity.organizationId+":"+identity.userId:"signed-out"} plan={brainPlan} roster={agents} run={brainRunDetail} authenticated={!!identity} onNavigate={navigateWorkspace}/>
      <div style={{ marginTop: 20, padding: 16, border: "1px solid #dbe4ed", borderRadius: 10 }}>
        <h3>Durable brain execution operations</h3>
        <p style={{ color: "#64748b", fontSize: 13 }}>Only authorized operators may quarantine runs inactive for more than 15 minutes. Quarantine never retries a possibly completed agent action.</p>
        <label style={{display:"block",marginBottom:12}}>Campaign metrics context (optional; only reviewed observations count)
          <select style={fieldStyle} value={brainCampaignId} onChange={e=>setBrainCampaignId(e.target.value)}>
            <option value="">No campaign selected</option>
            {campaigns.map(c=><option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
          </select>
        </label>
        <div style={{ display:"flex",gap:10,flexWrap:"wrap",marginBottom:14 }}>
          <button style={buttonStyle} disabled={busy || !goal.trim()} onClick={()=>perform(async()=>{
            const created=await call("brain/runs",{commandKey:crypto.randomUUID(),requestedOutcome:goal.trim(),
              ...(brainCampaignId?{campaignId:brainCampaignId}:objectiveId?{objectiveId}:{}),market:"MENA"}) as {id:string};
            setBrainRunId(created.id);
            setBrainRunDetail(created);
            setBrainRuns(await call("brain/runs") as typeof brainRuns);setBrainRunsLoaded(true);
          })}>Create durable 13-agent Brain run</button>
          <span style={{fontSize:12,color:"#64748b",alignSelf:"center"}}>The optional worker automatically dispatches pending runs when enabled.</span>
        </div>
        <button style={buttonStyle} disabled={busy} onClick={() => perform(async () => {setBrainRuns(await call("brain/runs") as typeof brainRuns);setBrainRunsLoaded(true);})}>Load persisted brain runs</button>
        {brainRuns.length > 0 && <label style={{ display: "block", marginTop: 12 }}>Select brain run
          <select style={fieldStyle} value={brainRunId} onChange={e => {setBrainRunId(e.target.value);setBrainRunDetail(null);setBrainRecovery(null);setCancelBrainReason("");setQuarantineReason("");}}>
            <option value="">Select run</option>
            {brainRuns.map(r => <option value={r.id} key={r.id}>{r.id} · {r.status}</option>)}
          </select>
        </label>}
        {brainRunId && <div style={{ marginTop: 12 }}>
          <button style={buttonStyle} disabled={busy} onClick={() => perform(async () => setBrainRunDetail(await call("brain/runs/" + encodeURIComponent(brainRunId))))}>Inspect persisted checkpoints</button>
          <button style={{...buttonStyle,marginLeft:10}} disabled={busy} onClick={() => perform(async () => setBrainRecovery(await call("brain/runs/" + encodeURIComponent(brainRunId) + "/recovery")))}>Inspect crash-recovery evidence (read-only)</button>
          {brainRuns.find(r=>r.id===brainRunId)?.status==="PENDING"&&<button style={{...buttonStyle,marginLeft:10}} disabled={busy} onClick={()=>perform(async()=>{
            setBrainRunDetail(await call("brain/runs/"+encodeURIComponent(brainRunId)+"/execute",{}));
            setBrainRuns(await call("brain/runs") as typeof brainRuns);setBrainRunsLoaded(true);
          })}>Execute pending run (synchronous)</button>}

          {canManageBrain&&brainRuns.find(r=>r.id===brainRunId)?.status==="PENDING"&&<div style={{marginTop:12}}>
            <label style={{display:"block"}}>Cancel queued run rationale
              <textarea style={fieldStyle} value={cancelBrainReason} maxLength={2000} onChange={e=>setCancelBrainReason(e.target.value)}/>
            </label>
            <button style={{...buttonStyle,background:"#9f3030"}} disabled={busy||cancelBrainReason.trim().length<12} onClick={()=>perform(async()=>{
              if(!window.confirm("Cancel this unclaimed run? Already running work cannot be cancelled here."))return;
              await call("brain/runs/"+encodeURIComponent(brainRunId)+"/cancel",{reason:cancelBrainReason.trim()});
              setBrainRunDetail(await call("brain/runs/"+encodeURIComponent(brainRunId)));
              setBrainRuns(await call("brain/runs") as typeof brainRuns);setBrainRunsLoaded(true);
              setBrainRecovery(null);setCancelBrainReason("");
            })}>Cancel queued Brain run</button>
          </div>}
          {brainRecovery !== null && <details open><summary>Recovery evidence — investigation only, no automatic replay</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(brainRecovery,null,2)}</pre></details>}
          {brainRunDetail !== null && <details open><summary>Run evidence</summary><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{JSON.stringify(brainRunDetail,null,2)}</pre></details>}
          {canManageBrain&&brainRuns.find(r => r.id === brainRunId)?.status === "RUNNING" && <>
            <label style={{ display: "block", marginTop: 12 }}>Quarantine rationale
              <textarea style={fieldStyle} value={quarantineReason} onChange={e => setQuarantineReason(e.target.value)} placeholder="Describe the stale execution, evidence checked, and operator decision"/>
            </label>
            <button style={{...buttonStyle,background:"#9f3030",marginTop:12}} disabled={busy || quarantineReason.trim().length < 12} onClick={() => perform(async () => {
              if (!window.confirm("Quarantine this stale run? No agents will be retried automatically.")) return;
              await call("brain/runs/" + encodeURIComponent(brainRunId) + "/quarantine",{reason:quarantineReason.trim()});
              setBrainRunDetail(await call("brain/runs/" + encodeURIComponent(brainRunId)));
              setBrainRuns(await call("brain/runs") as typeof brainRuns);setBrainRunsLoaded(true);
              setQuarantineReason("");
            })}>Quarantine stale execution</button>
          </>}
        </div>}
      </div>
      <div style={{marginTop:20,padding:18,border:"1px solid #cbd5e1",borderRadius:12}}>
        <h3 style={{marginTop:0}}>Blueprint v2.1 — development target register</h3>
        <p style={{color:"#64748b",fontSize:13}}>Target-state concepts are NOT activated agents or functional external integrations. This register tracks planned scope separately from what has passed production acceptance.</p>
        <button style={buttonStyle} disabled={busy} onClick={()=>perform(async()=>{
          setBlueprintInventory(await call("architecture/blueprint") as NonNullable<typeof blueprintInventory>);
        })}>Inspect full engine, brain and workflow inventory</button>
        {blueprintInventory && <>
          <p style={{fontWeight:700}}>v{blueprintInventory.version}: {blueprintInventory.counts.engines} engines · {blueprintInventory.counts.workflows} workflows · {blueprintInventory.counts.studios} studios · {blueprintInventory.counts.brains} brain roles · {blueprintInventory.counts.personas} personas</p>
          <div style={{display:"flex",gap:12,flexWrap:"wrap",alignItems:"center",marginBottom:12}}>
            <p style={{margin:0,fontSize:12,color:"#475569"}}>
              {Object.entries(gapCounts(blueprintInventory).byState).map(([state,count])=>
                state.replaceAll("_"," ")+": "+count).join(" · ")}
              {" "}· Registry classification only; not live feature verification.
            </p>
            <button type="button" onClick={()=>{
              try{
                const csv=gapInventoryCsv(blueprintInventory);
                const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
                const anchor=document.createElement("a");
                anchor.href=url;anchor.download="medsol-blueprint-v2-1-77-capability-gap-register.csv";
                document.body.appendChild(anchor);anchor.click();anchor.remove();
                setTimeout(()=>URL.revokeObjectURL(url),1000);
                setError("");
              }catch(e){setError(e instanceof Error?e.message:"Gap register export denied");}
            }} style={{padding:"8px 12px",borderRadius:8,border:"1px solid #94a3b8",
              background:"#fff",cursor:"pointer"}}>
              Export 36-engine + 41-workflow gaps (unsigned CSV)
            </button>
          </div>
          <section aria-label="Tranche closure gate" style={{padding:12,border:"1px solid #cbd5e1",borderRadius:8,marginBottom:12}}>
            <strong>Tranche 1 · NOT CLOSED</strong>
            <p style={{fontSize:12}}>{gapClosureStatus(blueprintInventory).unresolvedEngines.length}/36 engine targets and {gapClosureStatus(blueprintInventory).unresolvedWorkflows.length}/41 workflow targets lack verified implementation classification. Independent acceptance is required even if all planning classifications are later updated.</p>
            <details><summary>Unresolved target identifiers</summary>
             <p style={{fontSize:12,overflowWrap:"anywhere"}}>Engines: {gapClosureStatus(blueprintInventory).unresolvedEngines.join(", ")||"None in registry"}</p>
             <p style={{fontSize:12,overflowWrap:"anywhere"}}>Workflows: {gapClosureStatus(blueprintInventory).unresolvedWorkflows.join(", ")||"None in registry"}</p>
            </details>
          </section>
          {([
            ["Engines",blueprintInventory.engines],["Workflows",blueprintInventory.workflows],
            ["Studios",blueprintInventory.studios]
           ] as const).map(([label,items])=><details key={label}>
             <summary>{label} — owner, release and implementation evidence</summary>
             <div style={{overflowX:"auto",marginTop:10}}><table style={{width:"100%",fontSize:12,borderCollapse:"collapse"}}>
               <thead><tr><th align="left">ID</th><th align="left">Capability</th><th align="left">Owner</th><th align="left">Release</th><th align="left">Observed status</th></tr></thead>
               <tbody>{items.map(item=><tr key={item.id}><td>{item.id}</td><td>{item.name}</td><td>{item.owner}</td><td>{item.release}</td><td>{item.state}</td></tr>)}</tbody>
             </table></div>
           </details>)}
          <details><summary>Ten cognitive brain responsibilities and twelve UX personas</summary>
            <pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{JSON.stringify({brains:blueprintInventory.brains,personas:blueprintInventory.personas},null,2)}</pre>
          </details>
        </>}
        <div id="blueprint-studio" style={{scrollMarginTop:120}}>{identity&&<BlueprintVirtualStudio key={identity.organizationId+":"+identity.userId}
         onPrepareOfflineWorkflow={manifest=>{setOfflineHandoff(previous=>({
          organizationId:identity.organizationId,userId:identity.userId,manifest,revision:(previous?.revision??0)+1
         }));navigateWorkspace("workflow-studio");}}/>}</div>
        <div id="workflow-studio" style={{scrollMarginTop:120}}><OfflineDagStudio
         key={identity?identity.organizationId+":"+identity.userId:"signed-out"} identity={identity}
         importedWorkflow={offlineHandoff?.organizationId===identity?.organizationId&&offlineHandoff?.userId===identity?.userId?
          offlineHandoff:null}/></div>
        <div style={{scrollMarginTop:120}}><MarketIntelligenceStudio
         key={identity?identity.organizationId+":"+identity.userId:"signed-out"}
         identity={identity}/></div>
        <div id="knowledge" style={{scrollMarginTop:120}}><KnowledgeFabricStudio identity={identity}/></div>
        <div id="memory" style={{scrollMarginTop:120}}><MemoryGraphStudio key={identity?identity.organizationId+":"+identity.userId:"signed-out"} identity={identity}/></div>
        <div id="acceptance" style={{scrollMarginTop:120}}><R3AcceptanceStudio identity={identity}/></div>
      </div>
      {brainPlan !== null && <details open><summary>Brain stages and nervous-system handoffs</summary><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{JSON.stringify(brainPlan,null,2)}</pre></details>}
      {brainAssessment !== null && <details open><summary>13-agent review trace</summary><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{JSON.stringify(brainAssessment,null,2)}</pre></details>}
      {learningSignals !== null && <details><summary>Learning evidence and quarantine</summary><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{JSON.stringify(learningSignals,null,2)}</pre></details>}
      {skillProposals !== null && <details><summary>Governed agent skill proposals</summary><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{JSON.stringify(skillProposals,null,2)}</pre></details>}
    </section>
    {error && <p className="alpha-error" role="alert" style={{ color: "#a11919", padding: 16, background: "#fff1f1", borderRadius: 8 }}>{error}</p>}
    <p style={{ marginTop: 24, color: "#64748b", fontSize: 13 }}>Approval decisions require a verified OIDC identity and an authorized database role.</p>
    </div>
  </main>;
}
