import {describe,it,expect} from 'vitest';
import {gapInventoryCsv,gapCounts,type GapInventory} from './blueprint-gap-register';
const fixture=():GapInventory=>({
 version:'2.1',targetStateOnly:true,counts:{engines:36,workflows:41},
 engines:Array.from({length:36},(_,i)=>({id:'E'+String(i+1).padStart(2,'0'),
  name:i===0?'=HYPERLINK("https://bad.invalid")':'Engine '+i,owner:'Canonical',
  release:'R2',state:'PARTIAL',blocker:'Requires independent acceptance'})),
 workflows:Array.from({length:41},(_,i)=>({id:'WF'+String(i+1).padStart(2,'0'),
  name:'Workflow '+i,owner:'Canonical',release:'R3',state:'NOT_IMPLEMENTED',
  blocker:'No verified E2E'}))
});
describe('T8B blueprint gap export',()=>{
 it('retains exactly 36+41 target capabilities and does not claim certification',()=>{
  const csv=gapInventoryCsv(fixture());
  expect(csv.split('\r\n').filter(Boolean)).toHaveLength(79);
  expect(csv).toContain('NOT_CERTIFIED');
  expect(csv).toContain('TARGET_REGISTER_NOT_RUNTIME_PROOF');
  expect(csv).toContain("'=HYPERLINK");
  expect(gapCounts(fixture()).byState.PARTIAL).toBe(36);
  expect(gapCounts(fixture()).byState.NOT_IMPLEMENTED).toBe(41);
 });
 it('rejects forged counts, reordered/duplicate IDs and fake runtime statuses',()=>{
  const f=fixture();f.counts.engines=35;
  expect(()=>gapInventoryCsv(f)).toThrow();
  const g=fixture();g.workflows[0]!.id='WF02';
  expect(()=>gapInventoryCsv(g)).toThrow();
  const h=fixture();h.engines[0]!.state='PRODUCTION_CERTIFIED';
  expect(()=>gapInventoryCsv(h)).toThrow();
  const z=fixture();z.targetStateOnly=false;
  expect(()=>gapInventoryCsv(z)).toThrow();
 });
});
