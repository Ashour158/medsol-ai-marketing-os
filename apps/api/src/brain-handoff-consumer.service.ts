import { Injectable } from '@nestjs/common';
import { PrismaService,withMarketingTenant } from './prisma.service.js';
import type { EventTransport, PublishedEvent } from './outbox-publisher.service.js';

export const BRAIN_INTERNAL_EVENTS = ['BRAIN_AGENT_STEP_COMPLETED','BRAIN_RUN_REVIEW_REQUIRED'] as const;
const allowed = new Set<string>(BRAIN_INTERNAL_EVENTS);
const CONSUMER='brain-handoff-audit-v1';

/**
 * Exactly-once domain audit effect atop at-least-once outbox delivery.
 * Inbox idempotency and audit creation share a transaction.
 * No network transport, channel publication, campaign mutation or AI model call is performed here.
 */
@Injectable()
export class BrainHandoffConsumer implements EventTransport {
 constructor(private readonly db:PrismaService){}
 async publish(event:PublishedEvent):Promise<void> {
  if(!allowed.has(event.eventType)||event.aggregateType!=='BrainRun'||event.version!==1||
     !event.organizationId||!event.eventId||!event.aggregateId||!event.correlationId)throw new Error('Invalid brain handoff event');
  await withMarketingTenant(this.db,event.organizationId,async tx=>{
    const run=await tx.brainRun.findFirst({where:{id:event.aggregateId,organizationId:event.organizationId},select:{id:true}});
    if(!run)throw new Error('Handoff owner not found in tenant');
    const prior=await tx.inboxEvent.findUnique({where:{
      organizationId_consumerName_eventId:{organizationId:event.organizationId,consumerName:CONSUMER,eventId:event.eventId}
    }});
    if(prior?.status==='PROCESSED')return;
    if(prior)throw new Error('Ambiguous inbox state requires operator investigation');
    await tx.inboxEvent.create({data:{
      organizationId:event.organizationId,eventId:event.eventId,consumerName:CONSUMER,
      status:'PROCESSED',processedAt:new Date(),attempts:1
    }});
    await tx.auditEvent.create({data:{
      organizationId:event.organizationId,actorType:'SYSTEM',actorId:CONSUMER,
      action:event.eventType,objectType:'BrainRun',objectId:event.aggregateId,
      correlationId:event.correlationId,
      ...(event.causationId?{causationId:event.causationId}:{}),
      after:{eventId:event.eventId,eventType:event.eventType,version:event.version,
       externalEffectsAuthorized:false}
    }});
  });
 }
}
