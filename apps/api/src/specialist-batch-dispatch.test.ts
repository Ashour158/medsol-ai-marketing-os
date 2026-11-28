import {describe,it,expect,vi} from 'vitest';
import {parseSpecialistBatch,dispatchSpecialistBatch} from './specialist-batch-dispatch.js';
const ids=['a','b','c'].map(x=>'specialist-run-'+x.repeat(64));
describe('specialist batch dispatch',()=>{
 it('requires exact unique bounded approved identifiers',()=>{
  expect(parseSpecialistBatch({approvalIds:ids,fixtureOnly:true}).approvalIds).toEqual(ids);
  for(const raw of [{approvalIds:[],fixtureOnly:true},{approvalIds:[ids[0],ids[0]],fixtureOnly:true},{approvalIds:['foreign'],fixtureOnly:true},{approvalIds:ids,fixtureOnly:false},{approvalIds:ids,fixtureOnly:true,autoApprove:true},{approvalIds:['a','b','c','d','e'].map(x=>'specialist-run-'+x.repeat(64)),fixtureOnly:true}])expect(()=>parseSpecialistBatch(raw)).toThrow();
 });
 it('runs in order, preserves prior receipts and stops on a block',async()=>{
  const execute=vi.fn(async(id:string)=>({status:id===ids[1]?'BLOCKED':'COMPLETED',executionId:id+'-execution',replayed:id===ids[0]}));
  const result=await dispatchSpecialistBatch(ids,execute);
  expect(execute.mock.calls).toEqual([[ids[0]],[ids[1]]]);
  expect(result).toMatchObject({status:'HALTED',atomic:false,automaticRetry:false,externalEffectsAuthorized:false,items:[{status:'COMPLETED',replayed:true},{status:'BLOCKED',replayed:false},{status:'NOT_DISPATCHED'}]});
 });
 it('halts on errors and malformed receipts without retries or leaked errors',async()=>{
  for(const execute of [vi.fn(async()=>{throw Error('secret fixture');}),vi.fn(async()=>({status:'COMPLETED',executionId:'wrong',replayed:false}))]){
   const result=await dispatchSpecialistBatch(ids,execute);
   expect(result.items.map(x=>x.status)).toEqual(['ERROR','NOT_DISPATCHED','NOT_DISPATCHED']);
   expect(execute).toHaveBeenCalledTimes(1);
   expect(JSON.stringify(result)).not.toContain('secret fixture');
  }
 });
});
