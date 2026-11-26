/** Read-only, bounded editorial calendar over existing exact creative scopes.
 * No scheduling writes, provider optimization claims or approval inheritance. */
export type EditorialEntry={approvalId:string;assetId:string;revisionId:string;channel:string;destinationRef:string;
 scheduledAt:string;expiresAt:string;approvalDecision:string;publicationStatus:string|null;current:boolean};
const MINUTE=60000;
export function editorialCalendar(entries:readonly EditorialEntry[],start:string,end:string,spacingMinutes:number){
 const lower=Date.parse(start),upper=Date.parse(end);
 if(!Number.isFinite(lower)||!Number.isFinite(upper)||upper<=lower||upper-lower>31*86400000||
  !Number.isSafeInteger(spacingMinutes)||spacingMinutes<15||spacingMinutes>1440||entries.length>200)
  throw Error('Bounded editorial calendar input required');
 const minGap=spacingMinutes*MINUTE;
 const relevant=entries.filter(x=>x.current&&x.approvalDecision!=='REJECTED'&&
  !['CANCELLED','DISPATCH_HELD','EXPIRED_NOT_SENT'].includes(x.publicationStatus??''));
 const visible=entries.filter(x=>Date.parse(x.scheduledAt)>=lower&&Date.parse(x.scheduledAt)<upper)
  .sort((a,b)=>a.scheduledAt.localeCompare(b.scheduledAt)||a.approvalId.localeCompare(b.approvalId));
 const conflicts: {approvalId:string;conflictingApprovalId:string;distanceMinutes:number}[]=[];
 const pairs=new Set<string>();
 for(const row of visible){
  if(!relevant.includes(row))continue;
  for(const other of relevant){
   if(other.approvalId===row.approvalId||other.channel!==row.channel||other.destinationRef!==row.destinationRef)continue;
   const delta=Math.abs(Date.parse(other.scheduledAt)-Date.parse(row.scheduledAt));
   const pair=[row.approvalId,other.approvalId].sort().join(':');
   if(delta<minGap&&!pairs.has(pair)){pairs.add(pair);conflicts.push({approvalId:row.approvalId,conflictingApprovalId:other.approvalId,distanceMinutes:delta/MINUTE});}
  }
 }
 // Suggestions are advisory only: use 15-minute UTC steps; no DST or audience
 // engagement assumptions and never reuse an existing approval on a new time.
 const suggestions=visible.filter(x=>conflicts.some(c=>c.approvalId===x.approvalId||c.conflictingApprovalId===x.approvalId)).map(row=>{
  const original=Date.parse(row.scheduledAt);
  const occupied=relevant.filter(x=>x.approvalId!==row.approvalId&&x.channel===row.channel&&x.destinationRef===row.destinationRef);
  let proposed:string|null=null;
  for(let t=Math.ceil(Math.max(lower,original+15*MINUTE)/(15*MINUTE))*15*MINUTE;t<upper;t+=15*MINUTE){
   if(occupied.every(x=>Math.abs(Date.parse(x.scheduledAt)-t)>=minGap)){proposed=new Date(t).toISOString();break;}
  }
  return{approvalId:row.approvalId,proposedScheduledAt:proposed,requiresNewExactApproval:true as const};
 });
 return{entries:visible,conflicts,suggestions,spacingMinutes,externalEffectsAuthorized:false as const,
  scheduleChanged:false as const,engagementOptimizationVerified:false as const};
}
