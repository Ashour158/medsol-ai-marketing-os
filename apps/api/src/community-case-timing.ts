/**
 * Internal advisory queue targets, NOT contractual SLAs or professional
 * response obligations. Clock starts at immutable case creation, never resets
 * on claim, reassignment, or reopen. No automated external effect.
 */
export const COMMUNITY_PRIORITY_ORDER=['URGENT','HIGH','NORMAL','LOW'] as const;
export type CommunityPriority=typeof COMMUNITY_PRIORITY_ORDER[number];
export const COMMUNITY_TARGET_MINUTES:Readonly<Record<CommunityPriority,number>>={
 URGENT:60,HIGH:240,NORMAL:1440,LOW:4320
};
export function communityCaseTiming(row:{priority:string;status:string;createdAt:Date;closedAt:Date|null},asOf:Date){
 if(!COMMUNITY_PRIORITY_ORDER.includes(row.priority as CommunityPriority)||
    !['OPEN','PENDING_REVIEW','RESOLVED_INTERNAL'].includes(row.status)||
    !Number.isFinite(asOf.getTime())||!Number.isFinite(row.createdAt.getTime()))
  throw new Error('Invalid community timing scope');
 const targetMinutes=COMMUNITY_TARGET_MINUTES[row.priority as CommunityPriority];
 const dueAt=new Date(row.createdAt.getTime()+targetMinutes*60000);
 const resolved=row.status==='RESOLVED_INTERNAL';
 if(resolved!==!!row.closedAt||row.closedAt&&(!Number.isFinite(row.closedAt.getTime())||row.closedAt<row.createdAt||row.closedAt>asOf))
  throw new Error('Invalid community closure clock');
 const elapsedAt=row.closedAt??asOf;
 const overdue=elapsedAt.getTime()>=dueAt.getTime();
 return{
  policy:'INTERNAL_ADVISORY_V1' as const,targetMinutes,
  createdAt:row.createdAt.toISOString(),dueAt:dueAt.toISOString(),
  asOf:asOf.toISOString(),elapsedMinutes:Math.max(0,Math.floor((elapsedAt.getTime()-row.createdAt.getTime())/60000)),
  status:resolved?(overdue?'CLOSED_AFTER_TARGET':'CLOSED_BEFORE_TARGET'):(overdue?'OVERDUE':'WITHIN_TARGET'),
  externalNotificationAuthorized:false as const
 };
}
