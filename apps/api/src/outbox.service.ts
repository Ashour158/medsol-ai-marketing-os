import {Injectable} from '@nestjs/common';
import {PrismaService,withMarketingTenant} from './prisma.service.js';
@Injectable()
export class OutboxService{
 constructor(private readonly db:PrismaService){}
 /** Transactional outbox: caller already owns a trusted tenant transaction.
  * A non-BYPASSRLS PostgreSQL principal rejects writes without scope.
  */
 async enqueue(tx:any,i:{organizationId:string;eventId:string;eventType:string;
  aggregateType:string;aggregateId:string;payload:unknown;correlationId:string;
  causationId?:string;version?:number}){
  return tx.outboxEvent.create({data:{organizationId:i.organizationId,
   eventId:i.eventId,eventType:i.eventType,aggregateType:i.aggregateType,
   aggregateId:i.aggregateId,payload:i.payload as any,
   correlationId:i.correlationId,causationId:i.causationId,version:i.version??1}});
 }
 async pending(organizationId:string,limit=100){
  if(!Number.isSafeInteger(limit)||limit<1||limit>500)
   throw new Error('Invalid tenant outbox listing limit');
  return withMarketingTenant(this.db,organizationId,tx=>
   tx.outboxEvent.findMany({where:{organizationId,publishedAt:null},
    orderBy:{occurredAt:'asc'},take:limit}));
 }
}
