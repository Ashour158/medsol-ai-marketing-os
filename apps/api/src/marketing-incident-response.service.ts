import {BadRequestException,ConflictException,Injectable,NotFoundException} from '@nestjs/common';
import {createHash} from 'node:crypto';
import {Prisma} from '@prisma/client';
import {PrismaService} from './prisma.service.js';

export const INCIDENT_KINDS=['BRAIN_STALE','BRAIN_NEEDS_INTERVENTION','OUTBOX_DEAD_LETTER'] as const;
export type IncidentKind=typeof INCIDENT_KINDS[number];
export const INCIDENT_ALERT_EVENT='MARKETING_INCIDENT_ALERT';
const MAX_LEVEL=2;
type Source={organizationId:string;kind:IncidentKind;sourceId:string;occurrenceAt:Date;
 severity:'WARNING'|'CRITICAL';correlationId:string};
function validKind(kind:unknown):asserts kind is IncidentKind {
 if(typeof kind!=='string'||!INCIDENT_KINDS.includes(kind as IncidentKind))
  throw new BadRequestException('Unknown incident kind');
}
function validId(id:unknown):asserts id is string {
 if(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(id))
  throw new BadRequestException('Invalid incident source ID');
}
function alertKey(s:Source,level:number):string{
 return 'incident:'+createHash('sha256').update([s.organizationId,s.kind,s.sourceId,s.occurrenceAt.toISOString(),level].join('|')).digest('hex');
}
/** Authoritative response/notification metadata only. Source incidents remain BrainRun/OutboxEvent. */
@Injectable()
export class MarketingIncidentResponseService{
 private cursors:Record<IncidentKind,string|null>={
  BRAIN_STALE:null,BRAIN_NEEDS_INTERVENTION:null,OUTBOX_DEAD_LETTER:null
 };
 constructor(private readonly db:PrismaService){}
 private async active(tx:Prisma.TransactionClient,organizationId:string,kind:IncidentKind,sourceId:string):Promise<Source>{
  if(kind==='OUTBOX_DEAD_LETTER'){
   const e=await tx.outboxEvent.findFirst({where:{id:sourceId,organizationId,
    eventType:{not:INCIDENT_ALERT_EVENT},deadLetteredAt:{not:null}},
    select:{deadLetteredAt:true,correlationId:true}});
   if(!e?.deadLetteredAt)throw new ConflictException('Incident no longer active');
   return {organizationId,kind,sourceId,occurrenceAt:e.deadLetteredAt,
    severity:'CRITICAL',correlationId:e.correlationId};
  }
  const r=await tx.brainRun.findFirst({where:{id:sourceId,organizationId,
   ...(kind==='BRAIN_STALE'?{status:'RUNNING',updatedAt:{lte:new Date(Date.now()-15*60_000)}}:
    {status:'NEEDS_INTERVENTION'})},select:{updatedAt:true,correlationId:true}});
  if(!r)throw new ConflictException('Incident no longer active');
  return {organizationId,kind,sourceId,occurrenceAt:r.updatedAt,
   severity:kind==='BRAIN_STALE'?'WARNING':'CRITICAL',correlationId:r.correlationId};
 }
 async batch(organizationId:string,kind:IncidentKind,sourceIds:readonly string[]){
  if(!sourceIds.length)return new Map<string,{occurrenceAt:Date;acknowledgedAt:Date|null;acknowledgedBy:string|null;lastNotifiedLevel:number}>();
  const rows=await this.db.incidentResponse.findMany({where:{
   organizationId,kind,sourceId:{in:[...new Set(sourceIds)].slice(0,100)}
  },select:{sourceId:true,occurrenceAt:true,acknowledgedAt:true,acknowledgedBy:true,lastNotifiedLevel:true}});
  return new Map(rows.map(r=>[r.sourceId,r]));
 }
 /** Idempotent human acknowledgement of the current source occurrence. */
 async acknowledge(organizationId:string,kindInput:unknown,idInput:unknown,actorId:string,reasonInput:unknown){
  validKind(kindInput);validId(idInput);
  if(!actorId||actorId.length>128)throw new BadRequestException('Verified operator required');
  if(typeof reasonInput!=='string'||reasonInput.trim().length<12||reasonInput.length>500)
   throw new BadRequestException('Specific acknowledgement rationale (12 to 500 characters) required');
  const reason=reasonInput.trim(),kind=kindInput,sourceId=idInput;
  return this.db.$transaction(async tx=>{
   const source=await this.active(tx,organizationId,kind,sourceId);
   const key={organizationId_kind_sourceId:{organizationId,kind,sourceId}};
   const prior=await tx.incidentResponse.findUnique({where:key});
   if(prior?.occurrenceAt.getTime()===source.occurrenceAt.getTime()&&prior.acknowledgedAt)
    return {kind,sourceId,acknowledgedAt:prior.acknowledgedAt,replay:true,sourceStatusUnchanged:true};
   const now=new Date();
   if(prior){
    const changed=await tx.incidentResponse.updateMany({where:{id:prior.id,organizationId,
     occurrenceAt:prior.occurrenceAt,acknowledgedAt:prior.acknowledgedAt},
     data:{occurrenceAt:source.occurrenceAt,acknowledgedAt:now,acknowledgedBy:actorId,acknowledgedReason:reason,
      ...(prior.occurrenceAt.getTime()!==source.occurrenceAt.getTime()?
       {lastNotifiedLevel:-1,nextEscalationAt:null}:{nextEscalationAt:null})}});
    if(changed.count!==1)throw new ConflictException('Incident acknowledgement changed concurrently');
   }else{
    await tx.incidentResponse.create({data:{organizationId,kind,sourceId,occurrenceAt:source.occurrenceAt,
     acknowledgedAt:now,acknowledgedBy:actorId,acknowledgedReason:reason}});
   }
   await tx.auditEvent.create({data:{organizationId,actorType:'HUMAN',actorId,
    action:'MARKETING_INCIDENT_ACKNOWLEDGED',objectType:kind,objectId:sourceId,
    correlationId:source.correlationId,
    after:{kind,sourceId,occurrenceAt:source.occurrenceAt.toISOString(),
     response:'ACKNOWLEDGED_FOR_INVESTIGATION',resolved:false,automaticReplayAllowed:false,reason}}});
   return {kind,sourceId,acknowledgedAt:now,replay:false,sourceStatusUnchanged:true};
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
 }
 /**
  * Scan source incidents, atomically queue the first alert and up to two timed
  * escalations. No event is queued for an acknowledged occurrence. There is no
  * access to social channels, provider models, or customer contact information.
  */
 private async queueOne(source:Source,now:Date){
  return this.db.$transaction(async tx=>{
   const current=await this.active(tx,source.organizationId,source.kind,source.sourceId);
   const key={organizationId_kind_sourceId:{
    organizationId:source.organizationId,kind:source.kind,sourceId:source.sourceId}};
   const prior=await tx.incidentResponse.findUnique({where:key});
   const fresh=!prior||prior.occurrenceAt.getTime()!==current.occurrenceAt.getTime();
   if(!fresh&&prior?.acknowledgedAt)return false;
   if(!fresh&&prior && (prior.lastNotifiedLevel>=MAX_LEVEL||
      (prior.lastNotifiedLevel>=0&&(!prior.nextEscalationAt||prior.nextEscalationAt>now))))
    return false;
   const level=fresh?0:Math.max(0,(prior?.lastNotifiedLevel??-1)+1);
   const nextEscalationAt=level>=MAX_LEVEL?null:
    new Date(now.getTime()+(current.severity==='CRITICAL'?15:30)*60_000);
   let responseId:string;
   if(prior){
    const changed=await tx.incidentResponse.updateMany({where:{id:prior.id,
     organizationId:current.organizationId,occurrenceAt:prior.occurrenceAt,
     acknowledgedAt:prior.acknowledgedAt,lastNotifiedLevel:prior.lastNotifiedLevel},
     data:{occurrenceAt:current.occurrenceAt,
      ...(fresh?{acknowledgedAt:null,acknowledgedBy:null,acknowledgedReason:null}:{}),
      lastNotifiedLevel:level,nextEscalationAt}});
    if(changed.count!==1)throw new ConflictException('Concurrent incident scan');
    responseId=prior.id;
   }else{
    const created=await tx.incidentResponse.create({data:{
     organizationId:current.organizationId,kind:current.kind,sourceId:current.sourceId,
     occurrenceAt:current.occurrenceAt,lastNotifiedLevel:level,nextEscalationAt}});
    responseId=created.id;
   }
   await tx.outboxEvent.create({data:{
    organizationId:current.organizationId,eventId:alertKey(current,level),
    eventType:INCIDENT_ALERT_EVENT,aggregateType:'IncidentResponse',aggregateId:responseId,
    version:1,correlationId:current.correlationId,
    payload:{kind:current.kind,sourceId:current.sourceId,severity:current.severity,
     occurrenceAt:current.occurrenceAt.toISOString(),level,requiresHumanAcknowledgement:true,
     externalPublishingAuthorized:false}
   }});
   return true;
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
 }
 async scan(limitPerKind=25){
  if(!Number.isInteger(limitPerKind)||limitPerKind<1||limitPerKind>100)
   throw new BadRequestException('Invalid incident scan batch');
  const now=new Date(),cutoff=new Date(now.getTime()-15*60_000);
  const definitions:[
   IncidentKind,Prisma.BrainRunWhereInput|Prisma.OutboxEventWhereInput
  ][]=[
   ['BRAIN_NEEDS_INTERVENTION',{status:'NEEDS_INTERVENTION'}],
   ['BRAIN_STALE',{status:'RUNNING',updatedAt:{lte:cutoff}}],
   ['OUTBOX_DEAD_LETTER',{deadLetteredAt:{not:null},eventType:{not:INCIDENT_ALERT_EVENT}}]
  ];
  let inspected=0,queued=0,conflicts=0;
  for(const [kind,base] of definitions){
   const cursor=this.cursors[kind];
   const where={...base,...(cursor?{id:{gt:cursor}}:{})};
   const rows=kind==='OUTBOX_DEAD_LETTER'?
    await this.db.outboxEvent.findMany({where:where as Prisma.OutboxEventWhereInput,
     orderBy:{id:'asc'},take:limitPerKind,
     select:{id:true,organizationId:true}}):
    await this.db.brainRun.findMany({where:where as Prisma.BrainRunWhereInput,
     orderBy:{id:'asc'},take:limitPerKind,
     select:{id:true,organizationId:true}});
   this.cursors[kind]=rows.length===limitPerKind?rows[rows.length-1]!.id:null;
   for(const row of rows){
    inspected++;
    try{
     // Resolve again within the transaction; a stale run may have completed mid-scan.
     const didQueue=await this.db.$transaction(async tx=>{
      const verified=await this.active(tx,row.organizationId,kind,row.id);
      return verified;
     });
     if(await this.queueOne(didQueue,now))queued++;
    }catch(error){
     if(error instanceof ConflictException ||
       (typeof error==='object'&&error!==null&&'code' in error&&
        ['P2002','P2034'].includes(String(error.code)))){conflicts++;continue;}
     throw error;
    }
   }
  }
  return {inspected,queued,conflicts,automatedAgentReplay:false,externalPublishingAuthorized:false};
 }
}
