import {Injectable} from '@nestjs/common';
import {PrismaService,withMarketingTenant} from './prisma.service.js';
/** All event creation is part of caller's original canonical domain transaction. */
@Injectable()
export class OutboxService{
 constructor(private readonly db:PrismaService){}
 async enqueue(tx:any,i:{organizationId:string;eventId:string;eventType:string;aggregateType:string;aggregateId:string;payload:unknown;correlationId:string;causationId?:string;version?:number}){
  return tx.outboxEvent.create({data:{
   organizationId:i.organizationId,eventId:i.eventId,eventType:i.eventType,
   aggregateType:i.aggregateType,aggregateId:i.aggregateId,payload:i.payload as any,
   correlationId:i.correlationId,causationId:i.causationId,version:i.version??1
  }});
 }
 async pending(organizationId:string,limit=100){
  if(!Number.isInteger(limit)||limit<1||limit>100)throw new Error('Invalid outbox batch size');
  return withMarketingTenant(this.db,organizationId,tx=>tx.outboxEvent.findMany({
   where:{organizationId,publishedAt:null},orderBy:{occurredAt:'asc'},take:limit
  }));
 }
}
