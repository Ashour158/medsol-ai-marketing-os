import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe,expect,it} from 'vitest';
import {createMarketingWorkPackage,AGENT_ROSTER} from '@medsol/agent-runtime';
type Case={id:string;status:string;totals:Record<string,unknown>;expected:Record<string,string>;expectedStatus:string};
const corpus=JSON.parse(readFileSync(resolve(process.cwd(),'src/fixtures/marketing-evidence-comparison.json'),'utf8')) as
 {schemaVersion:number;cases:Case[]};
describe('reviewed evidence acceptance comparison corpus (not RAG relevance ranking)',()=>{
 it('contains distinct evaluated reference conditions',()=>{
  expect(corpus.schemaVersion).toBe(1);
  expect(new Set(corpus.cases.map(x=>x.id)).size).toBe(corpus.cases.length);
  expect(corpus.cases.length).toBeGreaterThanOrEqual(5);
 });
 for(const c of corpus.cases){
  it(c.id,()=>{
   for(const agent of AGENT_ROSTER){
    const output=createMarketingWorkPackage(agent.id,{requestedOutcome:'Plan a sequencing educational campaign',
      performanceContext:{status:c.status,campaign:{id:'campaign-1'},totals:c.totals}});
    expect(output.marketingEvidence.reviewedTotals).toEqual(c.expected);
    expect(output.marketingEvidence.reviewStatus).toBe(c.expectedStatus);
    expect(output.marketingEvidence.attributionValidated).toBe(false);
    expect(output.catalog.scientificClaimsVerified).toBe(false);
    expect(output.executable).toBe(false);
   }
  });
 }
});
