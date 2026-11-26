import {BadRequestException,ConflictException,NotFoundException} from '@nestjs/common';
import {type Approval,type Prisma} from '@prisma/client';
import {createHash} from 'node:crypto';
export const SYNTHETIC_PRICING='SyntheticPricePromotionProposal';
function canonical(value:unknown):string{
 if(value===null||typeof value!=='object')return JSON.stringify(value)??'null';
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 const r=value as Record<string,unknown>;
 return '{'+Object.keys(r).sort().map(k=>JSON.stringify(k)+':'+canonical(r[k])).join(',')+'}';
}
const digest=(x:unknown)=>'sha256:'+createHash('sha256').update(canonical(x)).digest('hex');
const keys=['proposalKey','productId','kind','currency','basePriceMicros','proposedPriceMicros','assumedUnitCostMicros','quantity','expiresAt','scenarioOnly'] as const;
const id=(v:unknown)=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
const money=(v:unknown):v is string=>typeof v==='string'&&/^(0|[1-9][0-9]{0,11})$/.test(v);
export function normalizePriceProposal(raw:unknown){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).length!==keys.length||Object.keys(raw).some(k=>!keys.includes(k as typeof keys[number])))
  throw new BadRequestException('Exact bounded synthetic pricing fields required');
 const r=raw as Record<string,unknown>;
 if(typeof r.proposalKey!=='string'||!/^fixture-[A-Za-z0-9_-]{8,100}$/.test(r.proposalKey)||!id(r.productId)||
  (r.kind!=='PRICE_CHANGE'&&r.kind!=='PROMOTION')||typeof r.currency!=='string'||!/^[A-Z]{3}$/.test(r.currency)||
  !money(r.basePriceMicros)||!money(r.proposedPriceMicros)||!money(r.assumedUnitCostMicros)||
  typeof r.quantity!=='number'||!Number.isSafeInteger(r.quantity)||r.quantity<1||r.quantity>100000||
  typeof r.expiresAt!=='string'||!Number.isFinite(Date.parse(r.expiresAt))||new Date(r.expiresAt).toISOString()!==r.expiresAt||r.scenarioOnly!==true)
  throw new BadRequestException('Explicit synthetic price assumptions and bounded quantity/currency required');
 const b=BigInt(r.basePriceMicros),p=BigInt(r.proposedPriceMicros),cost=BigInt(r.assumedUnitCostMicros);
 if(b===0n||p===0n||p===b||(r.kind==='PROMOTION'&&p>b)||p<cost)
  throw new BadRequestException('Price must change; promotion must reduce price; proposed price cannot be below assumed unit cost');
 return{proposalKey:r.proposalKey,productId:r.productId as string,kind:r.kind,currency:r.currency,
  basePriceMicros:r.basePriceMicros,proposedPriceMicros:r.proposedPriceMicros,assumedUnitCostMicros:r.assumedUnitCostMicros,
  quantity:r.quantity,expiresAt:r.expiresAt,scenarioOnly:true as const};
}
type Input=ReturnType<typeof normalizePriceProposal>;
export function priceProposalArithmetic(i:Input){
 const b=BigInt(i.basePriceMicros),p=BigInt(i.proposedPriceMicros),c=BigInt(i.assumedUnitCostMicros),q=BigInt(i.quantity);
 return{baseScenarioRevenueMicros:(b*q).toString(),proposedScenarioRevenueMicros:(p*q).toString(),
  proposedScenarioGrossProfitMicros:((p-c)*q).toString(),scenarioGrossProfitDeltaMicros:((p-b)*q).toString(),
  priceChangeBasisPoints:((p-b)*10000n/b).toString(),proposedGrossMarginBasisPoints:((p-c)*10000n/p).toString()};
}
export const priceProposalId=(org:string,key:string)=>'price-'+createHash('sha256').update(JSON.stringify([org,key])).digest('hex');
function scopeFor(org:string,requestedBy:string,input:Input,productUpdatedAt:string,productDigest:string){
 return{policy:'SYNTHETIC_PRICE_PROMOTION_V1' as const,organizationId:org,requestedBy,input,productUpdatedAt,productDigest,
  arithmetic:priceProposalArithmetic(input),scenarioOnly:true as const,financeApprovalVerified:false as const,
  catalogMutationAuthorized:false as const,externalEffectsAuthorized:false as const};
}
export async function buildPriceProposal(tx:Prisma.TransactionClient,org:string,actor:string,input:Input,now:Date){
 const expiry=new Date(input.expiresAt);
 if(expiry<=now||expiry.getTime()>now.getTime()+90*86400000)throw new BadRequestException('Proposal expiry must be within 90 days');
 const p=await tx.marketingProduct.findFirst({where:{organizationId:org,id:input.productId,lifecycle:'ACTIVE'},select:{updatedAt:true,code:true,name:true,vendor:true,lifecycle:true,marketingProfile:true}});
 if(!p)throw new NotFoundException('Active tenant product not found');
 const scope=scopeFor(org,actor,input,p.updatedAt.toISOString(),digest({...p,updatedAt:p.updatedAt.toISOString()}));return{scope,scopeDigest:digest(scope)};
}
type Scope=ReturnType<typeof scopeFor>;
export function readPriceProposal(a:Approval):Scope{
 try{
  const r=a.scope as unknown as Scope;
  const input=normalizePriceProposal(r.input),actor=a.requestedBy;
  if(!actor||a.objectType!==SYNTHETIC_PRICING||a.id!==priceProposalId(a.organizationId,input.proposalKey)||a.objectId!==input.productId||
   a.requiredAuthority!=='HUMAN_MARKETING_AUTHORITY'||a.scopeExpiresAt?.toISOString()!==input.expiresAt||
   !r.productUpdatedAt||new Date(r.productUpdatedAt).toISOString()!==r.productUpdatedAt||!/^sha256:[a-f0-9]{64}$/.test(r.productDigest))throw Error('scope');
  const expected=scopeFor(a.organizationId,actor,input,r.productUpdatedAt,r.productDigest);
  if(digest(expected)!==a.scopeDigest||digest(r)!==a.scopeDigest)throw Error('digest');
  return expected;
 }catch{throw new ConflictException('Exact synthetic pricing scope invalid');}
}
export async function validatePriceProposalApproval(tx:Prisma.TransactionClient,a:Approval,now:Date){
 const s=readPriceProposal(a);
 if(!a.scopeExpiresAt||a.scopeExpiresAt<=now)throw new ConflictException('Synthetic price proposal expired');
 // Lock the canonical product before the exact-scope check and decision.
 await tx.$queryRaw`SELECT "id" FROM "MarketingProduct" WHERE "organizationId"=${a.organizationId} AND "id"=${s.input.productId} FOR UPDATE`;
 const current=await buildPriceProposal(tx,a.organizationId,s.requestedBy,s.input,now);
 if(current.scopeDigest!==a.scopeDigest)throw new ConflictException('Product changed since synthetic proposal');
 return s;
}
