import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe,expect,it} from 'vitest';
import {AGENT_ROSTER,assessDomain,assertDomainReleaseAllowed,type DomainAgentInput} from '@medsol/agent-runtime';

type Case={
 id:string;agentId:string;evidenceKind?:'reviewedOnly'|'independentlyVerified'|'foreignTenant';
 brandMasterVersion?:string;consentReference?:string;expectedGate?:string;expectedReasons?:string[];
 expectedConfidence?:string;expectedEvidenceIds?:string[];expectedError?:string;
};
const corpus=JSON.parse(readFileSync(resolve(process.cwd(),'src/fixtures/marketing-analyzer-golden.json'),'utf8')) as
 {schemaVersion:number;cases:Case[]};
function input(c:Case):DomainAgentInput{
 const evidence=c.evidenceKind?[{
  sourceId:'source-1',sourceUrl:'https://example.org/evidence',sourceTitle:'Reference metadata',
  publishedAt:'2026-11-10',verified:c.evidenceKind!=='reviewedOnly',reviewed:true,
  organizationId:c.evidenceKind==='foreignTenant'?'tenant-b':'tenant-a',sector:'genomics'
 }]:[];
 return {organizationId:'tenant-a',objective:'Inform research labs',market:'MENA',
  audience:'Molecular laboratories',productId:null,evidence,
  brandMasterVersion:c.brandMasterVersion??null,consentReference:c.consentReference??null};
}
describe('versioned deterministic analyzer golden corpus',()=>{
 it('has unique cases covering every registered agent',()=>{
  expect(corpus.schemaVersion).toBe(1);
  expect(new Set(corpus.cases.map(c=>c.id)).size).toBe(corpus.cases.length);
  expect(new Set(corpus.cases.map(c=>c.agentId))).toEqual(new Set(AGENT_ROSTER.map(m=>m.id)));
 });
 for(const c of corpus.cases){
  it(c.id,()=>{
   if(c.expectedError){
    expect(()=>assessDomain(c.agentId,input(c))).toThrow(c.expectedError);
    return;
   }
   const actual=assessDomain(c.agentId,input(c));
   expect(actual).toMatchObject({agentId:c.agentId,gate:c.expectedGate,
    confidence:c.expectedConfidence,reasons:c.expectedReasons,evidenceIds:c.expectedEvidenceIds});
   expect(actual.suggestedActions.every(a=>!a.startsWith('PUBLISH')&&!a.startsWith('APPROVE'))).toBe(true);
   expect(()=>assertDomainReleaseAllowed([actual])).toThrow('cannot authorize external publishing');
  });
 }
});
