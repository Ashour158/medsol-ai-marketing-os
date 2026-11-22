/** Diagnostic interpretation of the existing reviewed LearningSignal registry.
 * Source diversity is NOT market size, competitive share or verified truth.
 */
export type ReviewedSignal={id:string;topic:string;sector:string;
 sourceUrl:string;sourceTitle:string;observedAt:Date;
 sourcePublishedAt:Date|null};
const days=(now:number,when:Date)=>Math.max(0,Math.floor((now-when.getTime())/86400000));
export function reviewedMarketSignals(signals:readonly ReviewedSignal[],now:Date){
 if(!Number.isFinite(now.getTime()))throw Error("Market intelligence snapshot clock invalid");
 const groups=new Map<string,{topic:string;sector:string;signals:ReviewedSignal[]}>();
 for(const item of signals){
  const key=item.sector.toLowerCase()+"::"+item.topic.toLowerCase();
  const group=groups.get(key)??{topic:item.topic,sector:item.sector,signals:[]};
  group.signals.push(item);groups.set(key,group);
 }
 const topics=[...groups.values()].map(group=>{
  const recent=group.signals.filter(item=>days(now.getTime(),item.observedAt)<=90).length;
  const hosts=new Set(group.signals.map(item=>{
   try{const url=new URL(item.sourceUrl);
    return url.protocol==="https:"?url.hostname.toLowerCase():"UNVERIFIED_SOURCE";}
   catch{return "UNVERIFIED_SOURCE";}
  }).filter(x=>x!=="UNVERIFIED_SOURCE"));
  const last=group.signals.reduce((a,b)=>a.observedAt>b.observedAt?a:b);
  const stale=days(now.getTime(),last.observedAt);
  return{
   topic:group.topic,sector:group.sector,evidenceCount:group.signals.length,
   recentSignals90Days:recent,distinctSourceHosts:hosts.size,
   lastObservedAt:last.observedAt.toISOString(),ageDays:stale,
   freshness:stale>90?"STALE":"OBSERVED_WITHIN_90_DAYS",
   sourceCoverage:hosts.size>=2?"MULTIPLE_SOURCE_HOSTS":"SINGLE_OR_UNKNOWN_HOST",
   evidence:group.signals.slice(0,10).map(item=>({
    signalId:item.id,title:item.sourceTitle,url:item.sourceUrl,
    publishedAt:item.sourcePublishedAt})),
   priority:recent>=3&&hosts.size>=2?"RESEARCH_PRIORITY":"MONITOR",
   status:"HUMAN_REVIEWED_NOT_INDEPENDENTLY_VERIFIED",
   inferenceAuthorized:false,marketShareVerified:false,
   competitorClaimVerified:false,marketSizingVerified:false
  };
 }).sort((a,b)=>b.recentSignals90Days-a.recentSignals90Days||
  b.distinctSourceHosts-a.distinctSourceHosts||a.topic.localeCompare(b.topic));
 return{
  topics,processed:signals.length,asOf:now.toISOString(),
  sourceType:"LEARNING_SIGNAL_REGISTRY" as const,
  registryWindowCappedAt:200 as const,
  independentVerification:false as const,marketSizeVerified:false as const,
  externalPublishingEnabled:false as const
 };
}
