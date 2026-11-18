import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe,expect,it} from 'vitest';

type Failure={
 id:string;runId:number;job:string;stage:string;exitCode:number;errorCode:string;
 location:string;observed:string;expectedGate:string;resolution:string;reproduction:string;url:string;
};
const suite=JSON.parse(readFileSync(resolve(process.cwd(),'src/fixtures/ci-failure-modes-reference.json'),'utf8')) as
 {schemaVersion:number;cases:Failure[]};
describe('captured CI failure-mode reference evidence',()=>{
 it('references real immutable failed runs and documents blocking acceptance gates',()=>{
  expect(suite.schemaVersion).toBe(1);
  expect(suite.cases.length).toBeGreaterThanOrEqual(4);
  expect(new Set(suite.cases.map(x=>x.id)).size).toBe(suite.cases.length);
  for(const c of suite.cases){
   expect(c.url).toBe('https://github.com/Ashour158/medsol-ai-marketing-os/actions/runs/'+c.runId);
   expect(c.expectedGate.startsWith('BLOCK')).toBe(true);
   expect(c.exitCode).not.toBe(0);
   expect(c.errorCode).toMatch(/^(TS\d+|PNPM_AUDIT_ADVISORY|PRISMA_P2003)$/);
   expect(c.location.length).toBeGreaterThan(4);
   expect(c.observed.length).toBeGreaterThan(15);
   expect(c.resolution.length).toBeGreaterThan(12);
   expect(c.reproduction).toMatch(/^pnpm /);
  }
 });
});
