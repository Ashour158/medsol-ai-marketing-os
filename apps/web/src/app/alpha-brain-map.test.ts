import {describe,it,expect} from 'vitest';
import {readBrainMap} from '../lib/alpha-brain-map';
const roster=[{id:'a',name:'A'},{id:'b',name:'B'}];
const plan={stages:[{stage:'STRATEGY',agents:['a']},{stage:'MEASUREMENT',agents:['b']}],handoffs:{a:['b']}};
describe('Alpha Brain visualization reads canonical data only',()=>{
 it('maps declared stage and handoff from loaded canonical roster',()=>{const r=readBrainMap(plan,roster);expect(r?.agents.length).toBe(2);expect(r?.plan.handoffs.a).toEqual(['b']);});
 it('rejects invented agent, duplicate stage assignment, unknown handoff and absent roster',()=>{
  expect(readBrainMap({...plan,handoffs:{a:['c']}},roster)).toBeNull();
  expect(readBrainMap({...plan,stages:[{stage:'X',agents:['a','a']}]},roster)).toBeNull();
  expect(readBrainMap(plan,[])).toBeNull();
  expect(readBrainMap({...plan,stages:[{stage:'X',agents:['a']}]},roster)).toBeNull();
 });
});
