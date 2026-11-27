import {BadRequestException,ConflictException,ForbiddenException,Injectable}
 from '@nestjs/common';
import {Prisma} from '@prisma/client';
import {createHash} from 'node:crypto';
import {PrismaService} from './prisma.service.js';
import {hasMarketingPermission} from './marketing-permissions.js';
import type {VerifiedIdentity} from './oidc-identity.js';
import {TRIAL_PROVIDERS,TRIAL_SCENARIOS,assertTrialProvider,
 assertTrialScenario} from './provider-trial-wire.js';
import {runProviderContractTrial,trialRefFor,
 type ProviderTrialResult} from './provider-contract-trial.js';

/** Read-only protocol rehearsal; reuses existing OIDC, CommandReceipt and AuditEvent.
 * No provider SDK/real HTTP, no token persistence, no customer destination and
 * no new business state machine. Always runs in-process with synthetic fixtures.
 */
@Injectable()
export class ProviderContractTrialService{
 constructor(private readonly db:PrismaService){}
 private scoped<T>(org:string,fn:(tx:Prisma.TransactionClient)=>Promise<T>){
  if(!/^[A-Za-z0-9_-]{3,160}$/.test(org))
   throw new BadRequestException('Valid tenant required');
  // A serializable abort may safely replay this in-process, no-network
  // rehearsal. NEVER reuse this helper for a real OAuth exchange or send.
  return (async()=>{
   for(let attempt=0;attempt<4;attempt++){
    try{return await this.db.$transaction(async tx=>{
     await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${org}, true)`;
     return fn(tx);
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});}
    catch(e){if((e as {code?:string})?.code!=='P2034'||attempt===3)throw e;}
   }
   throw new Error('Trial transaction retry exhausted');
  })();
 }
 private async admin(tx:Prisma.TransactionClient,org:string,
  identity:VerifiedIdentity){
  if(!identity||identity.organizationId!==org||
   !identity.subject||!hasMarketingPermission(identity,'MANAGE_TENANT'))
   throw new ForbiddenException('Verified tenant administrator required');
  const user=await tx.user.findFirst({where:{id:identity.userId,
   organizationId:org,oidcSubject:identity.subject,disabledAt:null},
   select:{role:true}});
  if(!user||user.role.toUpperCase()!==identity.role.toUpperCase()||
   !['ADMIN','SUPER_ADMIN'].includes(user.role.toUpperCase()))
   throw new ForbiddenException('Active matching OIDC administrator required');
 }
 async catalog(org:string,identity:VerifiedIdentity){
  return this.scoped(org,async tx=>{
   await this.admin(tx,org,identity);
   return{providers:[...TRIAL_PROVIDERS],scenarios:[...TRIAL_SCENARIOS],
    protocolModes:{
     META_GRAPH:'Facebook Page text/feed and GET readback fixture',
     LINKEDIN:'Organization text Posts REST and GET readback fixture',
     SENDGRID:'Mail Send v3 HTTP 202 fixture; no verified delivery',
     OPENAI:'Responses API through existing adapter, injected fake fetch',
     ANTHROPIC:'Messages API through existing adapter, injected fake fetch',
     GEMINI:'generateContent through existing adapter, injected fake fetch',
     MCP:'JSON-RPC initialize fixture, no tools/call',
     A2A:'JSON-RPC message/send fixture, no peer message sent',
     INSTAGRAM:'Instagram Professional: container, processing status, publish, media readback; all fixtures',
     TIKTOK:'TikTok Direct Post: creator-info, PRIVATE upload init, chunk and publish status; no account',
     YOUTUBE:'YouTube Data API v3: resumable session, fake chunk and processing status; private fixture',
     X:'X API v2: chunked media initialize, append, finalize, status, post and readback',
     CANVA:'Canva Connect: editable design autofill async job, export job and status',
     ADOBE_FIREFLY:'Adobe Firefly: server-to-server token shape, image generate-async and status'
    },
    mockOnly:true,realNetworkCalls:0,realAccountsConnected:0,
    externalEffectsAuthorized:false};
  });
 }
 /** Read only existing canonical receipts. No new integration state or
  * credential authority, and never echo raw receipt JSON or request keys. */
 async history(org:string,identity:VerifiedIdentity){
  return this.scoped(org,async tx=>{
   await this.admin(tx,org,identity);
   const rows=await tx.commandReceipt.findMany({where:{organizationId:org,commandType:'PROVIDER_CONTRACT_TRIAL',status:'COMPLETED'},
    orderBy:[{createdAt:'desc'},{id:'desc'}],take:101,
    select:{commandId:true,correlationId:true,response:true,createdAt:true}});
   const entries=rows.slice(0,100).map(row=>{
    const corrupt=()=>{throw new ConflictException('Invalid stored offline trial evidence');};
    if(!row.commandId.startsWith('PROVIDER_TRIAL:'))return corrupt();
    const requestKey=row.commandId.slice('PROVIDER_TRIAL:'.length);
    if(!/^[A-Za-z0-9_-]{8,80}$/.test(requestKey))return corrupt();
    const ref=trialRefFor({organizationId:org,requestKey});
    const raw=row.response;
    if(!raw||typeof raw!=='object'||Array.isArray(raw))return corrupt();
    const receipt=raw as Record<string,unknown>;
    const value=receipt.result;
    if(!value||typeof value!=='object'||Array.isArray(value))return corrupt();
    const v=value as Record<string,unknown>;
    let provider,scenario;
    try{provider=assertTrialProvider(v.provider);scenario=assertTrialScenario(v.scenario);}
    catch{return corrupt();}
    const digest='sha256:'+createHash('sha256').update(JSON.stringify(['medsol-offline-provider-trial-input-v1',org,provider,scenario])).digest('hex');
    if(row.correlationId!==ref||v.trialRef!==ref||receipt.inputDigest!==digest||
     v.fixtureOnly!==true||typeof v.contractOutcome!=='string'||!['FIXTURE_MATCH','HTTP_ACCEPTED_UNVERIFIED','BLOCKED','OUTCOME_UNKNOWN','CONTRACT_REJECTED'].includes(v.contractOutcome)||
     ['actualProviderRequests','actualEmailsSent','actualPostsPublished','actualModelCalls','actualMcpCalls','actualA2aCalls','verifiedRemoteReceipts'].some(k=>v[k]!==0)||
     ['accountOwnershipVerified','appEntitlementVerified','senderDomainVerified','externalEffectsAuthorized','automaticRetryAllowed'].some(k=>v[k]!==false)||
     typeof v.fixtureReadbackMatches!=='boolean'||typeof v.mockHttpExchanges!=='number'||!Number.isSafeInteger(v.mockHttpExchanges)||v.mockHttpExchanges<0||v.mockHttpExchanges>6)
     return corrupt();
    return{trialRef:ref,provider,scenario,contractOutcome:v.contractOutcome as ProviderTrialResult['contractOutcome'],
     fixtureReadbackMatches:v.fixtureReadbackMatches,mockHttpExchanges:v.mockHttpExchanges,
     observedAt:row.createdAt.toISOString(),fixtureOnly:true as const,externalEffectsAuthorized:false as const,
     verifiedRemoteReceipts:0 as const,automaticRetryAllowed:false as const};
   });
   return{organizationId:org,entries,windowCapped:rows.length>100,limit:100,fixtureOnly:true,
    actualProviderRequests:0,realAccountsConnected:0,externalEffectsAuthorized:false,productionCertified:false};
  });
 }
 async run(org:string,identity:VerifiedIdentity,raw:unknown){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))
   throw new BadRequestException('Strict trial request required');
  const v=raw as Record<string,unknown>;
  if(Object.keys(v).sort().join(',')!=='provider,requestKey,scenario')
   throw new BadRequestException('Only provider, scenario and requestKey accepted; never credentials or URLs');
  let provider,scenario;
  try{provider=assertTrialProvider(v.provider);scenario=assertTrialScenario(v.scenario);}
  catch{throw new BadRequestException('Unknown provider or scenario');}
  const requestKey=v.requestKey;
  if(typeof requestKey!=='string'||!/^[A-Za-z0-9_-]{8,80}$/.test(requestKey))
   throw new BadRequestException('8-80 character trial idempotency key required');
  const ref=trialRefFor({organizationId:org,requestKey});
  const inputDigest='sha256:'+createHash('sha256').update(JSON.stringify([
   'medsol-offline-provider-trial-input-v1',org,provider,scenario
  ])).digest('hex');
  return this.scoped(org,async tx=>{
   await this.admin(tx,org,identity);
   // Serialize same-tenant same-key races; this is a DB-only synthetic trial.
   await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${ref})::bigint)::text AS lock_result`;
   const commandId='PROVIDER_TRIAL:'+requestKey;
   const prior=await tx.commandReceipt.findUnique({where:{
    organizationId_commandId:{organizationId:org,commandId}
   }});
   if(prior){
    const data=prior.response;
    if(prior.commandType!=='PROVIDER_CONTRACT_TRIAL'||
     !data||typeof data!=='object'||Array.isArray(data)||
     (data as Record<string,unknown>).inputDigest!==inputDigest)
     throw new ConflictException('Trial idempotency key already used for a different contract');
    return{...((data as Record<string,unknown>).result as ProviderTrialResult),
     replayed:true};
   }
   const result=await runProviderContractTrial({
    organizationId:org,requestKey,provider,scenario
   });
   await tx.commandReceipt.create({data:{
    organizationId:org,commandId,commandType:'PROVIDER_CONTRACT_TRIAL',
    correlationId:ref,status:'COMPLETED',
    response:{inputDigest,result} as unknown as Prisma.InputJsonValue
   }});
   await tx.auditEvent.create({data:{organizationId:org,actorType:'HUMAN',
    actorId:identity.userId,action:'OFFLINE_PROVIDER_WIRE_TRIAL_EXECUTED',
    objectType:'CommandReceipt',objectId:commandId,correlationId:ref,
    after:{provider,scenario,contractOutcome:result.contractOutcome,
     mockHttpExchanges:result.mockHttpExchanges,
     actualProviderRequests:0,actualEmailsSent:0,
     actualPostsPublished:0,actualModelCalls:0,actualMcpCalls:0,
     actualA2aCalls:0,verifiedRemoteReceipts:0,
     externalEffectsAuthorized:false,fixtureOnly:true}}});
   return{...result,replayed:false};
  });
 }
}
