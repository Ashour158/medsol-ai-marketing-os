import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe,expect,it} from 'vitest';
import {AGENT_ROSTER,AgentRegistry,AgentRuntime,MarketingDomainAgent,
 triageSocialDiscussion,type DiscussionDisposition,type DiscussionEscalation} from '@medsol/agent-runtime';

type Case={
 id:string;
 discussion:unknown;
 disposition?:DiscussionDisposition;
 escalations?:DiscussionEscalation[];
 reason?:string;
 error?:string;
};
const corpus=JSON.parse(readFileSync(resolve(process.cwd(),'src/fixtures/discussion-triage-golden.json'),'utf8')) as
 {schemaVersion:number;subject:string;cases:Case[]};
function runtime(){
 const registry=new AgentRegistry();
 const manifest=AGENT_ROSTER.find(m=>m.id==='MKT-SOC-001');
 if(!manifest)throw new Error('Missing Social agent manifest');
 registry.register(new MarketingDomainAgent(manifest));
 return new AgentRuntime(registry);
}
describe('Social & Community bounded discussion triage golden corpus',()=>{
 it('covers four states with unique cases and specialist escalations',()=>{
  expect(corpus.schemaVersion).toBe(1);
  expect(corpus.subject).toBe('MKT-SOC-001');
  expect(new Set(corpus.cases.map(c=>c.id)).size).toBe(corpus.cases.length);
  expect(new Set(corpus.cases.filter(c=>c.disposition).map(c=>c.disposition))).toEqual(
   new Set(['INFORMATIONAL','ANSWERED','NO_RESPONSE','HUMAN_REVIEW_REQUIRED'])
  );
  expect(corpus.cases.length).toBeGreaterThanOrEqual(16);
 });
 for(const scenario of corpus.cases){
  it(scenario.id,async()=>{
   if(scenario.error){
    expect(()=>triageSocialDiscussion('tenant-a',scenario.discussion)).toThrow(scenario.error);
    await expect(runtime().execute('MKT-SOC-001',{
     executionId:'exec',organizationId:'tenant-a',correlationId:'corr',capabilities:['CLASSIFY_SOCIAL'],
     input:{discussion:scenario.discussion,requestedOutcome:'Review discussion'}
    })).rejects.toThrow(scenario.error);
    return;
   }
   const result=triageSocialDiscussion('tenant-a',scenario.discussion);
   expect(result.disposition).toBe(scenario.disposition);
   expect(result.escalations).toEqual(scenario.escalations);
   expect(result.reasons).toContain(scenario.reason);
   expect(result.humanApprovalRequired).toBe(true);
   expect(result.externalEffectsAuthorized).toBe(false);
   const decision=await runtime().execute('MKT-SOC-001',{
    executionId:'exec',organizationId:'tenant-a',correlationId:'corr',capabilities:['CLASSIFY_SOCIAL'],
    input:{discussion:scenario.discussion,requestedOutcome:'Review discussion'}
   });
   expect(decision.executionAllowed).toBe(true);
   expect(decision.approvalRequired).toBe(true);
   const payload=decision.payload as {socialTriage?:typeof result;controls:{externalEffectPermitted:boolean;humanApproval:boolean}};
   expect(payload.socialTriage).toEqual(result);
   expect(payload.controls.humanApproval).toBe(true);
   expect(payload.controls.externalEffectPermitted).toBe(false);
  });
 }
 it('never treats recorded answer as scientific fact or permits publishing',()=>{
  const sample=corpus.cases.find(c=>c.id==='answered-source-backed');
  expect(sample).toBeDefined();
  const actual=triageSocialDiscussion('tenant-a',sample?.discussion);
  expect(actual.answerRecordedNotScientificallyVerified).toBe(true);
  expect(actual.externalEffectsAuthorized).toBe(false);
 });
 it('retains a domain-owned stricter approval gate even when global policy says R1',async()=>{
  const registry=new AgentRegistry();
  registry.register({
   id:'MKT-CMO-001',version:1,
   async decide(){return {agentId:'MKT-CMO-001',action:'ASSESS_OBJECTIVE',riskLevel:'R1' as const,
    rationale:'Must review',approvalRequired:true,payload:{reviewOnly:true}};}
  });
  await expect(new AgentRuntime(registry).execute('MKT-CMO-001',{
   executionId:'ex',organizationId:'tenant-a',correlationId:'corr',capabilities:['ASSESS_OBJECTIVE'],input:{}
  })).resolves.toMatchObject({executionAllowed:true,approvalRequired:true});
 });
});
