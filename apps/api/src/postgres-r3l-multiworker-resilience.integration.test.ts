import {describe,it,expect} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {OutboxPublisherService,MAX_DELIVERY_ATTEMPTS}
 from './outbox-publisher.service.js';
import {BrainHandoffConsumer,BRAIN_INTERNAL_EVENTS}
 from './brain-handoff-consumer.service.js';
import {MarketingIncidentResponseService,INCIDENT_ALERT_EVENT}
 from './marketing-incident-response.service.js';

const enabled=process.env.MARKETING_DB_INTEGRATION==='1';
describe.skipIf(!enabled)('R3-L offline cross-tenant multi-worker resilience acceptance',()=>{
 it('T15-017 multiworker CAS, receipt crash window and dead letter incident acceptance',async()=>{
  const db=new PrismaClient();
  const orgA='r3l-outbox-a-'+randomUUID();
  const orgB='r3l-outbox-b-'+randomUUID();
  const organizations=[orgA,orgB];
  const runs=new Map<string,string>();
  const eventIds:string[]=[];
  try{
   await db.$connect();
   await db.organization.createMany({data:organizations.map((id,i)=>({
    id,name:'R3L internal handoff '+i
   }))});
   for(const org of organizations){
    const run=await db.brainRun.create({data:{
     id:'r3l-run-'+randomUUID(),organizationId:org,
     commandKey:'r3l-cmd-'+randomUUID(),correlationId:'r3l-corr-'+randomUUID(),
     input:{offline:true},status:'NEEDS_INTERVENTION'
    }});
    runs.set(org,run.id);
    for(let index=0;index<4;index++){
     const eventId='r3l-event-'+randomUUID();
     eventIds.push(eventId);
     await db.outboxEvent.create({data:{
      organizationId:org,eventId,
      eventType:BRAIN_INTERNAL_EVENTS[index%2]!,
      aggregateType:'BrainRun',aggregateId:run.id,
      correlationId:run.correlationId,
      payload:{simulationOnly:true,externalEffectsAuthorized:false}
     }});
    }
   }
   const consumer=new BrainHandoffConsumer(db as any);
   const publisherA=new OutboxPublisherService(db as any);
   const publisherB=new OutboxPublisherService(db as any);
   // Simulate an accepted consumer transaction followed by a lost
   // outbox acknowledgement (worker process SIGKILL window).
   const precommitted=await db.outboxEvent.findFirstOrThrow({where:{
    organizationId:orgA,eventId:eventIds[0]!
   }});
   await consumer.publish({
    eventId:precommitted.eventId,organizationId:orgA,
    eventType:precommitted.eventType,
    aggregateType:precommitted.aggregateType,
    aggregateId:precommitted.aggregateId,version:precommitted.version,
    correlationId:precommitted.correlationId,payload:precommitted.payload
   });
   expect(await db.inboxEvent.count({where:{
    organizationId:orgA,eventId:precommitted.eventId,status:'PROCESSED'
   }})).toBe(1);
   expect(await db.outboxEvent.count({where:{
    organizationId:orgA,eventId:precommitted.eventId,publishedAt:null
   }})).toBe(1);
   // Contending workers use the real database claim CAS, not an in-memory lock.
   const results=await Promise.allSettled(Array.from({length:6},(_,i)=>
    (i%2?publisherA:publisherB).publishBatch(consumer,3,BRAIN_INTERNAL_EVENTS)));
   expect(results.some(r=>r.status==='fulfilled')).toBe(true);
   // Contention can cause a batch to stop early. Subsequent worker pulses
   // drain remaining records without bypassing at-least-once semantics.
   for(let i=0;i<12;i++){
    const remaining=await db.outboxEvent.count({where:{
     organizationId:{in:organizations},eventId:{in:eventIds},
     publishedAt:null
    }});
    if(remaining===0)break;
    await publisherA.publishBatch(consumer,8,BRAIN_INTERNAL_EVENTS);
   }
   expect(await db.outboxEvent.count({where:{
    organizationId:{in:organizations},eventId:{in:eventIds},publishedAt:null
   }})).toBe(0);
   expect(await db.inboxEvent.count({where:{
    organizationId:{in:organizations},eventId:{in:eventIds},
    consumerName:'brain-handoff-audit-v1',status:'PROCESSED'
   }})).toBe(8);
   expect(await db.auditEvent.count({where:{
    organizationId:{in:organizations},
    action:{in:[...BRAIN_INTERNAL_EVENTS]}
   }})).toBe(8);
   // Consumer must reject wrong-tenant aggregate identity before creating
   // inbox evidence or any cross-tenant audit side effect.
   await expect(consumer.publish({
    eventId:'r3l-foreign-'+randomUUID(),organizationId:orgB,
    eventType:'BRAIN_AGENT_STEP_COMPLETED',aggregateType:'BrainRun',
    aggregateId:runs.get(orgA)!,version:1,
    correlationId:'r3l-cross-tenant',payload:{offlineOnly:true}
   })).rejects.toThrow('owner not found');
   expect(await db.inboxEvent.count({where:{
    organizationId:orgB,eventId:{startsWith:'r3l-foreign-'}
   }})).toBe(0);
   // Re-delivery cannot create another audited domain effect.
   const replay=await consumer.publish({
    eventId:precommitted.eventId,organizationId:orgA,
    eventType:precommitted.eventType,
    aggregateType:precommitted.aggregateType,
    aggregateId:precommitted.aggregateId,version:precommitted.version,
    correlationId:precommitted.correlationId,payload:precommitted.payload
   });
   expect(replay).toBeUndefined();
   expect(await db.auditEvent.count({where:{
    organizationId:orgA,causationId:precommitted.eventId
   }})).toBe(0); // Audit is keyed by event ID in JSON payload, not causation.
   const audits=await db.auditEvent.findMany({where:{
    organizationId:orgA,objectId:runs.get(orgA)!,
    action:precommitted.eventType
   }});
   expect(audits.filter(x=>(x.after as {eventId?:string})?.eventId===
    precommitted.eventId)).toHaveLength(1);
   // Wrong-tenant reference is deliberately NEVER marked delivered. No
   // networking: the only transport is BrainHandoffConsumer's local ledger.
   const failed=await db.outboxEvent.create({data:{
    organizationId:orgB,eventId:'r3l-dead-'+randomUUID(),
    eventType:'BRAIN_AGENT_STEP_COMPLETED',
    aggregateType:'BrainRun',aggregateId:runs.get(orgA)!,
    correlationId:'r3l-forged-cross-tenant',
    payload:{simulationOnly:true,externalEffectsAuthorized:false}
   }});
   for(let i=0;i<MAX_DELIVERY_ATTEMPTS;i++){
    await db.outboxEvent.update({where:{id:failed.id},
     data:{nextAttemptAt:new Date(Date.now()-2000)}});
    const outcome=await publisherB.publishBatch(consumer,1,BRAIN_INTERNAL_EVENTS);
    expect(outcome.failed).toBe(1);
   }
   const dead=await db.outboxEvent.findUniqueOrThrow({where:{id:failed.id}});
   expect(dead).toMatchObject({attempts:MAX_DELIVERY_ATTEMPTS,
    publishedAt:null});
   expect(dead.deadLetteredAt).toBeInstanceOf(Date);
   const ops=new MarketingIncidentResponseService(db as any);
   expect((await ops.scan(50,orgB)).queued).toBeGreaterThanOrEqual(1);
   const outboxAlerts=await db.outboxEvent.findMany({where:{
    organizationId:orgB,eventType:INCIDENT_ALERT_EVENT
   }});
   expect(outboxAlerts.some(x=>(x.payload as {sourceId?:string}).sourceId===
    failed.id)).toBe(true);
   expect(await db.modelUsage.count({where:{
    organizationId:{in:organizations}}})).toBe(0);
  }finally{
   // Test database is ephemeral. The canonical events and audits are immutable
   // evidence, not objects the recovery harness may manually repair.
   await db.$disconnect();
  }
 },90000);
});
