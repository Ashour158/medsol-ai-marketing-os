import {BadRequestException,ConflictException} from '@nestjs/common';
import {parseSpecialistBatch} from './specialist-batch-dispatch.js';
import {specialistPlanDigest} from './specialist-mission-brain.js';
export const DURABLE_SPECIALIST_BATCH='SPECIALIST_BATCH_COORDINATION';
export function parseDurableBatch(raw:unknown){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new BadRequestException('Exact durable batch command required');
 const v=raw as Record<string,unknown>,keys=Object.keys(v).sort().join(',');
 if(v.fixtureOnly!==true||typeof v.requestKey!=='string'||!/^fixture-[A-Za-z0-9_-]{8,100}$/.test(v.requestKey))throw new BadRequestException('Immutable fixture batch key required');
 if(v.action==='CREATE'&&keys==='action,approvalIds,fixtureOnly,requestKey')return{action:'CREATE' as const,requestKey:v.requestKey,...parseSpecialistBatch({approvalIds:v.approvalIds,fixtureOnly:true})};
 if(v.action==='CANCEL_SCHEDULE'&&keys==='action,fixtureOnly,requestKey')return{action:'CANCEL_SCHEDULE' as const,requestKey:v.requestKey};
 if(v.action==='SCHEDULE'&&keys==='action,expectedCursor,fixtureOnly,requestKey'&&typeof v.expectedCursor==='number'&&Number.isInteger(v.expectedCursor)&&v.expectedCursor>=0&&v.expectedCursor<4)return{action:'SCHEDULE' as const,requestKey:v.requestKey,expectedCursor:v.expectedCursor};
 if(v.action==='INSPECT'&&keys==='action,fixtureOnly,requestKey')return{action:'INSPECT' as const,requestKey:v.requestKey};
 if(v.action==='ADVANCE'&&keys==='action,expectedCursor,fixtureOnly,requestKey'&&typeof v.expectedCursor==='number'&&Number.isInteger(v.expectedCursor)&&v.expectedCursor>=0&&v.expectedCursor<4)return{action:'ADVANCE' as const,requestKey:v.requestKey,expectedCursor:v.expectedCursor};
 throw new BadRequestException('Exact CREATE, INSPECT or ADVANCE command required');
}
export function batchCommandId(key:string){return DURABLE_SPECIALIST_BATCH+':'+key;}
export function batchPlanDigest(org:string,actor:string,key:string,ids:readonly string[],pins:readonly string[]){return specialistPlanDigest([DURABLE_SPECIALIST_BATCH,org,actor,key,ids,pins]);}
export type BatchStage={approvalId:string;executionId:string;status:'COMPLETED'|'BLOCKED'};
export type DurableBatchState={schema:'medsol.specialist-durable-batch.v1';requestKey:string;owner:string;approvalIds:string[];scopeDigests:string[];planDigest:string;stages:BatchStage[]};
export function durableBatchState(org:string,actor:string,key:string,ids:string[],pins:string[]):DurableBatchState{
 return{schema:'medsol.specialist-durable-batch.v1',requestKey:key,owner:actor,approvalIds:ids,scopeDigests:pins,planDigest:batchPlanDigest(org,actor,key,ids,pins),stages:[]};
}
export function readDurableBatch(raw:unknown,org:string,actor:string,key:string):DurableBatchState{
 const s=raw as DurableBatchState;
 if(!s||s.schema!=='medsol.specialist-durable-batch.v1'||s.owner!==actor||s.requestKey!==key)throw new ConflictException('Durable specialist batch not available to this operator');
 const ids=parseSpecialistBatch({approvalIds:s.approvalIds,fixtureOnly:true}).approvalIds;
 if(!Array.isArray(s.scopeDigests)||s.scopeDigests.length!==ids.length||s.scopeDigests.some(x=>typeof x!=='string'||!/^sha256:[a-f0-9]{64}$/.test(x))||s.planDigest!==batchPlanDigest(org,actor,key,ids,s.scopeDigests)||!Array.isArray(s.stages)||s.stages.length>ids.length||s.stages.some((stage,i)=>!stage||stage.approvalId!==ids[i]||stage.executionId!==ids[i]+'-execution'||!['COMPLETED','BLOCKED'].includes(stage.status)||(stage.status==='BLOCKED'&&i!==s.stages.length-1)))throw new ConflictException('Invalid durable batch receipt');
 return s;
}
export function durableBatchView(s:DurableBatchState){
 const cursor=s.stages.length,halted=s.stages.some(x=>x.status==='BLOCKED');
 const status=halted?'HALTED':cursor===s.approvalIds.length?'COMPLETED':cursor?'IN_PROGRESS':'REGISTERED';
 return{schema:s.schema,requestKey:s.requestKey,planDigest:s.planDigest,cursor,status,nextApprovalId:status==='REGISTERED'||status==='IN_PROGRESS'?s.approvalIds[cursor]:null,items:s.approvalIds.map((approvalId,i)=>s.stages[i]??{approvalId,status:'NOT_REACHED'}),fixtureOnly:true,automaticRetry:false,autonomousExecutionAuthorized:false,externalEffectsAuthorized:false};
}
