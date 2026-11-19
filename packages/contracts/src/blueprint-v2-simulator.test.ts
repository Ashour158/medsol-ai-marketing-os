import {describe,expect,it} from 'vitest';
import {simulateBlueprintDraft} from './blueprint-v2-simulator.js';

const draft=()=>({
 id:'campaign-blueprint',version:1,
 nodes:[
  {id:'start',type:'TRIGGER'},
  {id:'cmo',type:'AGENT_TASK',agentId:'MKT-CMO-001',maxSeconds:60},
  {id:'route',type:'CONDITION'},
  {id:'copy',type:'AGENT_TASK',agentId:'MKT-CONT-001',maxSeconds:120},
  {id:'design',type:'AGENT_TASK',agentId:'MKT-CREATIVE-001',maxSeconds:120},
  {id:'join',type:'JOIN'},
  {id:'approval',type:'APPROVAL'},
  {id:'schedule',type:'SCHEDULE'},
  {id:'end',type:'END'}
 ],
 edges:[
  {from:'start',to:'cmo'},{from:'cmo',to:'route'},
  {from:'route',to:'copy'},{from:'route',to:'design'},
  {from:'copy',to:'join'},{from:'design',to:'join'},
  {from:'join',to:'approval'},{from:'approval',to:'schedule'},
  {from:'schedule',to:'end'}
 ]
});
describe('R3 canonical blueprint DAG virtual simulator',()=>{
 it('preserves deterministic fan-out, join, human approval and scheduled handoff',()=>{
  const result=simulateBlueprintDraft(draft());
  expect(result).toMatchObject({
   status:'SIMULATED',blueprintId:'campaign-blueprint',stepCount:9,
   virtualAgentTasks:3,humanDecisionNodes:1,virtualWaitNodes:1,
   realAgentExecutions:0,actualModelCalls:0,actualMcpCalls:0,
   actualA2aCalls:0,actualDomainWrites:0,providerRequestsMade:0,
   externalEffectsAuthorized:false,executable:false,deployAuthorized:false
  });
  expect(result.steps.map(s=>s.nodeId)).toEqual([
   'start','cmo','route','copy','design','join','approval','schedule','end'
  ]);
  const join=result.steps.find(s=>s.nodeId==='join');
  expect(join?.predecessors).toEqual(['copy','design']);
  expect(result.steps.find(s=>s.nodeId==='approval')?.requiresHumanDecision).toBe(true);
  for(const s of result.steps){
   expect(s.isExternalAction).toBe(false);
   expect(s.isActualAgentExecution).toBe(false);
  }
  expect(simulateBlueprintDraft(draft())).toEqual(result);
 });
 it('rejects malicious unbounded, cyclic, unknown or real connector nodes',()=>{
  for(const type of ['MCP_TOOL','A2A_TASK','DOMAIN_COMMAND'] as const){
   const d=draft();
   d.nodes[1]={id:'cmo',type,agentId:'MKT-CMO-001'} as any;
   const r=simulateBlueprintDraft(d);
   expect(r.status).toBe('BLOCKED');
   expect(r.steps).toEqual([]);
   expect(r.externalEffectsAuthorized).toBe(false);
   expect(r.realAgentExecutions).toBe(0);
  }
  const c=draft();c.edges.push({from:'end',to:'start'});
  expect(simulateBlueprintDraft(c).status).toBe('BLOCKED');
  const bad=draft();bad.nodes[2]!.type='SHELL_EXECUTE';
  expect(simulateBlueprintDraft(bad).status).toBe('BLOCKED');
 });
 it('blocks disconnected nodes and multiple triggers without executing tasks',()=>{
  const d=draft();d.nodes.push({id:'orphan',type:'TRANSFORM'} as any);
  expect(simulateBlueprintDraft(d).issues.map(x=>x.code))
   .toContain('UNREACHABLE_NODES');
  const multiple=draft();
  multiple.nodes.push({id:'another-trigger',type:'TRIGGER'} as any);
  expect(simulateBlueprintDraft(multiple).issues.map(x=>x.code))
   .toContain('SINGLE_TRIGGER_REQUIRED');
 });
 it('refuses unknown agent identity, unbounded loop, side-effect declaration and malformed draft',()=>{
  const agent=draft();agent.nodes[1]!.agentId='AG-PRICE';
  expect(simulateBlueprintDraft(agent).issues.map(x=>x.code)).toContain('UNKNOWN_AGENT');
  const loop=draft();
  loop.nodes[2]={id:'route',type:'LOOP_BOUNDED',maxIterations:999} as any;
  expect(simulateBlueprintDraft(loop).issues.map(x=>x.code))
   .toContain('UNBOUNDED_ITERATION');
  const effects=draft();effects.nodes[1]!.sideEffect='IRREVERSIBLE_EXTERNAL';
  expect(simulateBlueprintDraft(effects).issues.map(x=>x.code))
   .toContain('EXTERNAL_EFFECT_BLOCKED');
  expect(simulateBlueprintDraft(null).stepCount).toBe(0);
 });
});
