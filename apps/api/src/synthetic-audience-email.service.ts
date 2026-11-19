import {BadRequestException,ConflictException,ForbiddenException,Injectable,NotFoundException} from '@nestjs/common';
import {Prisma} from '@prisma/client';
import {createHash,randomUUID} from 'node:crypto';
import {PrismaService} from './prisma.service.js';
import {hasMarketingPermission} from './marketing-permissions.js';
import type {VerifiedIdentity} from './oidc-identity.js';
import {assertSyntheticEmailScenario,simulateSyntheticEmailTransport} from './synthetic-email-transport.js';
import {parseSyntheticJourney,syntheticJourneyDigest,simulateSyntheticJourney} from './synthetic-email-journey.js';

/** R2H: first bounded synthetic-only Audience/Consent & Email simulation
 * authority. It stores NO actual email addresses, legal consent, send tokens,
 * mailing lists, SMTP/ESP credentials or customer-delivery receipts.
 * Never expose a live send endpoint through this service.
 */
type Tx=Prisma.TransactionClient;
type ConsentAction='SIMULATED_OPT_IN'|'SIMULATED_WITHDRAWAL'|'SIMULATED_COMPLAINT';
const actions=new Set<string>([
 'SIMULATED_OPT_IN','SIMULATED_WITHDRAWAL','SIMULATED_COMPLAINT'
]);
const key=(v:unknown,label:string,max=160)=>{
 if(typeof v!=='string'||v.length<12||v.length>max||
  !/^[a-zA-Z0-9_-]+$/.test(v))
  throw new BadRequestException('Invalid '+label);
 return v;
};
const refId=(v:unknown,label:string)=>{
 if(typeof v!=='string'||v.length<1||v.length>128||
  !/^[a-zA-Z0-9_-]+$/.test(v))throw new BadRequestException('Invalid '+label);
 return v;
};
const digest=(a:unknown[])=>'sha256:'+createHash('sha256')
 .update(JSON.stringify(a)).digest('hex');
const source=(a:unknown[])=>createHash('sha256')
 .update(JSON.stringify(a)).digest('hex');

@Injectable()
export class SyntheticAudienceEmailService{
 constructor(private readonly db:PrismaService){}
 private scoped<T>(organizationId:string,fn:(tx:Tx)=>Promise<T>):Promise<T>{
  refId(organizationId,'tenant');
  return this.db.$transaction(async tx=>{
   await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${organizationId}, true)`;
   return fn(tx);
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
 }
 private async administrator(tx:Tx,organizationId:string,identity:VerifiedIdentity){
  if(!identity||identity.organizationId!==organizationId||
     !identity.userId||!identity.subject||
     !hasMarketingPermission(identity,'MANAGE_TENANT'))
   throw new ForbiddenException('Verified tenant audience administrator required');
  const user=await tx.user.findFirst({where:{
   organizationId,id:identity.userId,oidcSubject:identity.subject,disabledAt:null
  },select:{role:true}});
  if(!user||user.role.toUpperCase()!==identity.role.toUpperCase()||
     !['ADMIN','SUPER_ADMIN'].includes(user.role.toUpperCase()))
   throw new ForbiddenException('Active matching OIDC audience administrator required');
 }
 async createSyntheticContact(organizationId:string,identity:VerifiedIdentity,
  raw:unknown){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||
     Object.keys(raw).some(k=>k!=='brandId'))
   throw new BadRequestException('Only brandId is accepted; never submit email or PII');
  const brandId=refId((raw as {brandId?:unknown}).brandId,'brand');
  return this.scoped(organizationId,async tx=>{
   await this.administrator(tx,organizationId,identity);
   const brand=await tx.brand.findFirst({where:{
    organizationId,id:brandId,status:'ACTIVE'},select:{id:true}});
   if(!brand)throw new NotFoundException('Active tenant brand not found');
   const contactId=randomUUID(),syntheticRecipientRef='internal:synthetic-recipient/'+
    source(['medsol-r2h-synthetic-recipient-v1',organizationId,brandId,contactId]);
   await tx.marketingSyntheticContact.create({data:{id:contactId,organizationId,
    brandId,syntheticRecipientRef,createdBy:identity.userId}});
   await tx.auditEvent.create({data:{organizationId,actorType:'HUMAN',
    actorId:identity.userId,action:'SYNTHETIC_AUDIENCE_CONTACT_CREATED',
    objectType:'MarketingSyntheticContact',objectId:contactId,
    correlationId:contactId,after:{brandId,syntheticOnly:true,
     legalConsentVerified:false,externalEffectsAuthorized:false}}});
   return{contactId,brandId,syntheticRecipientRef,
    syntheticOnly:true,legalConsentVerified:false,
    externalEffectsAuthorized:false};
  });
 }
 async listSyntheticContacts(organizationId:string,identity:VerifiedIdentity,
  brandIdInput:unknown){
  const brandId=refId(brandIdInput,'brand');
  return this.scoped(organizationId,async tx=>{
   await this.administrator(tx,organizationId,identity);
   const rows=await tx.marketingSyntheticContact.findMany({where:{
    organizationId,brandId},orderBy:{createdAt:'desc'},take:100,
    include:{consentEvents:{orderBy:{sequence:'desc'},take:1}}});
   return rows.map(r=>({contactId:r.id,brandId:r.brandId,
    syntheticRecipientRef:r.syntheticRecipientRef,
    latestSimulatedConsent:r.consentEvents[0]?.action??'NONE',
    syntheticOnly:true,verifiedLegalConsent:false}));
  });
 }
 async recordSyntheticConsent(organizationId:string,identity:VerifiedIdentity,
  contactIdInput:unknown,raw:unknown){
  const contactId=refId(contactIdInput,'contact');
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||
    Object.keys(raw).some(k=>!['action','requestKey'].includes(k)))
   throw new BadRequestException('Synthetic consent action and key only');
  const r=raw as Record<string,unknown>;
  if(typeof r.action!=='string'||!actions.has(r.action))
   throw new BadRequestException('Synthetic consent action not recognized');
  const action=r.action as ConsentAction;
  const requestKey=key(r.requestKey,'synthetic consent idempotency key');
  const evidenceRef='internal:synthetic-consent/'+source([
   'medsol-r2h-consent-event-v1',organizationId,contactId,requestKey
  ]);
  return this.scoped(organizationId,async tx=>{
   await this.administrator(tx,organizationId,identity);
   const contact=await tx.marketingSyntheticContact.findFirst({where:{
    organizationId,id:contactId}});
   if(!contact)throw new NotFoundException('Synthetic contact not in tenant');
   const prior=await tx.marketingSyntheticConsent.findFirst({where:{
    organizationId,contactId,evidenceRef
   }});
   if(prior){
    if(prior.action!==action)
     throw new ConflictException('Consent event key reused for a different action');
    return{contactId,action,sequence:prior.sequence,replayed:true,
     verifiedLegalConsent:false,externalEffectsAuthorized:false};
   }
   const latest=await tx.marketingSyntheticConsent.findFirst({where:{
    organizationId,contactId},orderBy:{sequence:'desc'}});
   if(action==='SIMULATED_OPT_IN'){
    const complaint=await tx.marketingSyntheticConsent.findFirst({where:{
     organizationId,contactId,action:'SIMULATED_COMPLAINT'}});
    if(complaint)throw new ConflictException('Complaint suppression is irreversible for synthetic contact');
   }
   const event=await tx.marketingSyntheticConsent.create({data:{
    id:randomUUID(),organizationId,contactId,sequence:(latest?.sequence??0)+1,
    action,evidenceRef,recordedBy:identity.userId
   }});
   await tx.auditEvent.create({data:{organizationId,actorType:'HUMAN',
    actorId:identity.userId,action:'SYNTHETIC_CONSENT_EVENT_RECORDED',
    objectType:'MarketingSyntheticConsent',objectId:event.id,
    correlationId:contactId,after:{contactId,action,sequence:event.sequence,
     simulatedOnly:true,verifiedLegalConsent:false,externalEffectsAuthorized:false}}});
   return{contactId,action,sequence:event.sequence,replayed:false,
    verifiedLegalConsent:false,externalEffectsAuthorized:false};
  });
 }
 async simulateEmailJourney(organizationId:string,identity:VerifiedIdentity,
  raw:unknown){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||
     Object.keys(raw).some(k=>!['campaignId','brandId','contactIds',
      'contentDigest','requestKey','scenario','journey'].includes(k)))
   throw new BadRequestException('Only bounded synthetic email simulation input is accepted');
  const v=raw as Record<string,unknown>;
  const campaignId=refId(v.campaignId,'campaign'),brandId=refId(v.brandId,'brand');
  const requestKey=key(v.requestKey,'email simulation idempotency key');
  let scenario;
  try{scenario=assertSyntheticEmailScenario(v.scenario??'ACCEPTED');}
  catch{throw new BadRequestException('Unknown synthetic email provider scenario');}
  let journey;
  try{journey=v.journey===undefined?null:parseSyntheticJourney(v.journey);}
  catch(e){throw new BadRequestException(e instanceof Error?e.message:'Invalid synthetic journey');}
  const journeyDigest=journey?syntheticJourneyDigest(journey):null;
  if(typeof v.contentDigest!=='string'||!/^sha256:[a-f0-9]{64}$/.test(v.contentDigest))
   throw new BadRequestException('Immutable email content digest required');
  const contentDigest=v.contentDigest;
  if(!Array.isArray(v.contactIds)||v.contactIds.length<1||v.contactIds.length>100)
   throw new BadRequestException('1-100 synthetic contacts required');
  const ids=v.contactIds.map(x=>refId(x,'synthetic contact'));
  if(new Set(ids).size!==ids.length)
   throw new BadRequestException('Duplicate synthetic recipient cannot enter audience snapshot');
  const sorted=[...ids].sort();
  return this.scoped(organizationId,async tx=>{
   await this.administrator(tx,organizationId,identity);
   const campaign=await tx.campaign.findFirst({where:{
    organizationId,id:campaignId,status:'APPROVED',brandId
   },select:{id:true}});
   if(!campaign)throw new ConflictException('Same-brand independently approved campaign required');
   const contacts=await tx.marketingSyntheticContact.findMany({where:{
    organizationId,brandId,id:{in:sorted}
   }});
   if(contacts.length!==sorted.length)
    throw new ConflictException('Audience contains absent, foreign-tenant or cross-brand contact');
   const events=await tx.marketingSyntheticConsent.findMany({where:{
    organizationId,contactId:{in:sorted}
   },orderBy:[{contactId:'asc'},{sequence:'desc'}]});
   const latest=new Map<string,typeof events[number]>();
   const complaints=new Set<string>();
   for(const event of events){
    if(!latest.has(event.contactId))latest.set(event.contactId,event);
    if(event.action==='SIMULATED_COMPLAINT')complaints.add(event.contactId);
   }
   let syntheticEligible=0,withdrawn=0,complaintSuppressed=0,missingConsent=0;
   const snapshot=sorted.map(contactId=>{
    const event=latest.get(contactId);
    const complaint=complaints.has(contactId);
    const reason=complaint?'COMPLAINT_SUPPRESSED':
     event?.action==='SIMULATED_OPT_IN'?'SYNTHETIC_ELIGIBLE':
     event?.action==='SIMULATED_WITHDRAWAL'?'WITHDRAWN':'MISSING_CONSENT';
    if(reason==='COMPLAINT_SUPPRESSED')complaintSuppressed++;
    else if(reason==='SYNTHETIC_ELIGIBLE')syntheticEligible++;
    else if(reason==='WITHDRAWN')withdrawn++;
    else missingConsent++;
    return[contactId,event?.id??null,event?.sequence??0,reason] as const;
   });
   const audienceDigest=digest(['medsol-r2h-synthetic-audience-snapshot-v1',
    organizationId,brandId,campaignId,snapshot]);
   const existing=await tx.marketingEmailSimulation.findUnique({where:{
    organizationId_requestKey:{organizationId,requestKey}
   }});
   if(existing){
    const previous=existing.result as Record<string,unknown>;
    if(existing.campaignId!==campaignId||existing.brandId!==brandId||
       existing.contentDigest!==contentDigest||existing.audienceDigest!==audienceDigest||
       previous.syntheticTransportScenario!==scenario||
       (previous.syntheticJourneyDigest??null)!==journeyDigest)
     throw new ConflictException('Email simulation key reused for changed audience, consent or creative');
    return{simulationId:existing.id,status:existing.status,
     audienceDigest,results:existing.result,replayed:true,
     externalEffectsAuthorized:false};
   }
   const syntheticTransport=simulateSyntheticEmailTransport({
    organizationId,brandId,campaignId,contentDigest,audienceDigest,
    eligibleCount:syntheticEligible,scenario
   });
   const syntheticJourneyPlan=journey?simulateSyntheticJourney({
    organizationId,brandId,campaignId,contentDigest,audienceDigest,
    eligibleAtSnapshot:syntheticEligible,definition:journey
   }):null;
   const results={
    syntheticTransportScenario:scenario,syntheticTransport,
    syntheticJourneyDigest:journeyDigest,syntheticJourneyPlan,
    syntheticRecipients:sorted.length,syntheticEligible,withdrawn,
    complaintSuppressed,missingConsent,
    actualMessagesSent:0,verifiedProviderReceipts:0,
    syntheticOnly:true,realConsentVerified:false,
    externalEffectsAuthorized:false,automaticRetryAllowed:false
   };
   const status=syntheticEligible>0?'SIMULATED':'BLOCKED';
   const row=await tx.marketingEmailSimulation.create({data:{
    id:randomUUID(),organizationId,brandId,campaignId,
    audienceDigest,contentDigest,requestKey,status,result:results,
    createdBy:identity.userId
   }});
   await tx.auditEvent.create({data:{organizationId,actorType:'HUMAN',
    actorId:identity.userId,action:'EMAIL_JOURNEY_SYNTHETIC_SIMULATED',
    objectType:'MarketingEmailSimulation',objectId:row.id,
    correlationId:row.id,after:{campaignId,brandId,audienceDigest,
     contentDigest,status,...results}}});
   await tx.outboxEvent.create({data:{organizationId,eventId:randomUUID(),
    eventType:'EmailJourneySyntheticSimulatedInternal',
    aggregateType:'MarketingEmailSimulation',aggregateId:row.id,
    correlationId:row.id,payload:{simulationId:row.id,campaignId,brandId,
     audienceDigest,status,actualMessagesSent:0,
     verifiedProviderReceipts:0,externalEffectsAuthorized:false}}});
   return{simulationId:row.id,status,audienceDigest,
    results,replayed:false,externalEffectsAuthorized:false};
  });
 }
 async listEmailSimulations(organizationId:string,identity:VerifiedIdentity){
  return this.scoped(organizationId,async tx=>{
   await this.administrator(tx,organizationId,identity);
   return tx.marketingEmailSimulation.findMany({where:{organizationId},
    select:{id:true,brandId:true,campaignId:true,status:true,
     audienceDigest:true,contentDigest:true,result:true,createdAt:true},
    orderBy:{createdAt:'desc'},take:100});
  });
 }
}
