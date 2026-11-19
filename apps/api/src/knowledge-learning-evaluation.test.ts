import {describe,it,expect} from 'vitest';
import {parseRetrievalCases,evaluationMetrics,feedbackDigest}
 from './knowledge-learning-evaluation.js';
describe('R3-I bounded offline retrieval evaluation',()=>{
 it('computes exact ranking quality without granting autonomous promotion',()=>{
  const out=evaluationMetrics([
   {id:'case-001',rankedDocumentIds:['irrelevant','doc-a','doc-b'],
    relevantDocumentIds:['doc-a','doc-b']},
   {id:'case-002',rankedDocumentIds:['doc-c','doc-d'],
    relevantDocumentIds:['doc-c']}
  ],3);
  expect(out.cases).toBe(2);
  expect(out.hits).toBe(2);
  expect(out.precisionAtK).toBe(0.5);
  expect(out.recallAtK).toBe(1);
  expect(out.meanReciprocalRank).toBe(0.75);
  expect(out.ndcgAtK).toBeGreaterThan(0.7);
  expect(out.modelOrSkillPromotionAuthorized).toBe(false);
  expect(out.independentlyVerified).toBe(false);
  expect(out.providerRequestsMade).toBe(0);
 });
 it('refuses fabricated unlabeled, empty, duplicate, bloated, or unknown evaluation input',()=>{
  const good={id:'case-001',query:'long read genomics',
   relevantDocumentIds:['source-001']};
  expect(parseRetrievalCases([good])).toHaveLength(1);
  for(const invalid of [[],[good,good],[{...good,other:'override'}],
    [{...good,relevantDocumentIds:[]}],
    [{...good,relevantDocumentIds:['source-001','source-001']}],
    Array.from({length:13},(_,i)=>({...good,id:'case-00'+i}))]){
    expect(()=>parseRetrievalCases(invalid)).toThrow();
  }
  expect(()=>evaluationMetrics([{id:'test',rankedDocumentIds:[],
   relevantDocumentIds:['source-001']}],0)).toThrow();
 });
 it('hashes feedback queries without making their contents audit-readable',()=>{
  expect(feedbackDigest('genomics')).toMatch(/^sha256:[0-9a-f]{64}$/);
  expect(feedbackDigest(' genomics ')).toEqual(feedbackDigest('genomics'));
  expect(feedbackDigest('proteomics')).not.toEqual(feedbackDigest('genomics'));
 });
});
