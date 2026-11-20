import {Injectable} from '@nestjs/common';
import {PrismaService,withMarketingTenant} from './prisma.service.js';

export type PublishedEvent = {
  eventId: string;
  organizationId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  version: number;
  payload: unknown;
  correlationId: string;
  causationId?: string;
};

export const MAX_DELIVERY_ATTEMPTS = 8;
export function deliveryDelayMs(attempt: number): number { return Math.min(3600000, 1000 * 2 ** Math.min(Math.max(attempt - 1, 0), 12)); }

export interface EventTransport {
  publish(event: PublishedEvent): Promise<void>;
}

@Injectable()
export class OutboxPublisherService{
 private tenantCursor:string|null=null;
 constructor(private readonly db:PrismaService){}
 async publishBatch(transport:EventTransport,limit=50,eventTypes?:readonly string[]):
 Promise<{published:number;failed:number}>{
  if(!Number.isSafeInteger(limit)||limit<1||limit>500)
   throw new Error('Invalid dispatch batch size');
  if(eventTypes&&(!eventTypes.length||eventTypes.length>20||
     eventTypes.some(x=>typeof x!=='string'||x.length>120)))
   throw new Error('Invalid filtered dispatch event types');
  let published=0,failed=0;
  for(let i=0;i<limit;i++){
   const claimed=await this.claimOne(eventTypes);
   if(!claimed)break;
   try{
    await transport.publish({eventId:claimed.eventId,
     organizationId:claimed.organizationId,eventType:claimed.eventType,
     aggregateType:claimed.aggregateType,aggregateId:claimed.aggregateId,
     version:claimed.version,payload:claimed.payload,
     correlationId:claimed.correlationId,...(claimed.causationId?{
      causationId:claimed.causationId}:{})});
    const result=await withMarketingTenant(this.db,claimed.organizationId,tx=>
     tx.outboxEvent.updateMany({where:{id:claimed.id,
      organizationId:claimed.organizationId,publishedAt:null,deadLetteredAt:null,
      publishingAt:claimed.publishingAt},
      data:{publishedAt:new Date(),publishingAt:null,nextAttemptAt:null,lastError:null}}));
    if(result.count===1)published++;
   }catch(error){
    const dead=claimed.attempts+1>=MAX_DELIVERY_ATTEMPTS;
    const nextAttemptAt=dead?null:new Date(Date.now()+deliveryDelayMs(claimed.attempts+1));
    await withMarketingTenant(this.db,claimed.organizationId,tx=>
     tx.outboxEvent.updateMany({where:{id:claimed.id,organizationId:claimed.organizationId,
      publishedAt:null,deadLetteredAt:null,publishingAt:claimed.publishingAt},
      data:{publishingAt:null,nextAttemptAt,...(dead?{deadLetteredAt:new Date()}:{}),
       lastError:(error instanceof Error?error.message:'Unknown publish error').slice(0,2000)}}));
    failed++;
   }
  }
  return{published,failed};
 }
 /** Round-robin of canonical Organization tenants. No global query may read
  * a protected OutboxEvent, and no pool-level SET may leak tenant scope.
  */
 private async claimOne(eventTypes?:readonly string[]){
  const now=new Date(),leaseCutoff=new Date(now.getTime()-5*60*1000);
  const eligible={...(eventTypes?{eventType:{in:[...eventTypes]}}:{}),
   publishedAt:null,deadLetteredAt:null,attempts:{lt:MAX_DELIVERY_ATTEMPTS},
   AND:[{OR:[{nextAttemptAt:null},{nextAttemptAt:{lte:now}}]},
    {OR:[{publishingAt:null},{publishingAt:{lt:leaseCutoff}}]}]};
  const tenants=await this.db.organization.findMany({
   where:this.tenantCursor?{id:{gt:this.tenantCursor}}:{},
   orderBy:{id:'asc'},take:50,select:{id:true}
  });
  if(!tenants.length){
   if(this.tenantCursor){this.tenantCursor=null;return this.claimOne(eventTypes);}
   return null;
  }
  for(const tenant of tenants){
   this.tenantCursor=tenant.id;
   const claimed=await withMarketingTenant(this.db,tenant.id,async tx=>{
    const event=await tx.outboxEvent.findFirst({
     where:{organizationId:tenant.id,...eligible},
     orderBy:{occurredAt:'asc'}});
    if(!event)return null;
    const claimedAt=new Date();
    const update=await tx.outboxEvent.updateMany({
     where:{id:event.id,organizationId:tenant.id,...eligible},
     data:{publishingAt:claimedAt,attempts:{increment:1}}});
    if(update.count!==1)return null;
    return{...event,publishingAt:claimedAt};
   });
   if(claimed)return claimed;
  }
  return null;
 }
}
