import {BadRequestException,ConflictException} from '@nestjs/common';
export function parseSpecialistBatch(raw:unknown){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).sort().join(',')!=='approvalIds,fixtureOnly')throw new BadRequestException('Exact approved specialist batch required');
 const v=raw as Record<string,unknown>;
 if(v.fixtureOnly!==true||!Array.isArray(v.approvalIds)||v.approvalIds.length<1||v.approvalIds.length>4||v.approvalIds.some(id=>typeof id!=='string'||!/^specialist-run-[0-9a-f]{64}$/.test(id))||new Set(v.approvalIds).size!==v.approvalIds.length)throw new BadRequestException('One to four distinct approved specialist references required');
 return{approvalIds:v.approvalIds as string[],fixtureOnly:true as const};
}
export type BatchItem={approvalId:string;status:'COMPLETED'|'BLOCKED'|'ERROR'|'NOT_DISPATCHED';executionId?:string;replayed?:boolean};
export async function dispatchSpecialistBatch(ids:readonly string[],execute:(id:string)=>Promise<{status:string;executionId:string;replayed:boolean}>){
 const items:BatchItem[]=[];
 let halted=false;
 for(const approvalId of ids){
  if(halted){items.push({approvalId,status:'NOT_DISPATCHED'});continue;}
  try{
   const result=await execute(approvalId);
   if(!['COMPLETED','BLOCKED'].includes(result.status)||result.executionId!==approvalId+'-execution'||typeof result.replayed!=='boolean')throw new ConflictException('Unexpected execution result');
   const status=result.status as 'COMPLETED'|'BLOCKED';
   items.push({approvalId,status,executionId:result.executionId,replayed:result.replayed});
   if(status==='BLOCKED')halted=true;
  }catch{
   // Earlier transactions are committed; never pretend a rollback or retry.
   // Original execution endpoint remains authoritative for diagnosis.
   items.push({approvalId,status:'ERROR'});halted=true;
  }
 }
 return{schema:'medsol.specialist-batch-dispatch.v1',items,status:halted?'HALTED':'COMPLETED',atomic:false,automaticRetry:false,independentApprovalRequired:true,externalEffectsAuthorized:false};
}
