import { describe, expect, it, vi } from 'vitest';
import { MarketingLearningService } from './marketing-learning.service.js';
import { permissionForMarketingRoute, hasMarketingPermission } from './marketing-permissions.js';

const signal={topic:'Long-read sequencing',sector:'Genomics',sourceUrl:'https://example.org/research',sourceTitle:'Study',observedAt:'2026-11-01T00:00:00Z',evidence:{summary:'Reported research trend, not independently verified'}};
function setup(){
 const db:any={learningSignal:{
  findUnique:vi.fn().mockResolvedValue(null),
  create:vi.fn().mockImplementation(async ({data}:any)=>data),
  findFirst:vi.fn().mockResolvedValue({id:'sig',organizationId:'tenant',status:'QUARANTINED'}),
  findMany:vi.fn().mockResolvedValue([]),
  updateMany:vi.fn().mockResolvedValue({count:1})
 },agentSkillProposal:{
  findUnique:vi.fn().mockResolvedValue(null),
  create:vi.fn().mockImplementation(async ({data}:any)=>data),
  findMany:vi.fn().mockResolvedValue([])
 },auditEvent:{create:vi.fn().mockResolvedValue({})}};
 return{db,service:new MarketingLearningService(db)};
}
describe('learning engine controls',()=>{
 it('quarantines new trends, stores provenance and deduplicates repeated signals',async()=>{
  const {db,service}=setup();
  const result=await service.ingest('tenant',signal);
  expect(result.signal.status).toBe('QUARANTINED');
  expect(result.signal.organizationId).toBe('tenant');
  db.learningSignal.findUnique.mockResolvedValueOnce(result.signal);
  await expect(service.ingest('tenant',signal)).resolves.toMatchObject({replayed:true});
 });
 it('rejects non-HTTPS source references',async()=>{
  const {service}=setup();
  await expect(service.ingest('tenant',{...signal,sourceUrl:'http://localhost/internal'})).rejects.toThrow('HTTPS');
 });
 it('cannot promote a quarantined trend to agent skills',async()=>{
  const {service}=setup();
  await expect(service.propose('tenant','reviewer',{signalId:'sig',agentId:'MKT-STR-001',skillKey:'ASSESS_MARKET',rationale:'Evidence-led improvement'})).rejects.toThrow('reviewed');
 });
 it('rejects capability escalation outside the registered agent manifest',async()=>{
  const {service}=setup();
  await expect(service.propose('tenant','reviewer',{signalId:'sig',agentId:'MKT-STR-001',skillKey:'PUBLISH_SOCIAL',rationale:'Unauthorized'})).rejects.toThrow('signed agent manifest');
 });
 it('requires management authority for evidence attestation and skills',()=>{
  expect(permissionForMarketingRoute('POST','/marketing/learning/verify')).toBe('DECIDE_APPROVAL');
  expect(permissionForMarketingRoute('POST','/marketing/learning/proposals')).toBe('DECIDE_APPROVAL');
  expect(hasMarketingPermission({role:'VIEWER'} as any,'DECIDE_APPROVAL')).toBe(false);
 });
});
