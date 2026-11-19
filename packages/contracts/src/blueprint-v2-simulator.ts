import {
 lintBlueprintDraft,type BlueprintDraft,type BlueprintNode,
 type BlueprintLintResult,type BlueprintIssue
} from './blueprint-v2-compiler.js';

/**
 * R3 Blueprint/Workflow/Agent Studio topological SIMULATOR.
 * Pure graph interpretation, never the canonical workflow executor.
 * No agent models, MCP tools, A2A, domain mutations or approval decisions.
 * Persistence belongs to the existing MarketingWorkflowService if invoked.
 */
export type VirtualNodeKind='VIRTUAL_TOPOLOGY'|'WOULD_CALL_AGENT'|
 'WOULD_WAIT_HUMAN'|'WOULD_WAIT_EVENT'|'BOUNDED_LOOP_DESIGN_ONLY'|
 'VIRTUAL_COMPENSATION';
export type VirtualBlueprintStep={
 order:number;nodeId:string;nodeType:BlueprintNode['type'];
 kind:VirtualNodeKind;
 agentId:string|null;
 predecessors:string[];downstream:string[];
 requiresHumanDecision:boolean;
 isExternalAction:false;isActualAgentExecution:false;
};
export type BlueprintSimulationResult={
 status:'SIMULATED'|'BLOCKED';blueprintId:string|null;version:number|null;
 validDraft:boolean;executable:false;deployAuthorized:false;
 issues:BlueprintIssue[];stepCount:number;steps:VirtualBlueprintStep[];
 virtualAgentTasks:number;humanDecisionNodes:number;
 virtualWaitNodes:number;
 realAgentExecutions:0;actualModelCalls:0;actualMcpCalls:0;
 actualA2aCalls:0;actualDomainWrites:0;providerRequestsMade:0;
 simulatedExternalEffects:0;externalEffectsAuthorized:false;
};
const zero={
 realAgentExecutions:0,actualModelCalls:0,actualMcpCalls:0,
 actualA2aCalls:0,actualDomainWrites:0,providerRequestsMade:0,
 simulatedExternalEffects:0,externalEffectsAuthorized:false,
 executable:false,deployAuthorized:false
} as const;
const human=new Set(['HUMAN_TASK','APPROVAL']);
const wait=new Set(['EVENT_WAIT','SCHEDULE']);
function kind(n:BlueprintNode):VirtualNodeKind{
 if(n.type==='AGENT_TASK')return 'WOULD_CALL_AGENT';
 if(human.has(n.type))return 'WOULD_WAIT_HUMAN';
 if(wait.has(n.type))return 'WOULD_WAIT_EVENT';
 if(n.type==='LOOP_BOUNDED')return 'BOUNDED_LOOP_DESIGN_ONLY';
 if(n.type==='COMPENSATE'||n.type==='ERROR_HANDLER')
  return 'VIRTUAL_COMPENSATION';
 return 'VIRTUAL_TOPOLOGY';
}
export function simulateBlueprintDraft(raw:unknown):BlueprintSimulationResult{
 const lint:BlueprintLintResult=lintBlueprintDraft(raw);
 const value=raw&&typeof raw==='object'&&!Array.isArray(raw)?
  raw as Record<string,unknown>:{};
 const blueprintId=typeof value.id==='string'?value.id:null;
 const version=typeof value.version==='number'&&Number.isSafeInteger(value.version)?
  value.version:null;
 const blocked=(issues:BlueprintIssue[]):BlueprintSimulationResult=>({
  status:'BLOCKED',blueprintId,version,validDraft:false,issues,
  stepCount:0,steps:[],virtualAgentTasks:0,humanDecisionNodes:0,
  virtualWaitNodes:0,...zero
 });
 if(!lint.validDraft)return blocked(lint.issues);
 const draft=raw as BlueprintDraft;
 const triggers=draft.nodes.filter(n=>n.type==='TRIGGER');
 if(triggers.length!==1)return blocked([{
  code:'SINGLE_TRIGGER_REQUIRED',
  detail:'Simulation requires exactly one start trigger'
 }]);
 const nodes=new Map(draft.nodes.map(n=>[n.id,n]));
 const incoming=new Map(draft.nodes.map(n=>[n.id,new Set<string>()]));
 const outgoing=new Map(draft.nodes.map(n=>[n.id,new Set<string>()]));
 for(const edge of draft.edges){
  incoming.get(edge.to)!.add(edge.from);
  outgoing.get(edge.from)!.add(edge.to);
 }
 const reachable=new Set<string>();
 const visit=(id:string)=>{
  if(reachable.has(id))return;
  reachable.add(id);
  for(const next of outgoing.get(id)??[])visit(next);
 };
 visit(triggers[0]!.id);
 if(reachable.size!==nodes.size)return blocked([{
  code:'UNREACHABLE_NODES',
  detail:'Every design node must be reachable from the single trigger'
 }]);
 const ends=draft.nodes.filter(n=>n.type==='END');
 if(ends.length<1||ends.every(n=>!reachable.has(n.id)))
  return blocked([{code:'END_UNREACHABLE',detail:'Terminal END must be reachable'}]);
 const indegree=new Map([...incoming].map(([key,parents])=>[key,parents.size]));
 const ready=[...nodes.keys()].filter(id=>(indegree.get(id)??0)===0).sort();
 const steps:VirtualBlueprintStep[]=[];
 while(ready.length>0){
  const id=ready.shift()!,node=nodes.get(id)!;
  const predecessors=[...incoming.get(id)!].sort();
  const downstream=[...outgoing.get(id)!].sort();
  steps.push({
   order:steps.length+1,nodeId:id,nodeType:node.type,
   kind:kind(node),agentId:node.type==='AGENT_TASK'?node.agentId??null:null,
   predecessors,downstream,requiresHumanDecision:human.has(node.type),
   isExternalAction:false,isActualAgentExecution:false
  });
  for(const child of downstream){
   const remaining=(indegree.get(child)??0)-1;
   indegree.set(child,remaining);
   if(remaining===0){ready.push(child);ready.sort();}
  }
  if(steps.length>100)return blocked([{
   code:'SIMULATION_STEP_LIMIT',detail:'Virtual step limit exceeded'
  }]);
 }
 if(steps.length!==nodes.size)
  return blocked([{code:'SIMULATION_GRAPH_INCOMPLETE',
   detail:'Graph not fully topologically sortable'}]);
 return{
  status:'SIMULATED',blueprintId:draft.id,version:draft.version,
  validDraft:true,issues:[],stepCount:steps.length,steps,
  virtualAgentTasks:steps.filter(s=>s.kind==='WOULD_CALL_AGENT').length,
  humanDecisionNodes:steps.filter(s=>s.requiresHumanDecision).length,
  virtualWaitNodes:steps.filter(s=>s.kind==='WOULD_WAIT_EVENT').length,
  ...zero
 };
}
