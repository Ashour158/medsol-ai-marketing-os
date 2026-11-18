import { describe, expect, it } from 'vitest';
import { AGENT_ROSTER, assessDomain, assertDomainReleaseAllowed } from '@medsol/agent-runtime';
const base={organizationId:'tenant',objective:'Launch research program',market:'Egypt',audience:'Molecular labs',productId:'ONT',evidence:[],brandMasterVersion:null,consentReference:null} as const;
describe('13 domain intelligence controls',()=>{
 it('covers all registered agents with typed domain outputs',()=>{
  const ids=AGENT_ROSTER.map(x=>x.id);
  expect(ids).toHaveLength(13);
  for(const id of ids){
   const assessment=assessDomain(id,base);
   expect(assessment.agentId).toBe(id);
   expect(assessment.domain).toBeTruthy();
   expect(assessment.suggestedActions.length).toBeGreaterThan(0);
  }
 });
 it('requires verified scientific evidence rather than merely reviewed submissions',()=>{
  const input={...base,evidence:[{sourceId:'s1',sourceUrl:'https://example.org',sourceTitle:'Source',publishedAt:null,verified:false,reviewed:true,organizationId:'tenant',sector:'Genomics'}]};
  expect(assessDomain('MKT-SCI-001',input).reasons).toContain('independently_verified_evidence_required');
 });
 it('blocks cross-tenant evidence and requires consent for lifecycle marketing',()=>{
  const input={...base,evidence:[{sourceId:'s1',sourceUrl:'https://example.org',sourceTitle:'Source',publishedAt:null,verified:true,reviewed:true,organizationId:'other',sector:'Genomics'}]};
  expect(()=>assessDomain('MKT-SCI-001',input)).toThrow('Cross-tenant');
  expect(assessDomain('MKT-CRM-001',base).reasons).toContain('consent_record_required');
 });
 it('never treats agent assessment as external publishing authorization',()=>{
  expect(()=>assertDomainReleaseAllowed([assessDomain('MKT-CMO-001',base)])).toThrow('cannot authorize');
 });
});
