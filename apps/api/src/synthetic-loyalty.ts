import {BadRequestException,ConflictException,NotFoundException} from '@nestjs/common';
import {type Approval,type Prisma} from '@prisma/client';
import {createHash} from 'node:crypto';
export const LOYALTY='SyntheticLoyaltyEntry';
const canon=(v:unknown):string=>v===null||typeof v!=='object'?JSON.stringify(v)??'null':Array.isArray(v)?'['+v.map(canon).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canon((v as Record<string,unknown>)[k])).join(',')+'}';
const hash=(v:unknown)=>'sha256:'+createHash('sha256').update(canon(v)).digest('hex');
const id=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
export function normalizeLoyalty(raw:unknown){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new BadRequestException('Exact synthetic reward entry required');
 const x=raw as Record<string,unknown>;
 if(Object.keys(x).sort().join(',')!=='brandId,campaignId,contactId,expiresAt,fixtureOnly,kind,points,sourceEventKey'||
 !id(x.brandId)||!id(x.campaignId)||!id(x.contactId)||!id(x.sourceEventKey)||!/^fixture-[A-Za-z0-9_-]{8,100}$/.test(x.sourceEventKey)||
 !['EARN','REDEEM'].includes(String(x.kind))||typeof x.points!=='number'||!Number.isSafeInteger(x.points)||x.points<1||x.points>100000||
 typeof x.expiresAt!=='string'||!Number.isFinite(Date.parse(x.expiresAt))||new Date(x.expiresAt).toISOString()!==x.expiresAt||x.fixtureOnly!==true)
 throw new BadRequestException('Bounded fictional points and exact fixture event required');
 return{brandId:x.brandId,campaignId:x.campaignId,contactId:x.contactId,sourceEventKey:x.sourceEventKey,kind:x.kind as 'EARN'|'REDEEM',points:x.points,expiresAt:x.expiresAt,fixtureOnly:true as const};
}
type Input=ReturnType<typeof normalizeLoyalty>;
export const loyaltyId=(org:string,event:string)=>'loyalty-'+hash([org,event]).slice(7);
function scopeFor(org:string,actor:string,input:Input,campaignVersion:number,campaignApprovalId:string){
 return{schema:'medsol.synthetic-loyalty.v1',organizationId:org,requestedBy:actor,input,campaignVersion,campaignApprovalId,
 signedPoints:input.kind==='EARN'?input.points:-input.points,syntheticOnly:true as const,realPointsIssued:0,financialLiabilityCreated:false as const,externalEffectsAuthorized:false as const};
}
type Scope=ReturnType<typeof scopeFor>;
export function readLoyalty(a:Approval):Scope{
 try{const s=a.scope as unknown as Scope,i=normalizeLoyalty(s.input);
 if(a.objectType!==LOYALTY||a.id!==loyaltyId(a.organizationId,i.sourceEventKey)||a.objectId!==i.contactId||!a.requestedBy||a.requestedBy!==s.requestedBy||
 a.requiredAuthority!=='HUMAN_MARKETING_AUTHORITY'||a.scopeExpiresAt?.toISOString()!==i.expiresAt||!Number.isSafeInteger(s.campaignVersion)||!id(s.campaignApprovalId)||
 hash(s)!==a.scopeDigest||hash(scopeFor(a.organizationId,a.requestedBy,i,s.campaignVersion,s.campaignApprovalId))!==a.scopeDigest)throw Error('scope');
 return scopeFor(a.organizationId,a.requestedBy,i,s.campaignVersion,s.campaignApprovalId);
 }catch{throw new ConflictException('Invalid exact synthetic loyalty scope');}
}
export async function buildLoyalty(tx:Prisma.TransactionClient,org:string,actor:string,i:Input,now:Date){
 const expiry=Date.parse(i.expiresAt);
 if(expiry<=now.getTime()||expiry>now.getTime()+30*86400000)throw new BadRequestException('Reward request expires within 30 days');
 const contact=await tx.marketingSyntheticContact.findFirst({where:{organizationId:org,id:i.contactId,brandId:i.brandId}});
 const brand=await tx.brand.findFirst({where:{organizationId:org,id:i.brandId,status:'ACTIVE'}});
 const campaign=await tx.campaign.findFirst({where:{organizationId:org,id:i.campaignId,brandId:i.brandId,status:'APPROVED'},select:{id:true,version:true}});
 const approval=campaign&&await tx.approval.findFirst({where:{organizationId:org,objectType:'Campaign',objectId:campaign.id,decision:'APPROVED',decidedBy:{not:null}},orderBy:[{decidedAt:'desc'},{id:'asc'}]});
 if(!contact||!brand||!campaign||!approval?.decidedBy||approval.decidedBy===approval.requestedBy)throw new NotFoundException('Current approved tenant campaign and same-brand synthetic contact required');
 const scope=scopeFor(org,actor,i,campaign.version,approval.id);return{scope,scopeDigest:hash(scope)};
}
export async function loyaltyBalance(tx:Prisma.TransactionClient,org:string,contactId:string){
 const rows=await tx.approval.findMany({where:{organizationId:org,objectType:LOYALTY,objectId:contactId,decision:'APPROVED'},orderBy:[{decidedAt:'asc'},{id:'asc'}],take:1001});
 if(rows.length>1000)throw new ConflictException('Synthetic ledger capacity reached; no truncated balance allowed');
 let balance=0;
 const entries=rows.map(a=>{const scope=readLoyalty(a);
 if(!a.decidedAt||!a.decidedBy||a.decidedBy===a.requestedBy)throw new ConflictException('Invalid independent loyalty entry');
 balance+=scope.signedPoints;
 return{approvalId:a.id,kind:scope.input.kind,points:scope.input.points,sourceEventKey:scope.input.sourceEventKey,decidedAt:a.decidedAt.toISOString()};
 });
 if(balance<0||balance>10000000)throw new ConflictException('Invalid synthetic ledger balance');
 return{balance,entries};
}
export async function validateLoyaltyApproval(tx:Prisma.TransactionClient,a:Approval,now:Date){
 const s=readLoyalty(a);
 // Shared canonical contact lock serializes every reward decision for this account.
 await tx.$queryRaw`SELECT "id" FROM "MarketingSyntheticContact" WHERE "organizationId"=${a.organizationId} AND "id"=${a.objectId} FOR UPDATE`;
 const current=await buildLoyalty(tx,a.organizationId,s.requestedBy,s.input,now);
 if(current.scopeDigest!==a.scopeDigest)throw new ConflictException('Reward campaign scope changed');
 const ledger=await loyaltyBalance(tx,a.organizationId,a.objectId);
 if(ledger.entries.length>=1000||ledger.balance+s.signedPoints<0||ledger.balance+s.signedPoints>10000000)
 throw new ConflictException('Insufficient fictional points or ledger limit reached');
 return s;
}
