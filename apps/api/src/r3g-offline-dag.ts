import {createHash,createPublicKey,verify} from 'node:crypto';
import {BadRequestException,ForbiddenException} from '@nestjs/common';
import {simulateBlueprintDraft,type BlueprintDraft,type BlueprintNode} from '@medsol/contracts';
import {AGENT_ROSTER} from '@medsol/agent-runtime';

/** R3-G is a restricted executable profile of the existing compiler, not a new DSL.
 * Any graph requiring an effectful connector, clock, loop or domain write is rejected.
 */
export const OFFLINE_DAG_TYPES=['TRIGGER','PARALLEL','JOIN','AGENT_TASK',
 'HUMAN_TASK','APPROVAL','END'] as const;
const supported=new Set<string>(OFFLINE_DAG_TYPES);
export const SAFE_DAG_CAPABILITY:Readonly<Record<string,string>>=Object.freeze({
 'MKT-CMO-001':'ASSESS_OBJECTIVE',
 'MKT-OPS-001':'ASSIGN_TASK',
 'MKT-STR-001':'ASSESS_MARKET',
 'MKT-ANA-001':'ANALYZE_CAMPAIGN',
 'MKT-PM-001':'BUILD_POSITIONING',
 'MKT-GROWTH-001':'DESIGN_EXPERIMENT',
 'MKT-CRM-001':'SCORE_LEAD',
 'MKT-CONT-001':'CREATE_BRIEF',
 'MKT-SOC-001':'CLASSIFY_SOCIAL',
 'MKT-CREATIVE-001':'GENERATE_CONCEPT',
 'MKT-BRAND-001':'CHECK_BRAND',
 'MKT-EVENT-001':'SCORE_EVENT',
 'MKT-SCI-001':'CHECK_EVIDENCE'
});
export type OfflineDagManifest={draft:BlueprintDraft;canaryPercent:number;
 maxSteps:number;executionMode:'DETERMINISTIC_NO_MODEL'};
export type PlannedDagStep={id:string;type:BlueprintNode['type'];
 agentId:string|null;predecessors:string[];successors:string[];order:number};
export function parseOfflineDagManifest(raw:unknown):OfflineDagManifest{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))
  throw new BadRequestException('Offline DAG release manifest required');
 const v=raw as Record<string,unknown>;
 const fields=['draft','canaryPercent','maxSteps','executionMode'];
 if(Object.keys(v).length!==fields.length||
    fields.some(k=>!Object.hasOwn(v,k))||Object.keys(v).some(k=>!fields.includes(k)))
  throw new BadRequestException('Unknown or missing offline DAG release fields');
 if(v.executionMode!=='DETERMINISTIC_NO_MODEL')
  throw new ForbiddenException('Remote or autonomous workflow execution prohibited');
 if(!Number.isSafeInteger(v.canaryPercent)||(v.canaryPercent as number)<1||
    (v.canaryPercent as number)>100||
    !Number.isSafeInteger(v.maxSteps)||(v.maxSteps as number)<2||
    (v.maxSteps as number)>32)
  throw new BadRequestException('Canary percentage and step ceiling must be bounded');
 const d=v.draft;
 if(!d||typeof d!=='object'||Array.isArray(d))
  throw new BadRequestException('Structured graph required');
 const graph=d as Record<string,unknown>;
 if(Object.keys(graph).some(k=>!['id','version','nodes','edges'].includes(k)))
  throw new BadRequestException('Unknown blueprint graph field');
 const preview=simulateBlueprintDraft(d);
 if(preview.status!=='SIMULATED'||!preview.validDraft)
  throw new BadRequestException('Canonical draft lint must pass: '+
   preview.issues.map(x=>x.code).slice(0,6).join(','));
 if(preview.stepCount>(v.maxSteps as number))
  throw new BadRequestException('Graph exceeds signed step ceiling');
 const draft=d as BlueprintDraft;
 if(!draft.nodes.every(n=>supported.has(n.type))||
    draft.nodes.filter(n=>n.type==='AGENT_TASK').length>8||
    draft.nodes.filter(n=>n.type==='APPROVAL'||n.type==='HUMAN_TASK').length>8)
  throw new ForbiddenException('Graph contains unsupported effectful, clock or unbounded node');
 for(const n of draft.nodes){
  if(n.sideEffect!==undefined&&n.sideEffect!=='NONE')
   throw new ForbiddenException('DAG effects explicitly forbidden');
  if(n.type==='AGENT_TASK'&&(!n.agentId||
     !SAFE_DAG_CAPABILITY[n.agentId]||
     !AGENT_ROSTER.some(a=>a.id===n.agentId&&
      a.capabilities.includes(SAFE_DAG_CAPABILITY[n.agentId]!))||
     (n.maxSeconds!==undefined&&n.maxSeconds>60)))
   throw new ForbiddenException('Only bounded canonical deterministic review agents permitted');
 }
 // Agent assessments are never silently finalized: every path from an
 // AGENT_TASK to END must encounter a HUMAN_TASK/APPROVAL, including fan-out.
 const downstream=new Map(draft.nodes.map(n=>[n.id,[] as string[]]));
 for(const edge of draft.edges)downstream.get(edge.from)!.push(edge.to);
 const kinds=new Map(draft.nodes.map(n=>[n.id,n.type]));
 const bypass=(id:string,seen=new Set<string>()):boolean=>{
  if(seen.has(id))return false;
  if(kinds.get(id)==='HUMAN_TASK'||kinds.get(id)==='APPROVAL')return false;
  if(kinds.get(id)==='END')return true;
  const visited=new Set(seen);visited.add(id);
  return(downstream.get(id)??[]).some(next=>bypass(next,visited));
 };
 for(const node of draft.nodes)if(node.type==='AGENT_TASK'&&bypass(node.id))
  throw new ForbiddenException('Every agent outcome path must pass independent human review');
 // The compiler permits multiple END nodes, but each branch must terminate.
 // JSONB persists object keys in its own order. Reconstruct each object in
 // a fixed field order so the trusted signature is stable before/after storage.
 const nodes=draft.nodes.map(n=>({
  id:n.id,type:n.type,
  ...(n.engineId!==undefined?{engineId:n.engineId}:{}),
  ...(n.agentId!==undefined?{agentId:n.agentId}:{}),
  ...(n.workflowId!==undefined?{workflowId:n.workflowId}:{}),
  ...(n.sideEffect!==undefined?{sideEffect:n.sideEffect}:{}),
  ...(n.maxIterations!==undefined?{maxIterations:n.maxIterations}:{}),
  ...(n.maxSeconds!==undefined?{maxSeconds:n.maxSeconds}:{})
 })).sort((a,b)=>a.id.localeCompare(b.id));
 const edges=draft.edges.map(e=>({from:e.from,to:e.to})).sort((a,b)=>
  (a.from+':'+a.to).localeCompare(b.from+':'+b.to));
 return{draft:{id:draft.id,version:draft.version,nodes,edges},
  canaryPercent:v.canaryPercent as number,maxSteps:v.maxSteps as number,
  executionMode:'DETERMINISTIC_NO_MODEL'};
}
export function offlineDagDigest(raw:unknown):string{
 const m=parseOfflineDagManifest(raw);
 return 'sha256:'+createHash('sha256').update(JSON.stringify([
  'medsol-r3g-offline-dag-v1',m.draft,m.canaryPercent,m.maxSteps,
  m.executionMode
 ])).digest('hex');
}
export function verifyOfflineDagSignature(raw:unknown,signature:string,
 signerKeyId:string,trust:{publicKeyPem?:string|undefined;keyId?:string|undefined}):boolean{
 if(!trust.publicKeyPem||!trust.keyId||signerKeyId!==trust.keyId||
  !/^[A-Za-z0-9_-]{80,200}$/.test(signature))return false;
 try{
  const bytes=Buffer.from(signature,'base64url');
  if(bytes.length!==64)return false;
  const key=createPublicKey(trust.publicKeyPem);
  if(key.asymmetricKeyType!=='ed25519')return false;
  return verify(null,Buffer.from('medsol-r3g-dag-signature-v1\n'+offlineDagDigest(raw)),key,bytes);
 }catch{return false;}
}
export const offlineDagTrust=()=>({
 publicKeyPem:process.env.MARKETING_DAG_TRUSTED_PUBLIC_KEY_PEM,
 keyId:process.env.MARKETING_DAG_TRUSTED_KEY_ID
});
export function planOfflineDag(raw:unknown):PlannedDagStep[]{
 const m=parseOfflineDagManifest(raw);
 const sim=simulateBlueprintDraft(m.draft);
 if(sim.status!=='SIMULATED')throw new BadRequestException('Invalid graph');
 return sim.steps.map(s=>({id:s.nodeId,type:s.nodeType,
  agentId:s.agentId,predecessors:s.predecessors,successors:s.downstream,
  order:s.order}));
}
export function canaryAllows(tenant:string,blueprint:string,requestKey:string,percent:number){
 if(!Number.isSafeInteger(percent)||percent<1||percent>100)
  throw new BadRequestException('Invalid fixed canary percentage');
 const digest=createHash('sha256').update(JSON.stringify([
  'medsol-r3g-canary-v1',tenant,blueprint,requestKey
 ])).digest();
 return digest.readUInt32BE(0)%100<percent;
}
