import {ConflictException} from '@nestjs/common';
import {specialistPlanDigest} from './specialist-mission-brain.js';
export const SPECIALIST_SCHEDULE='SPECIALIST_BATCH_SCHEDULE';
export const SPECIALIST_SCHEDULE_EVENT='SPECIALIST_BATCH_SCHEDULE_EVENT';
export const specialistScheduleConfigured=()=>process.env.MARKETING_SPECIALIST_SCHEDULER_ENABLED==='true'&&process.env.MARKETING_BRAIN_WORKER_ENABLED==='true'&&process.env.MARKETING_AI_REASONING_ENABLED!=='true';
export const scheduleCommandId=(key:string)=>SPECIALIST_SCHEDULE+':'+key;
export type ScheduleGrant={schema:'medsol.specialist-schedule.v1';owner:string;key:string;planDigest:string;expiresAt:string;initialCursor:number;digest:string};
const digest=(org:string,s:Omit<ScheduleGrant,'digest'>)=>specialistPlanDigest([SPECIALIST_SCHEDULE,org,s.owner,s.key,s.planDigest,s.expiresAt,s.initialCursor]);
export function makeScheduleGrant(org:string,owner:string,key:string,planDigest:string,initialCursor:number,now:Date):ScheduleGrant{
 const grant={schema:'medsol.specialist-schedule.v1' as const,owner,key,planDigest,initialCursor,expiresAt:new Date(now.getTime()+3600000).toISOString()};
 return{...grant,digest:digest(org,grant)};
}
export function readScheduleGrant(raw:unknown,org:string,key:string):ScheduleGrant{
 const g=raw as ScheduleGrant;
 if(!g||g.schema!=='medsol.specialist-schedule.v1'||g.key!==key||typeof g.owner!=='string'||!g.owner||!/^sha256:[0-9a-f]{64}$/.test(g.planDigest)||!Number.isInteger(g.initialCursor)||g.initialCursor<0||g.initialCursor>3||typeof g.expiresAt!=='string'||!Number.isFinite(Date.parse(g.expiresAt))||new Date(g.expiresAt).toISOString()!==g.expiresAt||g.digest!==digest(org,g))throw new ConflictException('Invalid specialist schedule grant');
 return g;
}
export type ScheduleEventStatus='CLAIMED'|'ADVANCED'|'COMPLETED'|'HALTED'|'NEEDS_INTERVENTION'|'CANCELLED';
export type ScheduleStatus=ScheduleEventStatus|'ACTIVE'|'EXPIRED';
type EventRow={commandId:string;commandType:string;correlationId:string;status:string;response:unknown};
export function scheduleEventId(key:string,status:ScheduleEventStatus,cursor:number){return scheduleCommandId(key)+(status==='CANCELLED'?':cancel':status==='CLAIMED'?':claim:'+cursor:':outcome:'+cursor);}
export function scheduleEvent(grant:ScheduleGrant,status:ScheduleEventStatus,cursor:number){
 return{commandId:scheduleEventId(grant.key,status,cursor),commandType:SPECIALIST_SCHEDULE_EVENT,correlationId:scheduleCommandId(grant.key),status,response:{schema:'medsol.specialist-schedule-event.v1',grantDigest:grant.digest,cursor,status}};
}
export function reconstructSchedule(grant:ScheduleGrant,rows:readonly EventRow[],now:Date){
 if(rows.length>9||new Set(rows.map(r=>r.commandId)).size!==rows.length)throw new ConflictException('Invalid schedule event inventory');
 let cursor=grant.initialCursor,status:ScheduleStatus='ACTIVE';
 const seen=new Set<string>();
 function event(id:string,allowed:readonly ScheduleEventStatus[]){
  const row=rows.find(r=>r.commandId===id);
  if(!row)return undefined;
  const e=row.response as {schema?:unknown;grantDigest?:unknown;cursor?:unknown;status?:unknown}|null;
  if(row.commandType!==SPECIALIST_SCHEDULE_EVENT||row.correlationId!==scheduleCommandId(grant.key)||!e||e.schema!=='medsol.specialist-schedule-event.v1'||e.grantDigest!==grant.digest||e.cursor!==cursor||e.status!==row.status||!allowed.includes(row.status as ScheduleEventStatus))throw new ConflictException('Invalid schedule event');
  seen.add(id);return row.status as ScheduleEventStatus;
 }
 while(cursor<4){
  const claim=event(scheduleEventId(grant.key,'CLAIMED',cursor),['CLAIMED']);
  if(!claim)break;
  status='CLAIMED';
  const outcome=event(scheduleEventId(grant.key,'ADVANCED',cursor),['ADVANCED','COMPLETED','HALTED','NEEDS_INTERVENTION']);
  if(!outcome)break;
  status=outcome;
  if(outcome!=='NEEDS_INTERVENTION')cursor++;
  if(outcome!=='ADVANCED')break;
  status='ACTIVE';
 }
 if(cursor===4&&status==='ACTIVE')throw new ConflictException('Schedule exceeds bounded stages');
 const cancel=event(scheduleEventId(grant.key,'CANCELLED',cursor),['CANCELLED']);
 if(cancel){if(!['ACTIVE','CLAIMED','NEEDS_INTERVENTION'].includes(status))throw new ConflictException('Invalid terminal schedule cancellation');status='CANCELLED';}
 if(seen.size!==rows.length)throw new ConflictException('Unrecognized or out-of-order schedule event');
 if(status==='ACTIVE'&&Date.parse(grant.expiresAt)<=now.getTime())status='EXPIRED';
 return{grant,status,cursor};
}
