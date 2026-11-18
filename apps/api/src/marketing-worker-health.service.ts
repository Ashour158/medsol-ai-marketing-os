import {BadRequestException,Injectable} from '@nestjs/common';
import {randomUUID} from 'node:crypto';
import {PrismaService} from './prisma.service.js';

export const WORKER_LIVENESS_TTL_MS=45_000;
/**
 * Platform-level liveness only; does not own work leases, Brain state or incidents.
 * Ephemeral process IDs are never exposed outside operator diagnostics.
 */
@Injectable()
export class MarketingWorkerHealthService{
 constructor(private readonly db:PrismaService){}
 newIdentity():string{return randomUUID();}
 async heartbeat(id:string,tickStatus?:string){
  if(!/^[0-9a-f-]{36}$/i.test(id))throw new BadRequestException('Invalid worker identity');
  if(tickStatus!==undefined&&!['EMPTY','BUSY','RUN_COMPLETED','RUN_FAILED','POLL_ERROR','STARTING'].includes(tickStatus))
   throw new BadRequestException('Invalid worker heartbeat status');
  const now=new Date();
  await this.db.marketingWorkerHeartbeat.upsert({
   where:{id},
   create:{id,workerType:'BRAIN_DISPATCH',lastSeenAt:now,status:'ACTIVE',
    ...(tickStatus?{lastTickAt:now,lastTickStatus:tickStatus}:{})},
   update:{lastSeenAt:now,status:'ACTIVE',
    ...(tickStatus?{lastTickAt:now,lastTickStatus:tickStatus}:{})}
  });
 }
 async stop(id:string){
  // A crashed process cannot call stop; absence of new heartbeats is its failure signal.
  await this.db.marketingWorkerHeartbeat.updateMany({where:{id,workerType:'BRAIN_DISPATCH'},
   data:{status:'STOPPED',lastSeenAt:new Date()}});
 }
 async summary(){
  const now=new Date(),cutoff=new Date(now.getTime()-WORKER_LIVENESS_TTL_MS);
  // Count the whole known fleet; the evidence window is 24h. Stale records do not make an absent fleet "healthy".
  const since=new Date(now.getTime()-24*3600_000);
  const [active,stale,stopped,recent]=await Promise.all([
   this.db.marketingWorkerHeartbeat.count({where:{workerType:'BRAIN_DISPATCH',status:'ACTIVE',lastSeenAt:{gt:cutoff}}}),
   this.db.marketingWorkerHeartbeat.count({where:{workerType:'BRAIN_DISPATCH',status:'ACTIVE',
    lastSeenAt:{lte:cutoff,gte:since}}}),
   this.db.marketingWorkerHeartbeat.count({where:{workerType:'BRAIN_DISPATCH',status:'STOPPED',
    lastSeenAt:{gte:since}}}),
   this.db.marketingWorkerHeartbeat.findFirst({where:{workerType:'BRAIN_DISPATCH'},
    orderBy:{lastSeenAt:'desc'},select:{lastSeenAt:true}})
  ]);
  return {asOf:now.toISOString(),health:active===0?'NO_HEALTHY_WORKERS':stale>0?'DEGRADED':'HEALTHY_OBSERVED',
   active,stale,stopped,thresholdSeconds:WORKER_LIVENESS_TTL_MS/1000,
   lastHeartbeatAt:recent?.lastSeenAt??null,workerConfiguredHere:process.env.MARKETING_BRAIN_WORKER_ENABLED==='true',
   source:'PERSISTED_WORKER_HEARTBEATS',sloValidated:false};
 }
}
