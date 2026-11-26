import { describe, it, expect, vi } from 'vitest';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { BrainRunLedgerService } from './brain-run-ledger.service.js';
import { permissionForMarketingRoute, hasMarketingPermission } from './marketing-permissions.js';

function fixture(options?: {status?:string;ageMinutes?:number;changed?:number;missing?:boolean}){
 const status=options?.status??'RUNNING';
 const updatedAt=new Date(Date.now()-(options?.ageMinutes??30)*60_000);
 const run={id:'run-1',organizationId:'tenant-a',status,updatedAt,correlationId:'corr-1',currentAgentId:'MKT-CMO-001'};
 const tx={
  $queryRaw:vi.fn().mockResolvedValue([]),
  brainRun:{
   findFirst:vi.fn().mockResolvedValue(options?.missing?null:run),
   updateMany:vi.fn().mockResolvedValue({count:options?.changed??1})
  },
  auditEvent:{create:vi.fn().mockResolvedValue({id:'audit-1'})}
 };
 const db={$transaction:vi.fn((fn:(transaction:any)=>Promise<unknown>)=>fn(tx))};
 return{service:new BrainRunLedgerService(db as any),tx};
}

describe('brain run operator quarantine',()=>{
 it('requires the configured management permission',()=>{
  const permission=permissionForMarketingRoute('POST','/marketing/brain/runs/run-1/quarantine');
  expect(permission).toBe('DECIDE_APPROVAL');
  expect(hasMarketingPermission({userId:'u',organizationId:'tenant-a',email:'u@example.org',role:'USER',subject:'oidc'},permission!)).toBe(false);
  expect(hasMarketingPermission({userId:'admin',organizationId:'tenant-a',email:'a@example.org',role:'MARKETING_DIRECTOR',subject:'oidc'},permission!)).toBe(true);
 });
 it('quarantines a stale run with an immutable audit decision and no retry',async()=>{
  const {service,tx}=fixture();
  const result=await service.quarantineAbandoned('tenant-a','run-1','admin-1','Executor worker crashed after model call');
  expect(result).toEqual({runId:'run-1',status:'NEEDS_INTERVENTION',recovery:'MANUAL_REVIEW_ONLY',automaticRetryAllowed:false});
  expect(tx.brainRun.updateMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({organizationId:'tenant-a',status:'RUNNING'}),data:expect.objectContaining({status:'NEEDS_INTERVENTION'})}));
  expect(tx.auditEvent.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({actorId:'admin-1',action:'BRAIN_RUN_QUARANTINED',correlationId:'corr-1'})}));
 });
 it('refuses quarantine when no detailed rationale is supplied',async()=>{
  const {service,tx}=fixture();
  await expect(service.quarantineAbandoned('tenant-a','run-1','admin-1','crashed')).rejects.toBeInstanceOf(BadRequestException);
  expect(tx.brainRun.updateMany).not.toHaveBeenCalled();
 });
 it('does not quarantine a recently active run',async()=>{
  const {service,tx}=fixture({ageMinutes:2});
  await expect(service.quarantineAbandoned('tenant-a','run-1','admin-1','Investigating suspicious worker state')).rejects.toBeInstanceOf(ConflictException);
  expect(tx.brainRun.updateMany).not.toHaveBeenCalled();
 });
 it('does not quarantine terminal or intervention states',async()=>{
  const {service}=fixture({status:'REVIEW_REQUIRED'});
  await expect(service.quarantineAbandoned('tenant-a','run-1','admin-1','Investigating suspicious worker state')).rejects.toBeInstanceOf(ConflictException);
 });
 it('does not cross tenant boundaries',async()=>{
  const {service,tx}=fixture({missing:true});
  await expect(service.quarantineAbandoned('tenant-b','run-1','admin-1','Investigating suspicious worker state')).rejects.toBeInstanceOf(NotFoundException);
  expect(tx.brainRun.findFirst).toHaveBeenCalledWith({where:{id:'run-1',organizationId:'tenant-b'}});
 });
 it('does not record a quarantine if a concurrent worker updates the run',async()=>{
  const {service,tx}=fixture({changed:0});
  await expect(service.quarantineAbandoned('tenant-a','run-1','admin-1','Investigating suspicious worker state')).rejects.toBeInstanceOf(ConflictException);
  expect(tx.auditEvent.create).not.toHaveBeenCalled();
 });
});

describe('queued Brain cancellation',()=>{
 it('requires DECIDE_APPROVAL, not general workflow execution',()=>{
  expect(permissionForMarketingRoute('POST','/marketing/brain/runs/run-1/cancel')).toBe('DECIDE_APPROVAL');
  expect(hasMarketingPermission({userId:'u',organizationId:'tenant-a',email:'u@example.invalid',role:'VIEWER',subject:'oidc'},'DECIDE_APPROVAL')).toBe(false);
 });
 it('cancels only unclaimed runs and records exactly one audited reason',async()=>{
  const {service,tx}=fixture({status:'PENDING'});
  expect(await service.cancelPending('tenant-a','run-1','admin-1','Cancelled obsolete internal rehearsal')).toMatchObject({status:'CANCELLED',replayed:false,automaticRetryAllowed:false,externalEffectsAuthorized:false});
  expect(tx.brainRun.updateMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({organizationId:'tenant-a',id:'run-1',status:'PENDING',updatedAt:expect.any(Date)}),data:expect.objectContaining({status:'CANCELLED',completedAt:expect.any(Date)})}));
  expect(tx.auditEvent.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({actorId:'admin-1',action:'BRAIN_RUN_CANCELLED_BEFORE_START'})}));
 });
 it('rejects active, review-ready, malformed and foreign requests; repeated cancellation does not create an audit',async()=>{
  for(const status of ['RUNNING','REVIEW_REQUIRED','NEEDS_INTERVENTION']){
   const {service,tx}=fixture({status});
   await expect(service.cancelPending('tenant-a','run-1','admin-1','Cancelled obsolete internal rehearsal')).rejects.toBeInstanceOf(ConflictException);
   expect(tx.brainRun.updateMany).not.toHaveBeenCalled();
  }
  const foreign=fixture({missing:true});
  await expect(foreign.service.cancelPending('tenant-b','run-1','admin-1','Cancelled obsolete internal rehearsal')).rejects.toBeInstanceOf(NotFoundException);
  const invalid=fixture({status:'PENDING'});
  await expect(invalid.service.cancelPending('tenant-a','run-1','admin-1','short')).rejects.toBeInstanceOf(BadRequestException);
  const cancelled=fixture({status:'CANCELLED'});
  expect(await cancelled.service.cancelPending('tenant-a','run-1','admin-1','Repeated cancellation request')).toMatchObject({replayed:true,status:'CANCELLED'});
  expect(cancelled.tx.auditEvent.create).not.toHaveBeenCalled();
 });
 it('does not audit a failed CAS when a worker claims the queued run',async()=>{
  const {service,tx}=fixture({status:'PENDING',changed:0});
  await expect(service.cancelPending('tenant-a','run-1','admin-1','Cancelled obsolete internal rehearsal')).rejects.toBeInstanceOf(ConflictException);
  expect(tx.auditEvent.create).not.toHaveBeenCalled();
 });
});
