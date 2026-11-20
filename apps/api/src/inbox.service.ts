import {Injectable,ConflictException} from '@nestjs/common';
import {PrismaService,withMarketingTenant} from './prisma.service.js';
@Injectable()
export class InboxService{
 constructor(private readonly db:PrismaService){}
 async begin(organizationId:string,consumerName:string,eventId:string):
 Promise<{duplicate:boolean;id:string}>{
  try{
   const row=await withMarketingTenant(this.db,organizationId,tx=>
    tx.inboxEvent.create({data:{organizationId,consumerName,eventId,status:'RECEIVED'}}));
   return{duplicate:false,id:row.id};
  }catch(error){
   if((error as {code?:string})?.code!=='P2002')throw error;
   const existing=await withMarketingTenant(this.db,organizationId,tx=>
    tx.inboxEvent.findUnique({where:{organizationId_consumerName_eventId:{
     organizationId,consumerName,eventId}}}));
   if(existing)return{duplicate:true,id:existing.id};
   throw error;
  }
 }
 /** Explicit tenant argument required: an event ID alone cannot pick a tenant. */
 async complete(organizationId:string,id:string):Promise<void>{
  const result=await withMarketingTenant(this.db,organizationId,tx=>
   tx.inboxEvent.updateMany({where:{id,organizationId,status:{in:['RECEIVED','FAILED']}},
    data:{status:'PROCESSED',processedAt:new Date(),lastError:null}}));
  if(result.count!==1)throw new ConflictException('Inbox completion not authorized, ambiguous or already processed');
 }
 async fail(organizationId:string,id:string,error:unknown):Promise<void>{
  const result=await withMarketingTenant(this.db,organizationId,tx=>
   tx.inboxEvent.updateMany({where:{id,organizationId,status:{not:'PROCESSED'}},
    data:{status:'FAILED',attempts:{increment:1},
     lastError:(error instanceof Error?error.message:'Unknown error').slice(0,2000)}}));
  if(result.count!==1)throw new ConflictException('Inbox failed checkpoint not authorized or already terminal');
 }
}
