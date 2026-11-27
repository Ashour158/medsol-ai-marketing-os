import {BadRequestException,ConflictException,ForbiddenException} from '@nestjs/common';
import type {Approval,Prisma} from '@prisma/client';
import {createHash} from 'node:crypto';
import {assertActorPermissionInTenantTransaction} from './tenant-role-policy.service.js';
export const OFFLINE_SUBSCRIPTION='OfflineSubscriptionRevision';
const PLANS={
 INTERNAL_BASIC:['RESEARCH_READ','CREATIVE_DRAFT'],
 INTERNAL_TEAM:['RESEARCH_READ','CREATIVE_DRAFT','CAMPAIGN_WRITE','PRICE_PROPOSAL']
} as const;
type Plan=keyof typeof PLANS;
type Action='START'|'CHANGE'|'RENEW'|'SUSPEND'|'RESUME'|'CANCEL';
type State='NONE'|'ACTIVE'|'SUSPENDED'|'CANCELLED';
const hash=(v:unknown)=>'sha256:'+createHash('sha256').update(JSON.stringify(v)).digest('hex');
export function subscriptionInput(raw:unknown){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new BadRequestException('Exact offline subscription request required');
 const v=raw as Record<string,unknown>;
 if(Object.keys(v).sort().join(',')!=='action,expectedRevision,fixtureOnly,plan,requestKey,termEndsAt'||
  v.fixtureOnly!==true||typeof v.requestKey!=='string'||!/^fixture-[A-Za-z0-9_-]{8,100}$/.test(v.requestKey)||
  typeof v.expectedRevision!=='number'||!Number.isSafeInteger(v.expectedRevision)||v.expectedRevision<0||v.expectedRevision>=100||
  typeof v.action!=='string'||!['START','CHANGE','RENEW','SUSPEND','RESUME','CANCEL'].includes(v.action)||
  typeof v.plan!=='string'||!Object.hasOwn(PLANS,v.plan)||
  typeof v.termEndsAt!=='string'||!Number.isFinite(Date.parse(v.termEndsAt))||new Date(v.termEndsAt).toISOString()!==v.termEndsAt)
  throw new BadRequestException('Invalid bounded offline subscription fields');
 return{requestKey:v.requestKey,expectedRevision:v.expectedRevision,action:v.action as Action,
  plan:v.plan as Plan,termEndsAt:v.termEndsAt,fixtureOnly:true as const};
}
type Input=ReturnType<typeof subscriptionInput>;
type Revision={revision:number;state:State;plan:Plan|null;termEndsAt:string|null;approvalId:string|null};
const initial:Revision={revision:0,state:'NONE',plan:null,termEndsAt:null,approvalId:null};
export const subscriptionId=(org:string,key:string)=>'subscription-'+hash([org,key]).slice(7);
export function nextSubscription(current:Revision,input:Input,now:Date):Revision{
 const fail=()=>{throw new ConflictException('Invalid or stale subscription transition');};
 if(input.expectedRevision!==current.revision)return fail();
 const end=Date.parse(input.termEndsAt),oldEnd=current.termEndsAt?Date.parse(current.termEndsAt):0;
 const validTerm=end>now.getTime()&&end<=now.getTime()+366*86400000;
 const same=input.plan===current.plan&&input.termEndsAt===current.termEndsAt;
 let state:State='ACTIVE';
 switch(input.action){
  case 'START':if(current.state!=='NONE'||!validTerm)return fail();break;
  case 'CHANGE':if(current.state!=='ACTIVE'||oldEnd<=now.getTime()||input.plan===current.plan||input.termEndsAt!==current.termEndsAt)return fail();break;
  case 'RENEW':if(current.state!=='ACTIVE'||input.plan!==current.plan||end<=oldEnd||!validTerm)return fail();break;
  case 'SUSPEND':if(current.state!=='ACTIVE'||!same)return fail();state='SUSPENDED';break;
  case 'RESUME':if(current.state!=='SUSPENDED'||!same||oldEnd<=now.getTime())return fail();break;
  case 'CANCEL':if(!['ACTIVE','SUSPENDED'].includes(current.state)||!same)return fail();state='CANCELLED';break;
 }
 return{revision:current.revision+1,state,plan:input.plan,termEndsAt:input.termEndsAt,approvalId:null};
}
export function subscriptionScope(org:string,actor:string,input:Input,current:Revision,now:Date){
 const next=nextSubscription(current,input,now);
 return{schema:'medsol.offline-subscription.v1',organizationId:org,requestedBy:actor,input,
  priorApprovalId:current.approvalId,revision:next.revision,state:next.state,plan:next.plan,termEndsAt:next.termEndsAt,
  fixtureOnly:true as const,billingAuthorized:false as const,realEntitlementsGranted:false as const,externalEffectsAuthorized:false as const};
}
type Scope=ReturnType<typeof subscriptionScope>;
// JSONB does not preserve object insertion order: digest a fixed ordered tuple.
export function subscriptionDigest(s:Scope){
 const i=s.input;
 return hash([s.schema,s.organizationId,s.requestedBy,i.requestKey,i.expectedRevision,i.action,i.plan,i.termEndsAt,i.fixtureOnly,
  s.priorApprovalId,s.revision,s.state,s.plan,s.termEndsAt,s.fixtureOnly,s.billingAuthorized,s.realEntitlementsGranted,s.externalEffectsAuthorized]);
}
export function readSubscription(a:Approval):Scope{
 try{
  const s=a.scope as unknown as Scope,i=subscriptionInput(s.input);
  if(a.objectType!==OFFLINE_SUBSCRIPTION||a.objectId!==a.organizationId||a.id!==subscriptionId(a.organizationId,i.requestKey)||
   a.requestedBy!==s.requestedBy||!a.requestedBy||s.organizationId!==a.organizationId||s.schema!=='medsol.offline-subscription.v1'||
   a.requiredAuthority!=='HUMAN_MARKETING_AUTHORITY'||!a.scopeExpiresAt||
   s.revision!==i.expectedRevision+1||s.plan!==i.plan||s.termEndsAt!==i.termEndsAt||
   s.state!==({SUSPEND:'SUSPENDED',CANCEL:'CANCELLED'} as Record<string,string>)[i.action]&&
    s.state!=='ACTIVE'||
   (i.action==='SUSPEND'&&s.state!=='SUSPENDED')||(i.action==='CANCEL'&&s.state!=='CANCELLED')||
   s.fixtureOnly!==true||s.billingAuthorized!==false||s.realEntitlementsGranted!==false||s.externalEffectsAuthorized!==false||
   subscriptionDigest({...s,input:i})!==a.scopeDigest)throw Error('scope');
  return{...s,input:i};
 }catch{throw new ConflictException('Invalid exact offline subscription evidence');}
}
export async function lockSubscription(tx:Prisma.TransactionClient,org:string){
 await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'offline-subscription:'+org})::bigint)::text AS lock_result`;
}
export async function currentSubscription(tx:Prisma.TransactionClient,org:string):Promise<Revision>{
 const rows=await tx.approval.findMany({where:{organizationId:org,objectType:OFFLINE_SUBSCRIPTION,decision:'APPROVED'},take:101});
 if(rows.length>100)throw new ConflictException('Offline subscription ledger exceeds rehearsal limit');
 const revisions=rows.map(a=>({a,s:readSubscription(a)})).sort((x,y)=>x.s.revision-y.s.revision);
 let current=initial;
 for(const {a,s} of revisions){
  if(!a.decidedBy||a.decidedBy===a.requestedBy||!a.decidedAt||s.priorApprovalId!==current.approvalId||
   s.input.expectedRevision!==current.revision||a.decidedAt>=a.scopeExpiresAt!)throw new ConflictException('Invalid subscription revision chain');
  const next=nextSubscription(current,s.input,a.decidedAt);
  if(next.state!==s.state||next.revision!==s.revision)throw new ConflictException('Invalid subscription transition evidence');
  current={...next,approvalId:a.id};
 }
 return current;
}
export function subscriptionProjection(current:Revision,now:Date){
 const expired=current.termEndsAt!==null&&Date.parse(current.termEndsAt)<=now.getTime();
 return{...current,effectiveState:current.state==='ACTIVE'&&expired?'EXPIRED':current.state,
  simulatedEntitledActions:current.state==='ACTIVE'&&!expired&&current.plan?[...PLANS[current.plan]]:[],
  fixtureOnly:true,billingAuthorized:false,realEntitlementsGranted:false,externalEffectsAuthorized:false,productionCertified:false};
}
export async function validateSubscriptionDecision(tx:Prisma.TransactionClient,a:Approval,reviewer:string,now:Date){
 const s=readSubscription(a);
 if(reviewer===s.requestedBy)throw new ForbiddenException('Independent subscription reviewer required');
 await lockSubscription(tx,a.organizationId);
 if(a.scopeExpiresAt!<=now)throw new ConflictException('Offline subscription review expired');
 const requester=await tx.user.findFirst({where:{organizationId:a.organizationId,id:s.requestedBy,disabledAt:null},select:{id:true,role:true,email:true,oidcSubject:true}});
 if(!requester?.oidcSubject)throw new ConflictException('Subscription requester unavailable');
 await assertActorPermissionInTenantTransaction(tx,{organizationId:a.organizationId,userId:requester.id,role:requester.role,email:requester.email,subject:requester.oidcSubject},'MANAGE_TENANT');
 const current=await currentSubscription(tx,a.organizationId);
 const expected=subscriptionScope(a.organizationId,s.requestedBy,s.input,current,now);
 if(subscriptionDigest(expected)!==a.scopeDigest)throw new ConflictException('Stale subscription review');
}
