import {describe,expect,it,vi} from 'vitest';
import {BadRequestException} from '@nestjs/common';
import {MarketingCommandCenterService} from './marketing-command-center.service.js';
import {hasMarketingPermission,permissionForMarketingRoute} from './marketing-permissions.js';

function fixture(){
 const old=new Date(Date.now()-30*60_000);
 const brainRows=[
  {id:'run-a',updatedAt:old,currentAgentId:'agent-a',lastError:'Model outcome uncertain'},
  {id:'run-b',updatedAt:old,currentAgentId:'agent-b',lastError:null},
  {id:'run-c',updatedAt:old,currentAgentId:'agent-c',lastError:null}
 ];
 const deadRows=[
  {id:'evt-a',deadLetteredAt:old,lastError:'Broker unavailable',eventType:'BRAIN_AGENT_STEP_COMPLETED',attempts:8},
  {id:'evt-b',deadLetteredAt:old,lastError:null,eventType:'BRAIN_RUN_REVIEW_REQUIRED',attempts:8}
 ];
 const db:any={
  brainRun:{
   count:vi.fn().mockImplementation(async ({where}:any)=>where.organizationId==='tenant-a'?brainRows.length:0),
   findFirst:vi.fn().mockImplementation(async ({where}:any)=>where.organizationId==='tenant-a'?brainRows.find(r=>r.id===where.id)??null:null),
   findMany:vi.fn().mockImplementation(async (args:any)=>{
    if(args.where.organizationId!=='tenant-a')return [];
    const index=args.cursor?brainRows.findIndex(x=>x.id===args.cursor.id)+1:0;
    return brainRows.slice(index,index+args.take);
   })
  },
  outboxEvent:{
   count:vi.fn().mockImplementation(async ({where}:any)=>where.organizationId==='tenant-a'?deadRows.length:0),
   findFirst:vi.fn().mockImplementation(async ({where}:any)=>where.organizationId==='tenant-a'?deadRows.find(r=>r.id===where.id)??null:null),
   findMany:vi.fn().mockImplementation(async (args:any)=>{
    if(args.where.organizationId!=='tenant-a')return [];
    const index=args.cursor?deadRows.findIndex(x=>x.id===args.cursor.id)+1:0;
    return deadRows.slice(index,index+args.take);
   })
  }
 };
 const service=new MarketingCommandCenterService(db,{} as any,{} as any,{} as any,{} as any,{} as any);
 return{db,service};
}
describe('single-owner paginated incident inventory',()=>{
 it('enforces audited manager identity for every enumerated kind',()=>{
  for(const kind of ['BRAIN_STALE','BRAIN_NEEDS_INTERVENTION','OUTBOX_DEAD_LETTER']){
   const permission=permissionForMarketingRoute('GET','/marketing/command-center/incidents/'+kind);
   expect(permission).toBe('READ_AUDIT');
   expect(hasMarketingPermission({role:'VIEWER'} as any,permission!)).toBe(false);
   expect(hasMarketingPermission({role:'CMO'} as any,permission!)).toBe(true);
  }
  expect(()=>permissionForMarketingRoute('GET','/marketing/command-center/incidents/ANYTHING')).toThrow();
 });
 it('returns stable brain pages and preserves the tenant predicate',async()=>{
  const {service,db}=fixture();
  const first=await service.incidentInventory('tenant-a','BRAIN_NEEDS_INTERVENTION',undefined,2);
  expect(first).toMatchObject({total:3,kind:'BRAIN_NEEDS_INTERVENTION',nextCursor:'run-b'});
  expect(first.incidents).toHaveLength(2);
  const second=await service.incidentInventory('tenant-a','BRAIN_NEEDS_INTERVENTION',first.nextCursor,2);
  expect(second.incidents.map(x=>x.runId)).toEqual(['run-c']);
  expect(second.nextCursor).toBeNull();
  expect(db.brainRun.findMany).toHaveBeenCalledWith(expect.objectContaining({
   where:{organizationId:'tenant-a',status:'NEEDS_INTERVENTION'},
   orderBy:[{updatedAt:'asc'},{id:'asc'}],take:3
  }));
 });
 it('shows dead letters and denies cursors from another tenant or filter',async()=>{
  const {service,db}=fixture();
  const first=await service.incidentInventory('tenant-a','OUTBOX_DEAD_LETTER',undefined,1);
  expect(first).toMatchObject({total:2,nextCursor:'evt-a'});
  expect(first.incidents[0]).toMatchObject({id:'delivery-dead:evt-a',attempts:8});
  const next=await service.incidentInventory('tenant-a','OUTBOX_DEAD_LETTER','evt-a',1);
  expect(next.incidents[0]?.id).toBe('delivery-dead:evt-b');
  await expect(service.incidentInventory('tenant-b','OUTBOX_DEAD_LETTER','evt-a')).rejects.toBeInstanceOf(BadRequestException);
  expect(db.outboxEvent.findFirst).toHaveBeenCalledWith({where:{organizationId:'tenant-b',deadLetteredAt:{not:null},id:'evt-a'},select:{id:true}});
 });
 it('rejects malformed kinds, cursors and pagination limits before querying',async()=>{
  const {service,db}=fixture();
  await expect(service.incidentInventory('tenant-a','UNSUPPORTED')).rejects.toBeInstanceOf(BadRequestException);
  await expect(service.incidentInventory('tenant-a','BRAIN_STALE','bad/cursor')).rejects.toBeInstanceOf(BadRequestException);
  await expect(service.incidentInventory('tenant-a','BRAIN_STALE',undefined,101)).rejects.toBeInstanceOf(BadRequestException);
  await expect(service.incidentInventory('tenant-a','BRAIN_STALE',undefined,0)).rejects.toBeInstanceOf(BadRequestException);
  await expect(service.incidentInventory('tenant-a','BRAIN_STALE',undefined,1.5)).rejects.toBeInstanceOf(BadRequestException);
  expect(db.brainRun.findMany).not.toHaveBeenCalled();
 });
 it('only queries current tenant for stale incidents',async()=>{
  const {service,db}=fixture();
  const result=await service.incidentInventory('tenant-a','BRAIN_STALE');
  expect(result.incidents.every(x=>x.severity==='WARNING')).toBe(true);
  const clause=db.brainRun.findMany.mock.calls[0][0].where;
  expect(clause).toMatchObject({organizationId:'tenant-a',status:'RUNNING'});
  expect(clause.updatedAt.lte).toBeInstanceOf(Date);
 });
});
