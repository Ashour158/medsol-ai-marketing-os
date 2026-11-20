import {ConflictException,Injectable,NotFoundException} from '@nestjs/common';
import {PrismaService,withMarketingTenant} from './prisma.service.js';

/** Sole durable InboxEvent authority. All operations use a verified tenant scope. */
@Injectable()
export class InboxService {
  constructor(private readonly db: PrismaService) {}

  async begin(organizationId: string, consumerName: string, eventId: string): Promise<{duplicate: boolean; id: string}> {
    const key={organizationId_consumerName_eventId:{organizationId,consumerName,eventId}};
    const find=()=>withMarketingTenant(this.db,organizationId,tx=>tx.inboxEvent.findUnique({where:key}));
    try{
      return await withMarketingTenant(this.db,organizationId,async tx=>{
        const prior=await tx.inboxEvent.findUnique({where:key});
        if(prior)return {duplicate:true,id:prior.id};
        const row=await tx.inboxEvent.create({data:{organizationId,consumerName,eventId,status:'RECEIVED'}});
        return {duplicate:false,id:row.id};
      });
    }catch(error){
      // Concurrent duplicate delivery: only a unique event key can be replayed.
      if((error as {code?:string})?.code!=='P2002')throw error;
      const existing=await find();
      if(!existing)throw new ConflictException('Inbox collision has no durable matching event');
      return {duplicate:true,id:existing.id};
    }
  }

  /** Caller must use the same authenticated tenant as the original consumer. */
  async complete(organizationId:string,id:string):Promise<void>{
    const result=await withMarketingTenant(this.db,organizationId,tx=>
      tx.inboxEvent.updateMany({where:{organizationId,id,status:'RECEIVED'},
        data:{status:'PROCESSED',processedAt:new Date(),lastError:null}}));
    if(result.count!==1)throw new NotFoundException('Inbox event missing or not claimable in tenant');
  }

  async fail(organizationId:string,id:string,error:unknown):Promise<void>{
    const result=await withMarketingTenant(this.db,organizationId,tx=>
      tx.inboxEvent.updateMany({where:{organizationId,id,status:'RECEIVED'},
        data:{status:'FAILED',attempts:{increment:1},
          lastError:(error instanceof Error?error.message:'Unknown error').slice(0,2000)}}));
    if(result.count!==1)throw new NotFoundException('Inbox event missing or not claimable in tenant');
  }
}
