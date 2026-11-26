import {describe,expect,it} from 'vitest';
import {TARGET_ENGINES,TARGET_WORKFLOWS,TARGET_STUDIOS,TARGET_BRAINS,TARGET_PERSONAS,
  TARGET_COUNTS,RELEASE_GATES,getBlueprintV2Inventory} from './blueprint-v2.js';

describe('Master Blueprint v2.1 complete declarative coverage',()=>{
 it('keeps every unique blueprint identifier in one canonical target register',()=>{
  const expectIds=(rows:readonly {id:string}[],expected:number,regex:RegExp)=>{
   expect(rows).toHaveLength(expected);
   const ids=rows.map(x=>x.id);
   expect(new Set(ids).size).toBe(expected);
   for(const id of ids)expect(id).toMatch(regex);
  };
  expectIds(TARGET_ENGINES,TARGET_COUNTS.engines,/^E(?:0[1-9]|[12][0-9]|3[0-6])$/);
  expectIds(TARGET_WORKFLOWS,TARGET_COUNTS.workflows,/^WF(?:0[1-9]|[12][0-9]|3[0-9]|4[01])$/);
  expectIds(TARGET_STUDIOS,TARGET_COUNTS.studios,/^S(?:0[1-9]|1[0-3])$/);
  expectIds(TARGET_BRAINS,TARGET_COUNTS.brains,/^B(?:0[1-9]|10)$/);
  expectIds(TARGET_PERSONAS,TARGET_COUNTS.personas,/^AG-[A-Z]+$/);
  expect(TARGET_ENGINES.map(x=>x.id)).toEqual(
   Array.from({length:36},(_,i)=>'E'+String(i+1).padStart(2,'0')));
  expect(TARGET_WORKFLOWS.map(x=>x.id)).toEqual(
   Array.from({length:41},(_,i)=>'WF'+String(i+1).padStart(2,'0')));
 });
 it('never represents an unbuilt external effect as implemented or authorized',()=>{
  for(const id of ['E01','E03','E04','E07','E08','E09','E10','E11','E12','E13','E14','E15','E16','E17','E18','E19','E20','E21','E22','E28','E29','E30','E31','E32','E33','E34'])
   expect(TARGET_ENGINES.find(e=>e.id===id)?.state).toBe('PARTIAL');
  for(const id of ['WF03','WF12','WF13','WF15','WF27','WF28'])
   expect(TARGET_WORKFLOWS.find(e=>e.id===id)?.state).toBe('NOT_IMPLEMENTED');
  for(const id of ['WF01','WF05','WF06','WF08','WF09','WF10','WF11','WF14','WF16','WF17','WF18','WF19','WF20','WF21','WF22','WF29','WF30','WF32','WF33','WF36','WF37','WF38','WF24','WF26','WF34','WF35','WF39','WF40','WF41'])
   expect(TARGET_WORKFLOWS.find(e=>e.id===id)?.state).toBe('PARTIAL');
  expect([...TARGET_ENGINES,...TARGET_WORKFLOWS,...TARGET_STUDIOS]
   .filter(x=>String(x.state)==='VERIFIED_IMPLEMENTED')).toHaveLength(0);
 });
 it('records merged partial capabilities with explicit remaining gates',()=>{
  for(const id of ['WF09','WF10','WF18','WF32','WF33','WF36','WF37','WF38']){
   const target: {goal?:string;blocker?:string;state:string}|undefined=TARGET_WORKFLOWS.find(e=>e.id===id);
   expect(target?.state).toBe('PARTIAL');
   expect(target?.goal?.length).toBeGreaterThan(10);
   expect(target?.blocker?.length).toBeGreaterThan(10);
  }
 });
 it('does not create new executing agents: aliases map to the 13 existing canonical authorities',()=>{
  const authorized=new Set([
   'MKT-CMO-001','MKT-OPS-001','MKT-STR-001','MKT-ANA-001','MKT-PM-001',
   'MKT-GROWTH-001','MKT-CRM-001','MKT-CONT-001','MKT-SOC-001','MKT-CREATIVE-001',
   'MKT-BRAND-001','MKT-EVENT-001','MKT-SCI-001'
  ]);
  for(const alias of [...TARGET_BRAINS,...TARGET_PERSONAS]){
   expect(authorized.has(alias.canonicalAgentId)).toBe(true);
   expect(alias.id).not.toBe(alias.canonicalAgentId);
  }
  expect(TARGET_BRAINS.every(x=>x.state==='COGNITIVE_ALIAS_TARGET')).toBe(true);
  expect(TARGET_PERSONAS.every(x=>x.state==='PERSONA_ALIAS_TARGET')).toBe(true);
 });
 it('assigns an implementation owner and phased release gates to every target',()=>{
  const valid=new Set(Object.keys(RELEASE_GATES));
  for(const target of [...TARGET_ENGINES,...TARGET_WORKFLOWS,...TARGET_STUDIOS]){
   expect(target.name.length).toBeGreaterThan(2);
   expect(target.owner.length).toBeGreaterThan(2);
   expect(valid.has(target.release)).toBe(true);
   expect(['NOT_IMPLEMENTED','DRAFT_ONLY','PARTIAL','VERIFIED_IMPLEMENTED']).toContain(target.state);
  }
  for(const release of Object.keys(RELEASE_GATES) as Array<keyof typeof RELEASE_GATES>)
   expect(RELEASE_GATES[release].length).toBeGreaterThan(2);
 });
 it('publishes a non-executable snapshot and does not grant external authority',()=>{
  const snapshot=getBlueprintV2Inventory();
  expect(snapshot.version).toBe('2.1');
  expect(snapshot.targetStateOnly).toBe(true);
  expect(Object.keys(snapshot).sort()).toEqual(['asOfCommit','brains','counts','engines','personas',
   'releaseGates','studios','targetStateOnly','version','workflows'].sort());
  expect(JSON.stringify(snapshot)).not.toContain('apiKey');
  expect(JSON.stringify(snapshot)).not.toContain('tokenSecret');
 });
});
