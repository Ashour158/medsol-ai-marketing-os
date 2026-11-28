import {describe,it,expect} from 'vitest';
import type {Approval,Prisma} from '@prisma/client';
import {configInput,configId,configScope,configDigest,readConfig,currentConfig,assertConfigPolicy} from './offline-specialist-config.js';
const org='tenant-a',actor='operator-a',expiry='2026-12-01T00:00:00.000Z';
const reg={id:'specialist-'+'a'.repeat(64),digest:'sha256:'+'b'.repeat(64)};
const raw={action:'CONFIGURE',agentId:'MKT-SPECIALIST-evidence',requestKey:'fixture-config-001',mission:'Review synthetic scientific evidence',evidenceRequired:true,expectedVersion:0,maxObjectiveChars:100,fixtureOnly:true};
function approval(input:unknown,previousDigest:string|null){
 const i=configInput(input),s=configScope(org,actor,i,reg.id,reg.digest,previousDigest,expiry);
 return{id:configId(org,i.requestKey),organizationId:org,requestedBy:actor,decidedBy:'reviewer-b',decidedAt:new Date('2026-11-30T00:00:00.000Z'),scopeExpiresAt:new Date(expiry),objectType:'OfflineSpecialistConfiguration',objectId:i.agentId,requiredAuthority:'HUMAN_MARKETING_AUTHORITY',scope:s,scopeDigest:configDigest(s)} as unknown as Approval;
}
const tx=(rows:Approval[])=>({approval:{findMany:async()=>rows}} as unknown as Prisma.TransactionClient);
describe('versioned specialist configuration',()=>{
 it('rejects out-of-scope commands and policy limits',()=>{
  for(const invalid of [{...raw,action:'ACTIVATE'},{...raw,agentId:'MKT-SCI-001'},{...raw,expectedVersion:50},{...raw,maxObjectiveChars:501},{...raw,evidenceRequired:'true'},{...raw,fixtureOnly:false},{...raw,tools:[]}])expect(()=>configInput(invalid)).toThrow();
 });
 it('binds exact config and checks contiguous reviewed history',async()=>{
  const first=approval(raw,null),next=approval({...raw,requestKey:'fixture-config-002',expectedVersion:1,mission:'Assess synthetic research evidence'},first.scopeDigest);
  expect(readConfig(first).version).toBe(1);
  expect(()=>readConfig({...first,scopeDigest:'sha256:'+'c'.repeat(64)})).toThrow();
  const pin=await currentConfig(tx([next,first]),org,raw.agentId,reg);
  expect(pin).toMatchObject({version:2,mission:'Assess synthetic research evidence',evidenceRequired:true});
  expect(()=>assertConfigPolicy(pin,'x'.repeat(101),'evidence')).toThrow();
  expect(()=>assertConfigPolicy(pin,'Review evidence',undefined)).toThrow();
  expect(()=>assertConfigPolicy(pin,'Review evidence','evidence')).not.toThrow();
  await expect(currentConfig(tx([next]),org,raw.agentId,reg)).rejects.toThrow();
  await expect(currentConfig(tx([first,first]),org,raw.agentId,reg)).rejects.toThrow();
  await expect(currentConfig(tx([{...first,decidedBy:actor}]),org,raw.agentId,reg)).rejects.toThrow();
 });
});
