import {describe,expect,it} from 'vitest';
import {AGENT_ROSTER} from '@medsol/agent-runtime';
import {getBlueprintV2Inventory,lintBlueprintDraft} from '@medsol/contracts';
import {permissionForMarketingRoute,hasMarketingPermission} from './marketing-permissions.js';
describe('Integrated target inventory and canonical marketing engine authority',()=>{
 it('maps blueprint brains/personas to the real 13 immutable agent IDs, not shadow installs',()=>{
  const ids=new Set(AGENT_ROSTER.map(x=>x.id));
  expect(ids.size).toBe(13);
  const inventory=getBlueprintV2Inventory();
  for(const alias of [...inventory.brains,...inventory.personas])
   expect(ids.has(alias.canonicalAgentId)).toBe(true);
  expect(inventory.counts).toEqual({engines:36,workflows:41,studios:13,brains:10,personas:12});
 });
 it('restricts read-only blueprint inventory to an authenticated auditor',()=>{
  const p=permissionForMarketingRoute('GET','/marketing/architecture/blueprint');
  expect(p).toBe('READ_AUDIT');
  expect(hasMarketingPermission({role:'VIEWER'} as any,p!)).toBe(false);
  expect(hasMarketingPermission({role:'MARKETING_DIRECTOR'} as any,p!)).toBe(true);
  expect(()=>permissionForMarketingRoute('POST','/marketing/architecture/blueprint')).toThrow();
  expect(()=>permissionForMarketingRoute('POST','/marketing/architecture/blueprint/deploy')).toThrow();
 });
 it('cannot authorize a future social publish even when a graph passes structural lint',()=>{
  const draft={id:'content-review',version:1,nodes:[
   {id:'a',type:'TRIGGER'},{id:'b',type:'AGENT_TASK',agentId:'MKT-SOC-001'},
   {id:'c',type:'END'}],
   edges:[{from:'a',to:'b'},{from:'b',to:'c'}]};
  const result=lintBlueprintDraft(draft);
  expect(result.validDraft).toBe(true);
  expect(result.deployAuthorized).toBe(false);
  expect(result.executable).toBe(false);
 });
});
