import {describe,it,expect} from 'vitest';
import {parseDurableBatch,durableBatchState,readDurableBatch,durableBatchView,reconstructDurableBatch,batchCommandId,batchStageId,DURABLE_SPECIALIST_STAGE} from './specialist-durable-dispatch.js';
const ids=['a','b','c'].map(x=>'specialist-run-'+x.repeat(64)),pins=ids.map((_,i)=>'sha256:'+String(i).repeat(64)),key='fixture-durable-001';
describe('durable specialist coordination',()=>{
 it('accepts only exact bounded commands',()=>{
  expect(parseDurableBatch({action:'CREATE',requestKey:key,approvalIds:ids,fixtureOnly:true})).toMatchObject({action:'CREATE',approvalIds:ids});
  expect(parseDurableBatch({action:'INSPECT',requestKey:key,fixtureOnly:true}).action).toBe('INSPECT');
  expect(parseDurableBatch({action:'ADVANCE',requestKey:key,expectedCursor:1,fixtureOnly:true})).toMatchObject({action:'ADVANCE',expectedCursor:1});
  for(const raw of [{action:'ADVANCE',requestKey:key,expectedCursor:4,fixtureOnly:true},{action:'ADVANCE',requestKey:key,expectedCursor:0,fixtureOnly:true,autoApprove:true},{action:'CREATE',requestKey:key,approvalIds:[ids[0],ids[0]],fixtureOnly:true}])expect(()=>parseDurableBatch(raw)).toThrow();
 });
 it('binds tenant, owner, exact order and approval scope digests',()=>{
  const state=durableBatchState('tenant-a','operator',key,ids,pins);
  expect(readDurableBatch(state,'tenant-a','operator',key)).toEqual(state);
  expect(()=>readDurableBatch(state,'tenant-b','operator',key)).toThrow();
  expect(()=>readDurableBatch(state,'tenant-a','other',key)).toThrow();
  expect(()=>readDurableBatch({...state,approvalIds:[...ids].reverse()},'tenant-a','operator',key)).toThrow();
  expect(()=>readDurableBatch({...state,scopeDigests:[...pins].reverse()},'tenant-a','operator',key)).toThrow();
 });
 it('projects ordered progress and halts after the first blocked stage',()=>{
  const state=durableBatchState('tenant-a','operator',key,ids,pins);
  expect(durableBatchView(state)).toMatchObject({cursor:0,status:'REGISTERED',nextApprovalId:ids[0],externalEffectsAuthorized:false});
  state.stages.push({approvalId:ids[0]!,executionId:ids[0]+'-execution',status:'COMPLETED'});
  expect(durableBatchView(state)).toMatchObject({cursor:1,status:'IN_PROGRESS',nextApprovalId:ids[1]});
  state.stages.push({approvalId:ids[1]!,executionId:ids[1]+'-execution',status:'BLOCKED'});
  expect(durableBatchView(readDurableBatch(state,'tenant-a','operator',key))).toMatchObject({cursor:2,status:'HALTED',nextApprovalId:null,items:[{status:'COMPLETED'},{status:'BLOCKED'},{status:'NOT_REACHED'}]});
  state.stages.push({approvalId:ids[2]!,executionId:ids[2]+'-execution',status:'COMPLETED'});
  expect(()=>readDurableBatch(state,'tenant-a','operator',key)).toThrow();
 });
});

it('reconstructs an append-only prefix and refuses missing, forged or mutable root evidence',()=>{
 const root=durableBatchState('tenant-a','operator',key,ids,pins);
 const row=(index:number,status:'COMPLETED'|'BLOCKED'='COMPLETED')=>({commandId:batchStageId(key,index),commandType:DURABLE_SPECIALIST_STAGE,correlationId:batchCommandId(key),status,response:{schema:'medsol.specialist-batch-stage.v1',planDigest:root.planDigest,index,stage:{approvalId:ids[index]!,executionId:ids[index]+'-execution',status}}});
 expect(durableBatchView(reconstructDurableBatch(root,[row(1),row(0)],'tenant-a','operator',key))).toMatchObject({cursor:2,status:'IN_PROGRESS'});
 expect(root.stages).toHaveLength(0);
 for(const records of [[row(1)],[row(0),row(0)],[row(0,'BLOCKED'),row(1)],[{...row(0),status:'WRONG'}],[{...row(0),response:{...row(0).response,planDigest:'forged'}}]])expect(()=>reconstructDurableBatch(root,records,'tenant-a','operator',key)).toThrow();
 expect(()=>reconstructDurableBatch({...root,stages:[row(0).response.stage]},[],'tenant-a','operator',key)).toThrow();
});
