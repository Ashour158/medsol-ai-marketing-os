import {ConflictException} from '@nestjs/common';
import {specialistPlanDigest} from './specialist-mission-brain.js';
export const SPECIALIST_SCHEDULE='SPECIALIST_BATCH_SCHEDULE';
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
 if(!g||g.schema!=='medsol.specialist-schedule.v1'||g.key!==key||typeof g.owner!=='string'||!g.owner||!/^sha256:[0-9a-f]{64}$/.test(g.planDigest)||!Number.isInteger(g.initialCursor)||g.initialCursor<0||g.initialCursor>3||typeof g.expiresAt!=='string'||!Number.isFinite(Date.parse(g.expiresAt))||g.digest!==digest(org,g))throw new ConflictException('Invalid specialist schedule grant');
 return g;
}
