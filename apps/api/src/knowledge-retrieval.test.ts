import {describe,it,expect} from 'vitest';
import {chunkKnowledge,knowledgeTerms,knowledgeText,knowledgeCosine,
 sparseKnowledgeVector,KNOWLEDGE_VECTOR_DIMENSIONS,evidenceScore}
 from './knowledge-retrieval.js';
const doc='Long read sequencing identifies structural variants, genomic rearrangements and '+ 
 'novel isoforms in research reports. Claim validation requires independent expert review.';
describe('R3-H deterministic no-provider knowledge pipeline',()=>{
 it('chunks, hashes and bounds independent source spans with overlap',()=>{
  const chunks=chunkKnowledge(doc.repeat(70));
  expect(chunks.length).toBeGreaterThan(3);
  expect(chunks.length).toBeLessThanOrEqual(40);
  expect(chunks[0]?.digest).toMatch(/^sha256:[a-f0-9]{64}$/);
  expect(chunks.every(x=>x.content.length<=860&&x.vector.length===96)).toBe(true);
  expect(chunkKnowledge(doc)).toEqual(chunkKnowledge(doc));
 });
 it('uses deterministic local sparse vectors with bounded cosine and no model calls',()=>{
  const x=sparseKnowledgeVector('Genomics sequencing evidence');
  expect(x).toHaveLength(KNOWLEDGE_VECTOR_DIMENSIONS);
  expect(knowledgeCosine(x,x)).toBeCloseTo(1,9);
  expect(knowledgeCosine(x,sparseKnowledgeVector('campaign rights approvals'))).toBeLessThan(1);
  expect(knowledgeCosine([],x)).toBe(0);
  expect(knowledgeTerms('GENOMICS genomics long-read sequencing')).toEqual(['genomics','long','read','sequencing']);
 });
 it('refuses control payloads, overlong content and missing evidence',()=>{
  expect(()=>knowledgeText('bad')).toThrow('substantive');
  expect(()=>chunkKnowledge('x'.repeat(900))).toThrow('token');
  expect(()=>knowledgeText('hello'.repeat(60)+'\u0001')).toThrow('printable');
 });
 it('weights actual lexical rank, vector similarity and freshness without claiming verification',()=>{
  const today=Date.now();
  const recent=evidenceScore({textRank:0.7,cosine:0.7,publishedAt:new Date(today-86400000),now:today});
  const old=evidenceScore({textRank:0.7,cosine:0.7,publishedAt:new Date(today-86400000*900),now:today});
  expect(recent).toBeGreaterThan(old);
 });
});
