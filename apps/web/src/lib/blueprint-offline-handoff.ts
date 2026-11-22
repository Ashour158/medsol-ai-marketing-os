import {readOfflineEditorManifest,type OfflineEditorManifest} from "./offline-dag-graph";

/** Presentation-only handoff from a validated virtual blueprint to the EXISTING
 * signed offline DAG owner. Never activates, signs, or authorizes execution.
 * Unsupported / effectful graph nodes must be explicitly redesigned, never dropped.
 */
export function prepareOfflineWorkflowDraft(raw:unknown):OfflineEditorManifest{
 if(!raw||typeof raw!=="object"||Array.isArray(raw))
  throw Error("Virtual blueprint must be a structured draft");
 const draft=raw as Record<string,unknown>;
 const nodes=draft.nodes;
 if(!Array.isArray(nodes)||nodes.length<2||nodes.length>32)
  throw Error("Offline handoff requires 2–32 canonical nodes");
 const manifest=readOfflineEditorManifest(JSON.stringify({
  draft,canaryPercent:100,maxSteps:Math.max(8,nodes.length),
  executionMode:"DETERMINISTIC_NO_MODEL"
 }));
 if(manifest.draft.nodes.filter(n=>n.type==="AGENT_TASK").length>8||
    manifest.draft.nodes.filter(n=>n.type==="HUMAN_TASK"||n.type==="APPROVAL").length>8)
  throw Error("Offline signed DAG allows at most eight agent and eight review nodes");
 const kinds=new Map(manifest.draft.nodes.map(n=>[n.id,n.type]));
 const next=new Map(manifest.draft.nodes.map(n=>[n.id,[] as string[]]));
 for(const e of manifest.draft.edges)next.get(e.from)!.push(e.to);
 const bypass=(id:string,seen:Set<string>):boolean=>{
  if(seen.has(id))return false;
  const kind=kinds.get(id);
  if(kind==="HUMAN_TASK"||kind==="APPROVAL")return false;
  if(kind==="END")return true;
  const following=new Set(seen);following.add(id);
  return(next.get(id)??[]).some(n=>bypass(n,following));
 };
 for(const node of manifest.draft.nodes)
  if(node.type==="AGENT_TASK"&&bypass(node.id,new Set()))
   throw Error("Offline agent outcomes require independent approval on every path to END");
 return manifest;
}
