import {describe,expect,it} from 'vitest';
import {AGENT_ROSTER,createMarketingWorkPackage,MarketingDomainAgent} from '@medsol/agent-runtime';
describe('thirteen specialized marketing work packages',()=>{
 it('gives each agent an owned deliverable, concrete reasoning stages and acceptance criteria',async()=>{
  const deliverables=new Set<string>();
  for(const manifest of AGENT_ROSTER){
   const agent=new MarketingDomainAgent(manifest);
   const decision=await agent.decide({executionId:'exec',organizationId:'tenant',correlationId:'corr',capabilities:[manifest.capabilities[0]!],input:{requestedOutcome:'Launch sequencing campaign',market:'MENA',targetAudience:'Laboratories'}});
   const work=(decision.payload as {workPackage:any}).workPackage;
   expect(work.agentId).toBe(manifest.id);
   expect(work.analysisSteps.length).toBeGreaterThanOrEqual(3);
   expect(work.acceptanceChecks.length).toBeGreaterThanOrEqual(2);
   expect(work.executable).toBe(false);
   deliverables.add(work.deliverable);
  }
  expect(deliverables.size).toBe(13);
 });
 it('preserves evidence as unverified and makes no unsupported quantitative assertion',()=>{
  const work=createMarketingWorkPackage('MKT-SCI-001',{requestedOutcome:'Explain protein sequencing',trendContext:{topics:[{topic:'proteomics',evidence:[{url:'https://europepmc.org/article/MED/1234'}]}]}});
  expect(work.references).toEqual([{topic:'proteomics',url:'https://europepmc.org/article/MED/1234',verification:'UNVERIFIED'}]);
  expect(work.executable).toBe(false);
  expect(work.acceptanceChecks).toContain('Scientific human approval required');
 });
});
