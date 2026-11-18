import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';
import { BrainRunExecutorService } from './brain-run-executor.service.js';
import { OutboxPublisherService,type PublishedEvent } from './outbox-publisher.service.js';
import { BrainHandoffConsumer, BRAIN_INTERNAL_EVENTS } from './brain-handoff-consumer.service.js';
import {MarketingWorkerHealthService} from './marketing-worker-health.service.js';
import {MarketingIncidentResponseService,INCIDENT_ALERT_EVENT} from './marketing-incident-response.service.js';
import {MarketingIncidentWebhookTransport} from './marketing-incident-webhook.transport.js';

/**
 * Optional polling scheduler. Run only on explicitly opted-in workers.
 * Each run is CAS-claimed by BrainRunExecutorService; ambiguous RUNNING runs are never retried.
 * Only one active invocation per process. Multiple replicas are safe through DB CAS.
 */
@Injectable()
export class BrainDispatchWorker implements OnModuleInit, OnModuleDestroy {
 private readonly log = new Logger(BrainDispatchWorker.name);
 private poller: ReturnType<typeof setInterval>|undefined;
 private heartbeatTimer:ReturnType<typeof setInterval>|undefined;
 private incidentTimer:ReturnType<typeof setInterval>|undefined;
 private workerId:string|undefined;
 private alertTransport:MarketingIncidentWebhookTransport|undefined;
 private incidentBusy=false;
 private busy = false;
 private stopping = false;
 constructor(private readonly db:PrismaService, private readonly executor:BrainRunExecutorService,
  @Optional() private readonly outbox?:OutboxPublisherService,
  @Optional() private readonly handoffs?:BrainHandoffConsumer,
  @Optional() private readonly workerHealth?:MarketingWorkerHealthService,
  @Optional() private readonly incidentResponses?:MarketingIncidentResponseService){}
 private async deliverBrainEvents():Promise<void>{
   if(this.outbox&&this.handoffs&&process.env.MARKETING_BRAIN_EVENT_DELIVERY_ENABLED!=='false')
     await this.outbox.publishBatch(this.handoffs,25,BRAIN_INTERNAL_EVENTS);
 }
 onModuleInit():void {
  if(process.env.MARKETING_BRAIN_WORKER_ENABLED!=='true') return;
  if(this.workerHealth){
   const id=this.workerHealth.newIdentity();
   this.workerId=id;
   void this.workerHealth.heartbeat(id,'STARTING').catch(error=>
    this.log.error('Worker initial heartbeat failed',error instanceof Error?error.message:String(error)));
   this.heartbeatTimer=setInterval(()=>{
    void this.workerHealth?.heartbeat(id).catch(error=>
     this.log.error('Worker heartbeat failed',error instanceof Error?error.message:String(error)));
   },15000);
   this.heartbeatTimer.unref?.();
  }
  if(process.env.MARKETING_INCIDENT_ALERT_DELIVERY_ENABLED==='true'){
   if(process.env.MARKETING_INCIDENT_MONITOR_ENABLED!=='true'||!this.incidentResponses||!this.outbox)
    throw new Error('Authenticated incident alerts require the existing incident monitor and outbox');
   this.alertTransport=MarketingIncidentWebhookTransport.fromEnvironment();
  }
  if(process.env.MARKETING_INCIDENT_MONITOR_ENABLED==='true'){
   if(!this.incidentResponses||!this.outbox)throw new Error('Incident scan requires registered response and outbox services');
   this.incidentTimer=setInterval(()=>{
    void this.pulseIncidents().catch(error=>this.log.error('Incident monitor failed',error instanceof Error?error.message:String(error)));
   },30000);
   this.incidentTimer.unref?.();
   void this.pulseIncidents().catch(error=>
    this.log.error('Initial incident monitor failed',error instanceof Error?error.message:String(error)));
  }
  const configured=Number(process.env.MARKETING_BRAIN_POLL_MS??'10000');
  const period=Number.isFinite(configured)?Math.max(1000,Math.min(60000,configured)):10000;
  this.poller=setInterval(()=>{void this.tick().catch(error=>this.log.error('Brain scheduler tick failed',error instanceof Error?error.stack:String(error)));},period);
  this.poller.unref?.();
  this.log.log('Governed brain dispatcher enabled; non-idempotent and uncertain executions are never auto-replayed');
 }
 onModuleDestroy():void {
  this.stopping=true;
  if(this.poller)clearInterval(this.poller);
  if(this.heartbeatTimer)clearInterval(this.heartbeatTimer);
  if(this.incidentTimer)clearInterval(this.incidentTimer);
  if(this.workerId&&this.workerHealth){
   void this.workerHealth.stop(this.workerId).catch(error=>
    this.log.warn('Worker stop marker unavailable: '+(error instanceof Error?error.message:String(error))));
  }
 }
 async pulseIncidents(){
  if(this.stopping)return {status:'STOPPING'};
  if(this.incidentBusy)return {status:'BUSY'};
  if(!this.incidentResponses||!this.outbox)return {status:'DISABLED'};
  this.incidentBusy=true;
  try{
   const queued=await this.incidentResponses.scan(25);
   const delivery=this.alertTransport?
    await this.outbox.publishBatch({publish:async (event:PublishedEvent)=>{
     // Do not contact an on-call destination after the source was resolved
     // or acknowledged while the alert waited in the durable outbox.
     if(await this.incidentResponses!.shouldDeliver(event))
      await this.alertTransport!.publish(event);
    }},25,[INCIDENT_ALERT_EVENT]):
    {published:0,failed:0};
   return {status:'OBSERVED',queued:queued.queued,delivery,
    externalAlertsEnabled:!!this.alertTransport};
  }finally{this.incidentBusy=false;}
 }
 async tick():Promise<{claimed:boolean;runId?:string;status:string}>{
  if(this.stopping)return {claimed:false,status:'STOPPING'};
  if(this.busy)return {claimed:false,status:'BUSY'};
  this.busy=true;
  try{
   const run=await this.db.brainRun.findFirst({where:{status:'PENDING'},orderBy:{createdAt:'asc'},select:{id:true,organizationId:true}});
   if(!run){await this.deliverBrainEvents();
    if(this.workerId&&this.workerHealth)void this.workerHealth.heartbeat(this.workerId,'EMPTY').catch(()=>{});
    return {claimed:false,status:'EMPTY'};}
   try{
    const completed=await this.executor.execute(run.organizationId,run.id);
    await this.deliverBrainEvents();
    if(this.workerId&&this.workerHealth)void this.workerHealth.heartbeat(this.workerId,'RUN_COMPLETED').catch(()=>{});
    return {claimed:true,runId:run.id,status:completed.status};
   }catch(error){
    // A losing CAS race is normal. The executor owns durable failure states.
    this.log.warn('Brain run not completed: '+run.id+' '+(error instanceof Error?error.message:'unknown error'));
    await this.deliverBrainEvents();
    if(this.workerId&&this.workerHealth)void this.workerHealth.heartbeat(this.workerId,'RUN_FAILED').catch(()=>{});
    return {claimed:false,runId:run.id,status:'CLAIMED_ELSEWHERE_OR_NEEDS_INTERVENTION'};
   }
  }finally{this.busy=false;}
 }
}
