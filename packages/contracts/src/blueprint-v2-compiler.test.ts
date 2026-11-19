import {describe,expect,it} from 'vitest';
import {lintBlueprintDraft,BLUEPRINT_NODE_TYPES} from './blueprint-v2-compiler.js';
const sample=()=>({id:'example-workflow',version:1,nodes:[
 {id:'start',type:'TRIGGER'}, {id:'assess',type:'AGENT_TASK',agentId:'MKT-CMO-001',maxSeconds:60},
 {id:'review',type:'HUMAN_TASK'}, {id:'finish',type:'END'}
 ],edges:[{from:'start',to:'assess'},{from:'assess',to:'review'},{from:'review',to:'finish'}]});
describe('Blueprint v2 static graph safety baseline',()=>{
 it('enumerates the complete node taxonomy without running new tools or workflow',()=>{
  expect(BLUEPRINT_NODE_TYPES).toHaveLength(17);
  const v=lintBlueprintDraft(sample());
  expect(v).toMatchObject({validDraft:true,deployAuthorized:false,executable:false,
   nodeCount:4,edgeCount:3,issues:[]});
 });
 it('denies unknown agent identities and duplicate nodes',()=>{
  const a=sample();a.nodes[1]!.agentId='AG-PRICE';
  expect(lintBlueprintDraft(a).issues.map(x=>x.code)).toContain('UNKNOWN_AGENT');
  const b=sample();b.nodes[1]!.id='start';
  expect(lintBlueprintDraft(b).issues.map(x=>x.code)).toContain('INVALID_OR_DUPLICATE_NODE_ID');
 });
 it('rejects cycles and unknown edge endpoints instead of inventing loop execution',()=>{
  const a=sample();a.edges.push({from:'finish',to:'start'});
  expect(lintBlueprintDraft(a).issues.map(x=>x.code)).toContain('CYCLIC_GRAPH');
  const b=sample();b.edges.push({from:'finish',to:'unknown'});
  expect(lintBlueprintDraft(b).issues.map(x=>x.code)).toContain('UNKNOWN_ENDPOINT');
 });
 it('blocks external domain writes regardless of matching owner ID',()=>{
  const a=sample();a.nodes[1]={id:'assess',type:'DOMAIN_COMMAND',engineId:'E15',
   sideEffect:'IRREVERSIBLE_EXTERNAL'} as any;
  const codes=lintBlueprintDraft(a).issues.map(x=>x.code);
  expect(codes).toContain('DOMAIN_EXECUTION_NOT_AVAILABLE');
  expect(codes).toContain('EXTERNAL_EFFECT_BLOCKED');
  expect(lintBlueprintDraft(a).deployAuthorized).toBe(false);
 });
 it('blocks MCP and remote A2A until tool registry and scoped grants exist',()=>{
  for(const type of ['MCP_TOOL','A2A_TASK']){
   const a=sample();a.nodes[1]={id:'assess',type} as any;
   expect(lintBlueprintDraft(a).issues.map(x=>x.code)).toContain('CONNECTOR_NOT_AVAILABLE');
  }
 });
 it('blocks unbounded loops and excessive execution time',()=>{
  const a=sample();a.nodes[1]={id:'assess',type:'LOOP_BOUNDED',maxIterations:999} as any;
  expect(lintBlueprintDraft(a).issues.map(x=>x.code)).toContain('UNBOUNDED_ITERATION');
  const b=sample();b.nodes[1]!.maxSeconds=10000;
  expect(lintBlueprintDraft(b).issues.map(x=>x.code)).toContain('INVALID_DEADLINE');
 });
 it('enforces basic IDs, size limits and required terminal nodes',()=>{
  const bad={id:'!',version:0,nodes:[{id:'start',type:'TRIGGER'}],edges:[]};
  const codes=lintBlueprintDraft(bad).issues.map(x=>x.code);
  expect(codes).toContain('INVALID_ID');
  expect(codes).toContain('INVALID_VERSION');
  expect(codes).toContain('NODE_LIMIT');
  expect(codes).toContain('NO_END');
  expect(lintBlueprintDraft(null).validDraft).toBe(false);
 });
 it('denies dangling branches, hidden roots and unknown effectful configuration',()=>{
  const detached=sample();
  detached.nodes.push({id:'orphan',type:'TRANSFORM'} as any);
  const detachedCodes=lintBlueprintDraft(detached).issues.map(x=>x.code);
  expect(detachedCodes).toContain('UNREACHABLE_NODE');
  expect(detachedCodes).toContain('NO_TERMINAL_PATH');
  const dangling=sample();
  dangling.nodes.push({id:'forgotten',type:'TRANSFORM'} as any);
  dangling.edges.push({from:'assess',to:'forgotten'});
  expect(lintBlueprintDraft(dangling).issues.map(x=>x.code))
   .toContain('NO_TERMINAL_PATH');
  const roots=sample();
  roots.nodes.push({id:'second',type:'TRIGGER'} as any);
  expect(lintBlueprintDraft(roots).issues.map(x=>x.code))
   .toContain('SINGLE_TRIGGER_REQUIRED');
  const smuggled=sample() as any;
  smuggled.nodes[1].httpUrl='https://evil.example/publish';
  expect(lintBlueprintDraft(smuggled).issues.map(x=>x.code))
   .toContain('UNRECOGNIZED_NODE_FIELD');
  smuggled.nodes[1].sideEffect='NONE';
  smuggled.nodes[1].maxIterations=5;
  expect(lintBlueprintDraft(smuggled).issues.map(x=>x.code))
   .toContain('LOOP_BOUND_MISMATCH');
  expect(lintBlueprintDraft(smuggled).deployAuthorized).toBe(false);
 });
 it('proves no draft can ever authorize deployment',()=>{
  const variants=[sample(),{...sample(),nodes:sample().nodes.slice(0,2)},
   {...sample(),edges:[{from:'start',to:'finish'}]}];
  for(const v of variants){
   expect(lintBlueprintDraft(v).deployAuthorized).toBe(false);
   expect(lintBlueprintDraft(v).executable).toBe(false);
  }
 });
});
