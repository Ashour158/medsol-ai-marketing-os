import {ConflictException} from '@nestjs/common';
import type {Prisma} from '@prisma/client';
import {specialistPlanDigest} from './specialist-mission-brain.js';

export const SPECIALIST_BUDGET_MODE='BUDGET_RESERVATION_FIXTURE_V1' as const;
// Fixed fixture capacity hold, never an invoice or authorized provider spend.
export const SPECIALIST_FIXTURE_RESERVE_MICROS=1000;
const sha=(v:unknown):v is string=>typeof v==='string'&&/^sha256:[a-f0-9]{64}$/.test(v);
export function specialistBudgetRequestId(org:string,approvalId:string,scopeDigest:string,requestDigest:string){
 if(!org||!/^specialist-run-[a-f0-9]{64}$/.test(approvalId)||!sha(scopeDigest)||!sha(requestDigest))throw new ConflictException('Exact reviewed budget rehearsal required');
 return 'specialist-fixture-'+specialistPlanDigest([SPECIALIST_BUDGET_MODE,org,approvalId,scopeDigest,requestDigest,SPECIALIST_FIXTURE_RESERVE_MICROS]).slice(7);
}
export function specialistBudgetReceipt(requestId:string,usageId:string){
 if(!/^specialist-fixture-[a-f0-9]{64}$/.test(requestId)||!usageId)throw new ConflictException('Exact model usage receipt required');
 return{schema:'medsol.specialist-budget-rehearsal.v1',mode:SPECIALIST_BUDGET_MODE,requestId,usageId,reservedMicros:SPECIALIST_FIXTURE_RESERVE_MICROS,releasedMicros:SPECIALIST_FIXTURE_RESERVE_MICROS,actualCostMicros:0,status:'RELEASED',fixtureOnly:true,invoiceVerified:false,providerRequestsMade:0,realModelInvocations:0,externalDisclosureAuthorized:false,externalEffectsAuthorized:false};
}
export async function verifySpecialistBudgetReceipt(tx:Prisma.TransactionClient,input:{organizationId:string;approvalId:string;scopeDigest:string;requestDigest:string;templateAgentId:string},raw:unknown){
 const requestId=specialistBudgetRequestId(input.organizationId,input.approvalId,input.scopeDigest,input.requestDigest);
 const row=await tx.modelUsage.findUnique({where:{organizationId_requestId:{organizationId:input.organizationId,requestId}}});
 if(!row||row.agentId!==input.templateAgentId||row.status!=='RELEASED'||row.reservedMicros!==BigInt(SPECIALIST_FIXTURE_RESERVE_MICROS)||row.actualMicros!==null||row.billingStatus!=='UNVERIFIED'||row.verifiedBilledMicros!==null||row.providerRequestId!==null||!row.completedAt)throw new ConflictException('Released offline budget usage evidence missing or invalid');
 const expected=specialistBudgetReceipt(requestId,row.id);
 if(specialistPlanDigest(raw)!==specialistPlanDigest(expected))throw new ConflictException('Historical offline budget receipt mismatch');
 return expected;
}
