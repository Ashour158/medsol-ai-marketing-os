import {describe,it,expect,vi} from 'vitest';
import {AGENT_ROSTER,BoundedModelGateway,GovernedModelRouter,type ModelResult,type ModelRequest,type ModelProviderKey} from '@medsol/agent-runtime';
import {specialistMissionPlan} from './specialist-mission-brain.js';
import {specialistDecision} from './specialist-decision-brain.js';
import {prepareSpecialistModelDraft,validateSpecialistModelDraft,runStructuredSpecialistDraft,prepareStructuredDraftFixture,structuredDraftFixture,structuredDraftFixtureReceipt} from './specialist-structured-model-draft.js';
const digest='sha256:'+'a'.repeat(64);
const contextPin={query:'synthetic evidence',references:[{kind:'SOURCE' as const,documentId:'document-private',recordId:'chunk-private',citationRef:'PRIVATE-CITATION-1',digest,sourceDigest:digest}]};
const plan=specialistMissionPlan({mission:'Review marketing evidence carefully',objective:'Review marketing evidence for draft',market:'Egypt',capability:'INTERNAL_REVIEW',references:contextPin.references.map(x=>x.citationRef)});
const input={organizationId:'tenant-a',approvalId:'specialist-run-'+'a'.repeat(64),scopeDigest:digest,templateAgentId:AGENT_ROSTER[0]!.id,plan,decision:specialistDecision(plan,true),contextPin,maxOutputTokens:600,timeoutMs:1000,estimatedCostMicros:100};
const prepared=prepareSpecialistModelDraft(input);
const draft={schema:'medsol.specialist-model-draft.v1',requestDigest:prepared.requestDigest,disposition:'DRAFT_FOR_REVIEW',summary:'Prepare a draft for an independent reviewer.',recommendations:[{text:'Check whether the evidence supports the intended audience.',evidenceAliases:['E1']}],limitations:['The underlying evidence has not been read or verified.'],reviewQuestions:['What evidence supports the proposed positioning?']};
const result=(v:unknown):ModelResult=>({text:JSON.stringify(v),inputTokens:100,outputTokens:200,actualCostMicros:0,model:'offline-fixture'});
describe('structured specialist model boundary',()=>{
 it('binds exact reviewed scope and sends only opaque evidence labels',()=>{
  const envelope=JSON.parse(prepared.request.input);
  expect(envelope.data.evidence).toEqual([{alias:'E1',kind:'SOURCE'}]);
  expect(prepared.request.input).not.toContain('PRIVATE-CITATION-1');
  expect(prepared.request.input).not.toContain('document-private');
  expect(prepared.request.input).not.toContain('chunk-private');
  expect(prepared.request.input).not.toContain(input.organizationId);
  expect(prepared.request.input).not.toContain(input.approvalId);
  expect(prepareSpecialistModelDraft({...input,organizationId:'tenant-b'}).requestDigest).not.toBe(prepared.requestDigest);
  expect(()=>prepareSpecialistModelDraft({...input,decision:specialistDecision(plan,false)})).toThrow();
  expect(()=>prepareSpecialistModelDraft({...input,contextPin:{...contextPin,references:[]}})).toThrow();
  expect(()=>prepareSpecialistModelDraft({...input,scopeDigest:'forged'})).toThrow();
  expect(()=>prepareSpecialistModelDraft({...input,plan:{...plan,objective:'Altered marketing evidence'}})).toThrow();
 });
 it('accepts exact untrusted drafts while denying authority',()=>{
  const validated=validateSpecialistModelDraft(prepared,result(draft));
  expect(validated).toMatchObject({draft,draftDigest:expect.stringMatching(/^sha256:/),outputHumanApproved:false,scientificVerification:false,semanticAlignmentVerified:false,modelQualityEvaluated:false,executionAuthorized:false,toolCallsAuthorized:false,memoryWritesAuthorized:false,externalEffectsAuthorized:false});
  expect(validateSpecialistModelDraft(prepared,result({...draft,disposition:'REQUEST_EVIDENCE',recommendations:[]})).draft.disposition).toBe('REQUEST_EVIDENCE');
  expect(validateSpecialistModelDraft(prepared,result({...draft,disposition:'ESCALATE_SCOPE',recommendations:[]})).draft.disposition).toBe('ESCALATE_SCOPE');
 });
 it('rejects malformed, cross-request, fabricated alias, extra authority and overbudget outputs',()=>{
  const bad=[{...draft,requestDigest:digest},{...draft,executionAuthorized:true},{...draft,toolCalls:[{name:'publish'}]},{...draft,disposition:'APPROVED'},{...draft,disposition:['DRAFT_FOR_REVIEW']},{...draft,limitations:[]},{...draft,reviewQuestions:[]},{...draft,disposition:'REQUEST_EVIDENCE'},{...draft,recommendations:[]},{...draft,recommendations:[{text:'Verify the sources.',evidenceAliases:['E99']}]},{...draft,recommendations:[{text:'Verify the sources.',evidenceAliases:['E1','E1']}]},{...draft,recommendations:[{text:'Verify the sources.',evidenceAliases:['E1'],tool:'send'}]}];
  for(const raw of bad)expect(()=>validateSpecialistModelDraft(prepared,result(raw))).toThrow();
  expect(()=>validateSpecialistModelDraft(prepared,{...result(draft),text:'```json\n'+JSON.stringify(draft)+'\n```'})).toThrow();
  expect(()=>validateSpecialistModelDraft(prepared,{...result(draft),actualCostMicros:101})).toThrow();
  expect(()=>validateSpecialistModelDraft(prepared,{...result(draft),outputTokens:601})).toThrow();
 });
 it('exercises canonical exact-tenant gateway with four offline response fixtures, not live inference',async()=>{
  for(const providerKey of ['OPENAI','ANTHROPIC','GEMINI','LOCAL'] as ModelProviderKey[]){
   const complete=vi.fn(async(_request:ModelRequest)=>({...result(draft),model:'fixture:'+providerKey}));
   const gateway=new BoundedModelGateway(new GovernedModelRouter({scopeMode:'EXACT_TENANT',routes:[{organizationId:input.organizationId,agentId:input.templateAgentId,purpose:'INTERNAL_MARKETING_DRAFT',providerKey}],adapters:{[providerKey]:{complete}}}));
   const observed=await runStructuredSpecialistDraft(prepared,request=>gateway.complete(request));
   expect(observed.model).toBe('fixture:'+providerKey);
   expect(observed.actualCostMicros).toBe(0);
   expect(complete).toHaveBeenCalledTimes(1);
   await expect(gateway.complete({...prepared.request,organizationId:'tenant-b'})).rejects.toThrow('No authorized provider route');
   expect(complete).toHaveBeenCalledTimes(1);
  }
 });
});

it('reconstructs an exact zero-cost fixture receipt and refuses arbitrary fixture outputs',()=>{
 const fixture=prepareStructuredDraftFixture(input),response=structuredDraftFixture(fixture);
 const receipt=structuredDraftFixtureReceipt(fixture,response);
 expect(receipt).toMatchObject({mode:'STRUCTURED_DRAFT_FIXTURE_V1',fixtureOnly:true,providerRequestsMade:0,realModelInvocations:0,actualCostMicros:0,outputHumanApproved:false,externalEffectsAuthorized:false});
 expect(structuredDraftFixtureReceipt(fixture,structuredDraftFixture(fixture))).toEqual(receipt);
 expect(()=>structuredDraftFixtureReceipt(fixture,{...response,model:'unreviewed-model'})).toThrow();
 expect(()=>structuredDraftFixtureReceipt(fixture,{...response,text:JSON.stringify({...JSON.parse(response.text),summary:'Different but well formed summary.'})})).toThrow();
});
