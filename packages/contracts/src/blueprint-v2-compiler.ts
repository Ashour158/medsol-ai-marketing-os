import {TARGET_ENGINES,TARGET_WORKFLOWS} from './blueprint-v2.js';

/**
 * Security-first AUTHORING validator for future Blueprint Studio.
 * This is not the executable workflow compiler. It has no database,
 * connector, model, tenant identity, or side-effect authority.
 */
export const BLUEPRINT_NODE_TYPES=[
 'TRIGGER','CONDITION','TRANSFORM','AGENT_TASK','DOMAIN_COMMAND','MCP_TOOL',
 'A2A_TASK','EVENT_WAIT','HUMAN_TASK','APPROVAL','SCHEDULE','PARALLEL',
 'JOIN','LOOP_BOUNDED','COMPENSATE','ERROR_HANDLER','END'
] as const;
export type BlueprintNodeType=typeof BLUEPRINT_NODE_TYPES[number];
export type BlueprintNode={id:string;type:BlueprintNodeType;engineId?:string;
 agentId?:string;workflowId?:string;sideEffect?:'NONE'|'REVERSIBLE_EXTERNAL'|'IRREVERSIBLE_EXTERNAL';
 maxIterations?:number;maxSeconds?:number};
export type BlueprintDraft={id:string;version:number;nodes:BlueprintNode[];
 edges:{from:string;to:string}[]};
export type BlueprintIssue={code:string;nodeId?:string;detail:string};
export type BlueprintLintResult={validDraft:boolean;deployAuthorized:false;
 executable:false;issues:BlueprintIssue[];nodeCount:number;edgeCount:number};
const knownEngines=new Set(TARGET_ENGINES.map(x=>x.id));
const knownWorkflows=new Set(TARGET_WORKFLOWS.map(x=>x.id));
const knownAgents=new Set(['MKT-CMO-001','MKT-OPS-001','MKT-STR-001',
 'MKT-ANA-001','MKT-PM-001','MKT-GROWTH-001','MKT-CRM-001','MKT-CONT-001',
 'MKT-SOC-001','MKT-CREATIVE-001','MKT-BRAND-001','MKT-EVENT-001','MKT-SCI-001']);
const types=new Set<string>(BLUEPRINT_NODE_TYPES);
/**
 * Validate shape, ownership references, bounded work and acyclic wiring.
 * Unsafe nodes are explicitly unsupported until the canonical WorkflowExecution
 * runtime can enforce approvals, idempotency, compensation and effects.
 */
export function lintBlueprintDraft(raw:unknown):BlueprintLintResult{
 const issues:BlueprintIssue[]=[];
 const fail=(code:string,detail:string,nodeId?:string)=>issues.push({
  code,detail,...(nodeId?{nodeId}:{})
 });
 if(!raw||typeof raw!=='object'||Array.isArray(raw)){
  fail('INVALID_DRAFT','Structured blueprint document is required');
  return{validDraft:false,deployAuthorized:false,executable:false,issues,nodeCount:0,edgeCount:0};
 }
 const v=raw as Record<string,unknown>;
 if(typeof v.id!=='string'||!/^[a-z0-9][a-z0-9-_]{2,79}$/i.test(v.id))
  fail('INVALID_ID','Stable blueprint identifier required');
 if(!Number.isSafeInteger(v.version)||(v.version as number)<1)
  fail('INVALID_VERSION','Positive integer definition version required');
 const ns=Array.isArray(v.nodes)?v.nodes:[];
 const es=Array.isArray(v.edges)?v.edges:[];
 if(ns.length<2||ns.length>100)fail('NODE_LIMIT','Blueprint needs 2-100 bounded nodes');
 if(es.length>200)fail('EDGE_LIMIT','Too many edges');
 if(!Array.isArray(v.nodes)||!Array.isArray(v.edges))fail('INVALID_GRAPH','Nodes and edges must be arrays');
 const ids=new Set<string>();
 const typed=new Map<string,string>();
 for(const untrusted of ns.slice(0,101)){
  if(!untrusted||typeof untrusted!=='object'||Array.isArray(untrusted)){
   fail('INVALID_NODE','Each node must be an object');continue;
  }
  const n=untrusted as Record<string,unknown>;
  const id=typeof n.id==='string'?n.id:'';
  if(!/^[a-zA-Z0-9_-]{1,80}$/.test(id)||ids.has(id)){
   fail('INVALID_OR_DUPLICATE_NODE_ID','Node ID missing or duplicated',id);continue;
  }
  ids.add(id);
  if(typeof n.type!=='string'||!types.has(n.type)){
   fail('UNKNOWN_NODE_TYPE','Unknown blueprint node type',id);continue;
  }
  typed.set(id,n.type);
  if(typeof n.engineId==='string'&&!knownEngines.has(n.engineId))
   fail('UNKNOWN_ENGINE','Engine reference not in canonical blueprint registry',id);
  if(typeof n.workflowId==='string'&&!knownWorkflows.has(n.workflowId))
   fail('UNKNOWN_WORKFLOW','Workflow reference not in canonical registry',id);
  if(typeof n.agentId==='string'&&!knownAgents.has(n.agentId))
   fail('UNKNOWN_AGENT','Only canonical agent IDs are permitted',id);
  if(n.type==='AGENT_TASK'&&!n.agentId)
   fail('MISSING_AGENT','Agent node requires a canonical agent ID',id);
  if(n.type==='DOMAIN_COMMAND'&&!n.engineId)
   fail('MISSING_DOMAIN_OWNER','Domain command requires its engine owner',id);
  if(n.type==='MCP_TOOL'||n.type==='A2A_TASK')
   fail('CONNECTOR_NOT_AVAILABLE','MCP/A2A execution is not configured',id);
  if(n.type==='DOMAIN_COMMAND')
   fail('DOMAIN_EXECUTION_NOT_AVAILABLE','Domain commands require audited authorization and runtime adapter',id);
  if(n.type==='LOOP_BOUNDED'&&(!Number.isInteger(n.maxIterations)||
    (n.maxIterations as number)<1||(n.maxIterations as number)>20))
   fail('UNBOUNDED_ITERATION','Loop must have a maximum iteration count of 1-20',id);
  if(n.sideEffect&&n.sideEffect!=='NONE')
   fail('EXTERNAL_EFFECT_BLOCKED','No external effects can execute from a design draft',id);
  if(n.type==='AGENT_TASK'&&n.maxSeconds!==undefined&&
    (!Number.isInteger(n.maxSeconds)||(n.maxSeconds as number)<1||(n.maxSeconds as number)>900))
   fail('INVALID_DEADLINE','Agent task deadline must be 1-900 seconds',id);
 }
 if(![...typed.values()].includes('TRIGGER'))fail('NO_TRIGGER','Start trigger required');
 if(![...typed.values()].includes('END'))fail('NO_END','Terminal node required');
 const graph=new Map([...ids].map(id=>[id,[] as string[]]));
 const dedupe=new Set<string>();
 for(const rawEdge of es.slice(0,201)){
  if(!rawEdge||typeof rawEdge!=='object'||Array.isArray(rawEdge)){
   fail('INVALID_EDGE','Edge requires from and to node IDs');continue;
  }
  const e=rawEdge as Record<string,unknown>;
  if(typeof e.from!=='string'||typeof e.to!=='string'||!ids.has(e.from)||!ids.has(e.to)){
   fail('UNKNOWN_ENDPOINT','Edge references unknown node');continue;
  }
  if(e.from===e.to){fail('SELF_CYCLE','Self-loop prohibited in draft',e.from);continue;}
  const key=e.from+':'+e.to;
  if(dedupe.has(key)){fail('DUPLICATE_EDGE','Duplicate edge',e.from);continue;}
  dedupe.add(key);graph.get(e.from)!.push(e.to);
 }
 // Graphs are acyclic until the durable canonical workflow engine implements
 // explicit bounded-loop execution; LOOP_BOUNDED metadata alone is not enough.
 const colors=new Map<string,number>();
 const visit=(id:string):boolean=>{
  if(colors.get(id)===1)return true;
  if(colors.get(id)===2)return false;
  colors.set(id,1);
  for(const dest of graph.get(id)??[])if(visit(dest))return true;
  colors.set(id,2);return false;
 };
 for(const id of ids){if(visit(id)){fail('CYCLIC_GRAPH','Cyclic workflow requires durable loop runtime');break;}}
 for(const [id,type] of typed){
  if(type==='TRIGGER'&&es.some(e=>e?.to===id))fail('TRIGGER_HAS_INPUT','Start trigger cannot have incoming edges',id);
  if(type==='END'&&es.some(e=>e?.from===id))fail('END_HAS_OUTPUT','Terminal node cannot have outgoing edges',id);
 }
 return{validDraft:issues.length===0,deployAuthorized:false,executable:false,
  issues,nodeCount:ns.length,edgeCount:es.length};
}
