import {describe,it,expect} from 'vitest';
import {retirementInput,retirementId,retirementScope,retirementDigest,readRetirement} from './offline-specialist-retirement.js';
import type {Approval} from '@prisma/client';
const raw={action:'RETIRE',agentId:'MKT-SPECIALIST-evidence',requestKey:'fixture-retirement-001',reason:'Synthetic retirement review',fixtureOnly:true};
const org='tenant-a',actor='operator-a',expiry='2026-12-01T00:00:00.000Z';
const reg='specialist-'+'a'.repeat(64),digest='sha256:'+'b'.repeat(64);
describe('exact offline specialist retirement',()=>{
 it('rejects invalid authority, canonical identities and unexpected fields',()=>{
  for(const invalid of [{...raw,action:'ACTIVATE'},{...raw,agentId:'MKT-SCI-001'},{...raw,fixtureOnly:false},{...raw,reason:'short'},{...raw,capabilities:['CHECK_EVIDENCE']}])expect(()=>retirementInput(invalid)).toThrow();
 });
 it('binds reviewed registration, tenant, requester, exact target and expiry',()=>{
  const i=retirementInput(raw),s=retirementScope(org,actor,i,reg,digest,expiry);
  const a={id:retirementId(org,i.requestKey),organizationId:org,requestedBy:actor,scopeExpiresAt:new Date(expiry),objectType:'OfflineSpecialistRetirement',objectId:i.agentId,requiredAuthority:'HUMAN_MARKETING_AUTHORITY',scope:s,scopeDigest:retirementDigest(s)} as unknown as Approval;
  expect(readRetirement(a)).toEqual(s);
  expect(()=>readRetirement({...a,scope:{...s,targetStatus:'ACTIVE'}})).toThrow();
  expect(()=>readRetirement({...a,organizationId:'tenant-b'})).toThrow();
  expect(()=>readRetirement({...a,scopeDigest:'sha256:'+'c'.repeat(64)})).toThrow();
  expect(retirementId('tenant-b',i.requestKey)).not.toBe(a.id);
 });
});
