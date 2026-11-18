import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';
import { BrainRunExecutorService } from './brain-run-executor.service.js';

/**
 * Optional polling scheduler. Run only on explicitly opted-in workers.
 * Each run is CAS-claimed by BrainRunExecutorService; ambiguous RUNNING runs are never retried.
 * Only one active invocation per process. Multiple replicas are safe through DB CAS.
 */
@Injectable()
export class BrainDispatchWorker implements OnModuleInit, OnModuleDestroy {
 private readonly log = new Logger(BrainDispatchWorker.name);
 private poller: ReturnType<typeof setInterval>|undefined;
 private busy = false;
 constructor(private readonly db:PrismaService, private readonly executor:BrainRunExecutorService){}
 onModuleInit():void {
  if(process.env.MARKETING_BRAIN_WORKER_ENABLED!=='true') return;
  const configured=Number(process.env.MARKETING_BRAIN_POLL_MS??'10000');
  const period=Number.isFinite(configured)?Math.max(1000,Math.min(60000,configured)):10000;
  this.poller=setInterval(()=>{void this.tick().catch(error=>this.log.error('Brain scheduler tick failed',error instanceof Error?error.stack:String(error)));},period);
  this.poller.unref?.();
  this.log.log('Governed brain dispatcher enabled; non-idempotent and uncertain executions are never auto-replayed');
 }
 onModuleDestroy():void {if(this.poller)clearInterval(this.poller);}
 async tick():Promise<{claimed:boolean;runId?:string;status:string}>{
  if(this.busy)return {claimed:false,status:'BUSY'};
  this.busy=true;
  try{
   const run=await this.db.brainRun.findFirst({where:{status:'PENDING'},orderBy:{createdAt:'asc'},select:{id:true,organizationId:true}});
   if(!run)return {claimed:false,status:'EMPTY'};
   try{
    const completed=await this.executor.execute(run.organizationId,run.id);
    return {claimed:true,runId:run.id,status:completed.status};
   }catch(error){
    // A losing CAS race is normal. The executor owns durable failure states.
    this.log.warn('Brain run not completed: '+run.id+' '+(error instanceof Error?error.message:'unknown error'));
    return {claimed:false,runId:run.id,status:'CLAIMED_ELSEWHERE_OR_NEEDS_INTERVENTION'};
   }
  }finally{this.busy=false;}
 }
}
