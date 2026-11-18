import {describe,it,expect,vi} from 'vitest';
import {BrainHandoffConsumer,BRAIN_INTERNAL_EVENTS} from './brain-handoff-consumer.service.js';
import {OutboxPublisherService} from './outbox-publisher.service.js';
const event={eventId:'brain:run1:step:0',organizationId:'tenant',eventType:'BRAIN_AGENT_STEP_COMPLETED',
 aggregateType:'BrainRun',aggregateId:'run1',version:1,correlationId:'corr',
 payload:{agentId:'MKT-CMO-001',executionId:'ex',externalEffectsAuthorized:false}};

function fixture(prior:any=null,run:any={id:'run1'}){
 const tx:any={brainRun:{findFirst:vi.fn().mockResolvedValue(run)},
  inboxEvent:{findUnique:vi.fn().mockResolvedValue(prior),create:vi.fn().mockResolvedValue({id:'in1'})},
  auditEvent:{create:vi.fn().mockResolvedValue({id:'a1'})}};
 const db:any={$transaction:vi.fn((callback:any)=>callback(tx))};
 return{tx,consumer:new BrainHandoffConsumer(db)};
}
describe('transactional Brain nervous-system inbox',()=>{
 it('records tenant-scoped handoff, audit and inbox in one transaction',async()=>{
  const {consumer,tx}=fixture();
  await consumer.publish(event);
  expect(tx.brainRun.findFirst).toHaveBeenCalledWith({where:{id:'run1',organizationId:'tenant'},select:{id:true}});
  expect(tx.inboxEvent.create).toHaveBeenCalledWith({data:expect.objectContaining({
   organizationId:'tenant',eventId:event.eventId,consumerName:'brain-handoff-audit-v1',status:'PROCESSED'
  })});
  expect(tx.auditEvent.create).toHaveBeenCalledWith({data:expect.objectContaining({
   actorType:'SYSTEM',action:'BRAIN_AGENT_STEP_COMPLETED',objectId:'run1',correlationId:'corr',
   after:expect.objectContaining({externalEffectsAuthorized:false})
  })});
 });
 it('does not repeat an already processed event',async()=>{
  const {consumer,tx}=fixture({id:'in1',status:'PROCESSED'});
  await consumer.publish(event);
  expect(tx.inboxEvent.create).not.toHaveBeenCalled();
  expect(tx.auditEvent.create).not.toHaveBeenCalled();
 });
 it('rejects cross-tenant events and ambiguous inbox states',async()=>{
  const missing=fixture(null,null);
  await expect(missing.consumer.publish(event)).rejects.toThrow('not found');
  const ambiguous=fixture({id:'in1',status:'RECEIVED'});
  await expect(ambiguous.consumer.publish(event)).rejects.toThrow('Ambiguous inbox');
 });
 it('cannot be repurposed to publish a social post',async()=>{
  const {consumer,tx}=fixture();
  await expect(consumer.publish({...event,eventType:'PUBLISH_SOCIAL'})).rejects.toThrow('Invalid brain');
  expect(tx.inboxEvent.create).not.toHaveBeenCalled();
 });
});
describe('filtered outbox delivery reuses standard retry and dead letter policy',()=>{
 it('claims only approved internal Brain event types',async()=>{
  const db:any={outboxEvent:{findFirst:vi.fn().mockResolvedValue(null)},
   $transaction:vi.fn((callback:any)=>callback({outboxEvent:db.outboxEvent}))};
  const publisher=new OutboxPublisherService(db);
  await publisher.publishBatch({publish:vi.fn()},5,BRAIN_INTERNAL_EVENTS);
  expect(db.outboxEvent.findFirst).toHaveBeenCalledWith(expect.objectContaining({
   where:expect.objectContaining({eventType:{in:[...BRAIN_INTERNAL_EVENTS]}})
  }));
 });
});
