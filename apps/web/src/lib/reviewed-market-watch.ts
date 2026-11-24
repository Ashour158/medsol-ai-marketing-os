/**
 * A session-scoped, operator-triggered comparison of two authoritative
 * reviewed-signal snapshots. Not a crawler, scheduled alert, or market fact.
 * No source URL, raw evidence, user identity or contact data is exported.
 */
export type WatchTopic={sector:string;topic:string;evidenceCount:number;
 recentSignals90Days:number;distinctSourceHosts:number;lastObservedAt:string;
 freshness:string;priority:string;inferenceAuthorized:false;
 marketShareVerified:false;marketSizingVerified:false};
export type WatchSnapshot={organizationId:string;asOf:string;processed:number;
 registryWindowCappedAt:200;topics:WatchTopic[];
 independentVerification:false;externalPublishingEnabled:false};
export type WatchSelection={sector:string;topic:string};
const key=(sector:string,topic:string)=>JSON.stringify([sector.trim().toLowerCase(),topic.trim().toLowerCase()]);
const text=(s:unknown,max:number)=>typeof s==='string'&&s.trim().length>0&&s.length<=max;
function validate(snapshot:WatchSnapshot,tenant:string){
 if(!snapshot||!tenant||snapshot.organizationId!==tenant||
  snapshot.independentVerification!==false||snapshot.externalPublishingEnabled!==false||
  snapshot.registryWindowCappedAt!==200||!Number.isFinite(Date.parse(snapshot.asOf))||
  !Number.isSafeInteger(snapshot.processed)||snapshot.processed<0||snapshot.processed>200||
  !Array.isArray(snapshot.topics)||snapshot.topics.length>200)
  throw Error("Invalid or foreign reviewed snapshot");
 const result=new Map<string,WatchTopic>();
 let total=0;
 for(const t of snapshot.topics){
  if(!t||!text(t.sector,120)||!text(t.topic,180)||
   t.inferenceAuthorized!==false||t.marketShareVerified!==false||t.marketSizingVerified!==false||
   ![t.evidenceCount,t.recentSignals90Days,t.distinctSourceHosts].every(x=>Number.isSafeInteger(x)&&x>=0&&x<=200)||
   t.evidenceCount<1||t.recentSignals90Days>t.evidenceCount||
   t.distinctSourceHosts>t.evidenceCount||
   !Number.isFinite(Date.parse(t.lastObservedAt))||
   !['STALE','OBSERVED_WITHIN_90_DAYS'].includes(t.freshness)||
   !['MONITOR','RESEARCH_PRIORITY'].includes(t.priority)||
   result.has(key(t.sector,t.topic)))
   throw Error("Invalid or duplicate topic in reviewed snapshot");
  result.set(key(t.sector,t.topic),t);total+=t.evidenceCount;
 }
 if(total!==snapshot.processed)throw Error("Snapshot topic counts do not match reviewed window");
 return result;
}
export function compareReviewedWatch(baseline:WatchSnapshot,current:WatchSnapshot,
 selection:readonly WatchSelection[],tenant:string){
 const old=validate(baseline,tenant),now=validate(current,tenant);
 if(Date.parse(current.asOf)<=Date.parse(baseline.asOf))throw Error("Refresh to a newer reviewed snapshot");
 if(!Array.isArray(selection)||selection.length<1||selection.length>20)
  throw Error("Select 1–20 topics from the reviewed baseline");
 const seen=new Set<string>();
 const changes=selection.map(t=>{
  if(!t||!text(t.sector,120)||!text(t.topic,180))throw Error("Invalid reviewed topic selection");
  const k=key(t.sector,t.topic),a=old.get(k),b=now.get(k);
  if(!a||seen.has(k))throw Error("Unknown or duplicate baseline topic");
  seen.add(k);
  const fields=["evidenceCount","recentSignals90Days","distinctSourceHosts",
   "lastObservedAt","freshness","priority"] as const;
  const changedFields=b?fields.filter(f=>a[f]!==b[f]):[];
  return{sector:a.sector,topic:a.topic,
   status:!b?"NOT_IN_CURRENT_WINDOW" as const:
    changedFields.length?"REVIEWED_WINDOW_CHANGED" as const:"UNCHANGED" as const,
   changedFields,baselineSignals:a.evidenceCount,currentSignals:b?.evidenceCount??null,
   baselinePriority:a.priority,currentPriority:b?.priority??null};
 });
 return{baselineAsOf:baseline.asOf,currentAsOf:current.asOf,changes,
  windowMayBeIncomplete:baseline.processed===200||current.processed===200,
  independentVerification:false as const,marketChangeVerified:false as const,
  scheduledMonitoringActive:false as const,externalEffectsAuthorized:false as const,
  productionStatus:"NOT_CERTIFIED" as const};
}
