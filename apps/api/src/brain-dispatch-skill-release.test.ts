import {describe,it,expect,vi} from 'vitest';
import {BrainDispatchWorker} from './brain-dispatch.worker.js';
import {permissionForMarketingRoute} from './marketing-permissions.js';
import {SkillReleaseService} from './skill-release.service.js';

describe('brain worker dispatch authority',()=>{
 it('queries pending runs and delegates to CAS-owned executor',async()=>{
  const db:any={brainRun:{findFirst:vi.fn().mockResolvedValue({id:'run-a',organizationId:'tenant'})}};
  const executor:any={execute:vi.fn().mockResolvedValue({status:'REVIEW_REQUIRED'})};
  const worker=new BrainDispatchWorker(db,executor);
  expect(await worker.tick()).toEqual({claimed:true,runId:'run-a',status:'REVIEW_REQUIRED'});
  expect(db.brainRun.findFirst).toHaveBeenCalledWith(expect.objectContaining({where:{status:'PENDING'}}));
  expect(executor.execute).toHaveBeenCalledWith('tenant','run-a');
  worker.onModuleDestroy();
 });
 it('does not reclaim a RUNNING run on process restart, and does not process after shutdown',async()=>{
  // A restarted process selects only PENDING; stale RUNNING belongs to the operator incident queue.
  const db:any={brainRun:{findFirst:vi.fn().mockResolvedValue(null)}};
  const executor:any={execute:vi.fn()};
  const worker=new BrainDispatchWorker(db,executor);
  expect(await worker.tick()).toEqual({claimed:false,status:'EMPTY'});
  expect(db.brainRun.findFirst).toHaveBeenCalledWith(expect.objectContaining({where:{status:'PENDING'}}));
  expect(executor.execute).not.toHaveBeenCalled();
  worker.onModuleDestroy();
  expect(await worker.tick()).toEqual({claimed:false,status:'STOPPING'});
  expect(db.brainRun.findFirst).toHaveBeenCalledTimes(1);
 });
 it('never silently retries failed execution in the same tick',async()=>{
  const db:any={brainRun:{findFirst:vi.fn().mockResolvedValue({id:'run-a',organizationId:'tenant'})}};
  const executor:any={execute:vi.fn().mockRejectedValue(new Error('uncertain completion'))};
  const worker=new BrainDispatchWorker(db,executor);
  expect((await worker.tick()).status).toBe('CLAIMED_ELSEWHERE_OR_NEEDS_INTERVENTION');
  expect(executor.execute).toHaveBeenCalledTimes(1);
 });
});
describe('skill evaluation release controls',()=>{
 it('rejects direct promotion before a regression result',async()=>{
  const db:any={$transaction:vi.fn(async(fn:any)=>fn({
   agentSkillProposal:{findFirst:vi.fn().mockResolvedValue({id:'p',organizationId:'t',status:'PROPOSED'})}
  }))};
  const service=new SkillReleaseService(db);
  await expect(service.decide('t','human','p','APPROVE','Evaluated and authorized release')).rejects.toThrow('must pass');
 });
 it('restricts skill decisions to managers',()=>{
  expect(permissionForMarketingRoute('POST','/marketing/learning/skills/evaluate')).toBe('DECIDE_APPROVAL');
  expect(permissionForMarketingRoute('POST','/marketing/learning/skills/decide')).toBe('DECIDE_APPROVAL');
 });
});
