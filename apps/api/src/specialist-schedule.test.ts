import {describe,it,expect,vi} from 'vitest';
import {makeScheduleGrant,readScheduleGrant,reconstructSchedule,scheduleEvent,specialistScheduleConfigured} from './specialist-schedule.js';
const start=new Date('2026-01-01T00:00:00.000Z'),later=new Date('2026-01-01T00:10:00.000Z');
const key='fixture-schedule-test',grant=makeScheduleGrant('tenant-a','owner',key,'sha256:'+'a'.repeat(64),0,start);
describe('immutable specialist scheduler evidence',()=>{
 it('binds tenant, batch, owner, cursor and expiry',()=>{
  expect(readScheduleGrant(grant,'tenant-a',key)).toEqual(grant);
  expect(()=>readScheduleGrant(grant,'tenant-b',key)).toThrow();
  expect(()=>readScheduleGrant({...grant,owner:'other'},'tenant-a',key)).toThrow();
  expect(()=>readScheduleGrant({...grant,expiresAt:'2026-02-01T00:00:00.000Z'},'tenant-a',key)).toThrow();
 });
 it('claims one cursor and reconstructs ordered successful outcomes without mutating evidence',()=>{
  const claim=scheduleEvent(grant,'CLAIMED',0),advance=scheduleEvent(grant,'ADVANCED',0),next=scheduleEvent(grant,'CLAIMED',1),complete=scheduleEvent(grant,'COMPLETED',1);
  expect(reconstructSchedule(grant,[],later)).toMatchObject({status:'ACTIVE',cursor:0});
  expect(reconstructSchedule(grant,[claim],later)).toMatchObject({status:'CLAIMED',cursor:0});
  expect(reconstructSchedule(grant,[advance,claim],later)).toMatchObject({status:'ACTIVE',cursor:1});
  expect(reconstructSchedule(grant,[complete,advance,next,claim],later)).toMatchObject({status:'COMPLETED',cursor:2});
  expect(()=>reconstructSchedule(grant,[advance],later)).toThrow();
  expect(()=>reconstructSchedule(grant,[claim,claim],later)).toThrow();
  expect(()=>reconstructSchedule(grant,[next],later)).toThrow();
 });
 it('never projects a claimed or failed stage as eligible for automatic retry',()=>{
  const claim=scheduleEvent(grant,'CLAIMED',0),failure=scheduleEvent(grant,'NEEDS_INTERVENTION',0),cancel=scheduleEvent(grant,'CANCELLED',0);
  expect(reconstructSchedule(grant,[],new Date(grant.expiresAt))).toMatchObject({status:'EXPIRED'});
  expect(reconstructSchedule(grant,[claim],new Date(grant.expiresAt))).toMatchObject({status:'CLAIMED'});
  expect(reconstructSchedule(grant,[claim,failure],later)).toMatchObject({status:'NEEDS_INTERVENTION',cursor:0});
  expect(reconstructSchedule(grant,[claim,failure,cancel],later)).toMatchObject({status:'CANCELLED',cursor:0});
  expect(()=>reconstructSchedule(grant,[claim,failure,scheduleEvent(grant,'CLAIMED',1)],later)).toThrow();
  expect(()=>reconstructSchedule(grant,[claim,{...failure,response:{...failure.response,grantDigest:'forged'}}],later)).toThrow();
 });
 it('requires both explicit flags and disabled real reasoning',()=>{
  try{vi.stubEnv('MARKETING_BRAIN_WORKER_ENABLED','true');vi.stubEnv('MARKETING_SPECIALIST_SCHEDULER_ENABLED','false');vi.stubEnv('MARKETING_AI_REASONING_ENABLED','false');expect(specialistScheduleConfigured()).toBe(false);
   vi.stubEnv('MARKETING_SPECIALIST_SCHEDULER_ENABLED','true');expect(specialistScheduleConfigured()).toBe(true);
   vi.stubEnv('MARKETING_AI_REASONING_ENABLED','true');expect(specialistScheduleConfigured()).toBe(false);
  }finally{vi.unstubAllEnvs();}
 });
});
