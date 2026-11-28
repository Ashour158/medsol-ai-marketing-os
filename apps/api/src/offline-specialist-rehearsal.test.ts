import {describe,it,expect} from 'vitest';
import {specialistMissionPlan,specialistPlanDigest} from './specialist-mission-brain.js';
import {rehearsalInput,rehearsalScope,rehearsalDigest,rehearsalId} from './offline-specialist-rehearsal.js';
const raw={agentId:'MKT-SPECIALIST-evidence-review',requestKey:'fixture-task-123456',objective:'Assess synthetic evidence for review',market:'Synthetic research',fixtureOnly:true};
const template={registrationId:'specialist-registration',registrationDigest:'sha256:'+'a'.repeat(64),templateId:'MKT-SCI-001',templateVersion:1,templateDigest:'sha256:'+'b'.repeat(64),templateInstalled:false,capability:'CHECK_EVIDENCE',maxInputBytes:65536};
import {parseContextPin} from './specialist-context-pin.js';
describe('Exact offline specialist rehearsal',()=>{
 it('binds opt-in brain mode without changing the legacy scope and rejects other modes',()=>{
  const expiry='2026-12-01T00:00:00.000Z';
  const legacy=rehearsalScope('tenant-a','actor-a',rehearsalInput(raw),template,expiry);
  const planned=rehearsalScope('tenant-a','actor-a',rehearsalInput({...raw,brainMode:'MISSION_PLAN_V1'}),template,expiry);
  expect(rehearsalDigest(planned)).not.toBe(rehearsalDigest(legacy));
  expect(()=>rehearsalInput({...raw,brainMode:'LIVE'})).toThrow();
  expect(()=>rehearsalInput({...raw,brainMode:'MISSION_PLAN_V1',mission:'Unreviewed substitution'})).toThrow();
 });
 it('makes a bounded mission-specific draft, never verifies evidence or grants authority',()=>{
  const i={mission:'Review scientific evidence',objective:'Assess scientific evidence',market:'Fixture',capability:'CHECK_EVIDENCE',references:['kb:fixture:0:123']};
  const plan=specialistMissionPlan(i);
  expect(plan).toMatchObject({sharedTerms:['evidence','scientific'],alignmentSignal:'LEXICAL_OVERLAP',evidenceStatus:'REFERENCES_ONLY_UNVERIFIED',humanReviewRequired:true,scientificVerification:false,autonomousExecutionAuthorized:false,externalEffectsAuthorized:false,modelCallsAuthorized:false,toolCallsAuthorized:false,memoryWritesAuthorized:false});
  const alternate=specialistMissionPlan({...i,mission:'Develop creative assets',references:[]});
  expect(alternate).toMatchObject({alignmentSignal:'HUMAN_ALIGNMENT_REVIEW_REQUIRED',evidenceStatus:'NO_REVIEWED_REFERENCES'});
  expect(specialistPlanDigest(plan)).not.toBe(specialistPlanDigest(alternate));
  expect(specialistPlanDigest(Object.fromEntries(Object.entries(plan).reverse()))).toBe(specialistPlanDigest(plan));
  expect(()=>specialistMissionPlan({...i,references:['x','x']})).toThrow();
 });
 it('binds optional context citations to exact approval and preserves context-free legacy scope',()=>{
  const input=rehearsalInput({...raw,contextQuery:'synthetic evidence'}),expiry='2026-12-01T00:00:00.000Z';
  const pin=parseContextPin({query:'synthetic evidence',references:[{kind:'SOURCE',documentId:'document-123',recordId:'chunk-123456',citationRef:'kb:document-123:0:'+'a'.repeat(12),digest:'sha256:'+'a'.repeat(64),sourceDigest:'sha256:'+'b'.repeat(64)}]},'synthetic evidence');
  const scope=rehearsalScope('tenant-a','actor-a',input,template,expiry,pin);
  expect(rehearsalDigest(scope)).not.toBe(rehearsalDigest(rehearsalScope('tenant-a','actor-a',rehearsalInput(raw),template,expiry)));
  expect(rehearsalDigest({...scope,contextPin:{...pin,references:pin.references.map(x=>({...x,sourceDigest:'sha256:'+'c'.repeat(64)}))}})).not.toBe(rehearsalDigest(scope));
  const {contextPin: _missingPin,...scopeWithoutPin}=scope;
  expect(()=>rehearsalDigest(scopeWithoutPin)).toThrow();
  expect(()=>parseContextPin({...pin,references:[]},pin.query)).toThrow();
  expect(()=>parseContextPin({...pin,references:[...pin.references,...pin.references]},pin.query)).toThrow();
 });
 it('rejects arbitrary identities, tool authority, excessive inputs and live intent',()=>{
  for(const invalid of [{...raw,agentId:'MKT-SCI-001'},{...raw,tools:['MCP']},{...raw,fixtureOnly:false},{...raw,objective:'x'.repeat(501)}])
   expect(()=>rehearsalInput(invalid)).toThrow();
 });
 it('pins tenant, operator, exact task, template release, registration and expiry',()=>{
  const input=rehearsalInput(raw),expiry='2026-12-01T00:00:00.000Z';
  const scope=rehearsalScope('tenant-a','actor-a',input,template,expiry);
  const digest=rehearsalDigest(scope);
  expect(scope).toMatchObject({autonomousExecutionAuthorized:false,modelCallsAuthorized:false,toolCallsAuthorized:false,memoryWritesAuthorized:false,externalEffectsAuthorized:false});
  for(const changed of [{...scope,organizationId:'tenant-b'},{...scope,requestedBy:'actor-b'},{...scope,templateVersion:2},{...scope,templateInstalled:true},{...scope,registrationDigest:'sha256:'+'c'.repeat(64)},{...scope,expiresAt:'2026-12-02T00:00:00.000Z'},{...scope,input:{...input,objective:'A different synthetic review'}}])
   expect(rehearsalDigest(changed)).not.toBe(digest);
  expect(rehearsalId('tenant-a',input.requestKey)).not.toBe(rehearsalId('tenant-b',input.requestKey));
 });
});
