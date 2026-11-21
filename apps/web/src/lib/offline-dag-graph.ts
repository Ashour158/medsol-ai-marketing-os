/** Presentation-only editor over the canonical offline DAG manifest.
 * Every submitted graph is rechecked by the API's parseOfflineDagManifest,
 * existing compiler, signature verifier and workflow release authority.
 */
export const OFFLINE_EDITOR_NODE_TYPES=[
 "TRIGGER","AGENT_TASK","HUMAN_TASK","APPROVAL","PARALLEL","JOIN","END"
] as const;
export type EditorNodeType=typeof OFFLINE_EDITOR_NODE_TYPES[number];
export type EditorNode={id:string;type:EditorNodeType;agentId?:string;maxSeconds?:number};
export type EditorEdge={from:string;to:string};
export type OfflineEditorManifest={draft:{id:string;version:number;nodes:EditorNode[];edges:EditorEdge[]};
 canaryPercent:number;maxSteps:number;executionMode:"DETERMINISTIC_NO_MODEL"};
const record=(raw:unknown,label:string):Record<string,unknown>=>{
 if(!raw||typeof raw!=="object"||Array.isArray(raw))throw Error(label+" must be an object");
 return raw as Record<string,unknown>;
};
const only=(v:Record<string,unknown>,keys:string[],label:string)=>{
 if(Object.keys(v).some(k=>!keys.includes(k))||keys.some(k=>!Object.hasOwn(v,k)))
  throw Error(label+" contains unknown or missing fields; use advanced JSON without rewriting it");
};
const nodeId=(x:unknown)=>typeof x==="string"&&/^[A-Za-z0-9_-]{1,80}$/.test(x);
function reaches(edges:EditorEdge[],from:string,target:string):boolean{
 const seen=new Set<string>();const q=[from];
 while(q.length){const cur=q.shift()!;if(cur===target)return true;
  if(seen.has(cur))continue;seen.add(cur);
  for(const e of edges)if(e.from===cur)q.push(e.to);
 }
 return false;
}
export function readOfflineEditorManifest(json:string):OfflineEditorManifest{
 const m=record(JSON.parse(json) as unknown,"Manifest");
 only(m,["draft","canaryPercent","maxSteps","executionMode"],"Manifest");
 const d=record(m.draft,"Draft");
 only(d,["id","version","nodes","edges"],"Draft");
 if(typeof d.id!=="string"||!/^[a-z0-9][a-z0-9_-]{2,79}$/i.test(d.id)||
  !Number.isSafeInteger(d.version)||(d.version as number)<1)
  throw Error("Blueprint ID or version invalid");
 if(m.executionMode!=="DETERMINISTIC_NO_MODEL"||
  !Number.isSafeInteger(m.canaryPercent)||(m.canaryPercent as number)<1||
  (m.canaryPercent as number)>100||
  !Number.isSafeInteger(m.maxSteps)||(m.maxSteps as number)<2||
  (m.maxSteps as number)>32)throw Error("Only bounded deterministic offline manifests are editable");
 if(!Array.isArray(d.nodes)||!Array.isArray(d.edges)||d.nodes.length<2||
  d.nodes.length>32||d.edges.length>96)
  throw Error("Visual designer supports 2-32 nodes and up to 96 edges");
 const nodes:EditorNode[]=d.nodes.map(raw=>{
  const n=record(raw,"Node");
  const allowed=["id","type",...(n.agentId!==undefined?["agentId"]:[]),
   ...(n.maxSeconds!==undefined?["maxSeconds"]:[])];
  only(n,allowed,"Node");
  if(!nodeId(n.id)||!OFFLINE_EDITOR_NODE_TYPES.includes(n.type as EditorNodeType))
   throw Error("Unknown node ID or unsupported node type");
  if(n.type==="AGENT_TASK"){
   if(typeof n.agentId!=="string"||!nodeId(n.agentId)||
    (n.maxSeconds!==undefined&&(!Number.isSafeInteger(n.maxSeconds)||
     (n.maxSeconds as number)<1||(n.maxSeconds as number)>60)))
    throw Error("Agent node requires canonical agent ID and a deadline of at most 60 seconds");
  }else if(n.agentId!==undefined||n.maxSeconds!==undefined)
   throw Error("Only agent tasks may reference agent or deadline");
  return {id:n.id as string,type:n.type as EditorNodeType,
   ...(n.agentId!==undefined?{agentId:n.agentId as string}:{}),
   ...(n.maxSeconds!==undefined?{maxSeconds:n.maxSeconds as number}:{})};
 });
 if(new Set(nodes.map(n=>n.id)).size!==nodes.length||
  nodes.filter(n=>n.type==="TRIGGER").length!==1||
  nodes.filter(n=>n.type==="END").length<1)
  throw Error("One trigger, at least one end and distinct node IDs required");
 const ids=new Set(nodes.map(n=>n.id));
 const edges:EditorEdge[]=d.edges.map(raw=>{
  const e=record(raw,"Edge");only(e,["from","to"],"Edge");
  if(typeof e.from!=="string"||typeof e.to!=="string"||
   !ids.has(e.from)||!ids.has(e.to)||e.from===e.to)
   throw Error("Edge endpoints missing or self-loop");
  if(nodes.find(n=>n.id===e.from)?.type==="END"||
   nodes.find(n=>n.id===e.to)?.type==="TRIGGER")
   throw Error("Cannot draw from END or into TRIGGER");
  return{from:e.from,to:e.to};
 });
 if(new Set(edges.map(e=>e.from+"=>"+e.to)).size!==edges.length)
  throw Error("Duplicate graph edge");
 for(const e of edges)if(reaches(edges.filter(x=>x!==e),e.to,e.from))
  throw Error("Cyclic edges are not supported by canonical offline DAG");
 return {draft:{id:d.id as string,version:d.version as number,nodes,edges},
  canaryPercent:m.canaryPercent as number,maxSteps:m.maxSteps as number,
  executionMode:"DETERMINISTIC_NO_MODEL"};
}
export function addOfflineEditorNode(m:OfflineEditorManifest,n:EditorNode):OfflineEditorManifest{
 if(!nodeId(n.id)||m.draft.nodes.some(x=>x.id===n.id)||
  m.draft.nodes.length>=32||!OFFLINE_EDITOR_NODE_TYPES.includes(n.type))
  throw Error("Node ID duplicated, invalid or exceeds bounded editor limit");
 if((n.type==="TRIGGER"&&m.draft.nodes.some(x=>x.type==="TRIGGER"))||
   (n.type==="END"&&m.draft.nodes.filter(x=>x.type==="END").length>=8))
  throw Error("Only one trigger and at most eight terminal nodes permitted");
 if(n.type==="AGENT_TASK"&&(!nodeId(n.agentId)||!Number.isSafeInteger(n.maxSeconds)||
  (n.maxSeconds??0)<1||(n.maxSeconds??0)>60))
  throw Error("Bounded canonical agent and 1-60 second deadline required");
 if(n.type!=="AGENT_TASK"&&(n.agentId!==undefined||n.maxSeconds!==undefined))
  throw Error("Non-agent node cannot carry agent authority");
 const nodes=[...m.draft.nodes,n];
 return{...m,maxSteps:Math.max(m.maxSteps,nodes.length),draft:{...m.draft,nodes}};
}
export function removeOfflineEditorNode(m:OfflineEditorManifest,id:string):OfflineEditorManifest{
 const n=m.draft.nodes.find(x=>x.id===id);
 if(!n||n.type==="TRIGGER"||
  (n.type==="END"&&m.draft.nodes.filter(x=>x.type==="END").length===1))
  throw Error("Cannot remove the only trigger or terminal");
 return{...m,draft:{...m.draft,nodes:m.draft.nodes.filter(x=>x.id!==id),
  edges:m.draft.edges.filter(e=>e.from!==id&&e.to!==id)}};
}
export function addOfflineEditorEdge(m:OfflineEditorManifest,from:string,to:string):OfflineEditorManifest{
 const a=m.draft.nodes.find(n=>n.id===from),b=m.draft.nodes.find(n=>n.id===to);
 if(!a||!b||a.type==="END"||b.type==="TRIGGER"||from===to||
  m.draft.edges.length>=96||m.draft.edges.some(e=>e.from===from&&e.to===to)||
  reaches(m.draft.edges,to,from))
  throw Error("Invalid, duplicate, cyclic or unbounded workflow connection");
 return{...m,draft:{...m.draft,edges:[...m.draft.edges,{from,to}]}};
}
export function removeOfflineEditorEdge(m:OfflineEditorManifest,from:string,to:string):OfflineEditorManifest{
 return{...m,draft:{...m.draft,edges:m.draft.edges.filter(e=>e.from!==from||e.to!==to)}};
}
export function layoutOfflineEditor(m:OfflineEditorManifest){
 const indegree=new Map(m.draft.nodes.map(n=>[n.id,0]));
 const levels=new Map(m.draft.nodes.map(n=>[n.id,0]));
 for(const e of m.draft.edges)indegree.set(e.to,(indegree.get(e.to)??0)+1);
 const q=m.draft.nodes.filter(n=>(indegree.get(n.id)??0)===0).map(n=>n.id);
 while(q.length){const id=q.shift()!;
  for(const e of m.draft.edges.filter(x=>x.from===id)){
   levels.set(e.to,Math.max(levels.get(e.to)??0,(levels.get(id)??0)+1));
   indegree.set(e.to,(indegree.get(e.to)??0)-1);
   if(indegree.get(e.to)===0)q.push(e.to);
  }
 }
 const counters=new Map<number,number>();
 return m.draft.nodes.map(n=>{
  const level=levels.get(n.id)??0,row=counters.get(level)??0;
  counters.set(level,row+1);
  return{...n,x:24+level*254,y:24+row*104};
 });
}
