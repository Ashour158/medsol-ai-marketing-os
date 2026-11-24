/** Descriptive campaign KPIs from reviewed, but not cohort-matched, source rows.
 * No sales attribution, true ROI, currency normalization or causal claims.
 * This is the one calculation helper for MarketingPerformanceService; the
 * existing observation/review tables and permissions remain authoritative.
 */
export type ReviewedMetricRow={
 metricKey:string;_sum:{value:bigint|null};_count:{_all:number}
};
const allowed=["impressions","clicks","engagements","leads","qualified_leads","spend_micros"] as const;
const ratio=(numerator:bigint|null,denominator:bigint|null)=>{
 if(numerator===null||denominator===null||denominator<=0n||
   numerator<0n||numerator>denominator)return null;
 // Never coerce unbounded original bigint totals into JS floating point.
 return Number(numerator*10000n/denominator)/100;
};
const unitCost=(cost:bigint|null,population:bigint|null)=>{
 if(cost===null||population===null||population<=0n||cost<0n)return null;
 return(cost/population).toString();
};
export function summarizeReviewedCommercialMetrics(rows:readonly ReviewedMetricRow[],
 pendingReviewCount:number){
 if(!Number.isSafeInteger(pendingReviewCount)||pendingReviewCount<0)
  throw Error("Pending metric review count must be nonnegative");
 const totals:Record<string,string>={};
 const observationCounts:Record<string,number>={};
 for(const row of rows){
  if(!allowed.some(k=>k===row.metricKey)||
     Object.hasOwn(totals,row.metricKey)||
     (row._sum.value!==null&&row._sum.value<0n)||
     !Number.isSafeInteger(row._count._all)||row._count._all<1)
   throw Error("Invalid or duplicate reviewed metric aggregate");
  totals[row.metricKey]=(row._sum.value??0n).toString();
  observationCounts[row.metricKey]=row._count._all;
 }
 const get=(key:string)=>Object.hasOwn(totals,key)?BigInt(totals[key]!):null;
 const impressions=get("impressions"),clicks=get("clicks"),
  leads=get("leads"),qualified=get("qualified_leads"),
  spend=get("spend_micros");
 const warnings:string[]=[];
 if(clicks!==null&&impressions!==null&&clicks>impressions)
  warnings.push("CLICKS_EXCEED_IMPRESSIONS");
 if(leads!==null&&clicks!==null&&leads>clicks)
  warnings.push("LEADS_EXCEED_CLICKS");
 if(qualified!==null&&leads!==null&&qualified>leads)
  warnings.push("QUALIFIED_LEADS_EXCEED_LEADS");
 if(pendingReviewCount)warnings.push("QUARANTINED_OBSERVATIONS_EXCLUDED");
 if(rows.length){
  warnings.push("OBSERVATION_COHORTS_NOT_RECONCILED");
  if(spend!==null)warnings.push("SPEND_CURRENCY_NOT_RECONCILED");
 }
 return{
  totals,observationCounts,
  derived:{
   ctrPercent:ratio(clicks,impressions),
   clickToLeadPercent:ratio(leads,clicks),
   leadQualificationPercent:ratio(qualified,leads),
   spendMicrosPerLead:unitCost(spend,leads),
   spendMicrosPerQualifiedLead:unitCost(spend,qualified)
  },
  warnings,
  cohortAligned:false as const,attributionValidated:false as const,
  roiValidated:false as const,revenueVerified:false as const,
  spendCurrencyVerified:false as const,
  pendingReviewCount,
  status:rows.length?
   "REVIEWED_SOURCE_EVIDENCE" as const:
   "INSUFFICIENT_REVIEWED_DATA" as const
 };
}


/** Exact source-record reconciliation, not verified attribution.
 * The existing reviewed observation ledger is the sole input. Rows with
 * different timestamps, references or source record IDs never share a cohort.
 * No monetary totals, currency assumptions, source references or IDs leave
 * this bounded projection. Missing and contradictory groups are excluded.
 */
export const COHORT_ROW_LIMIT=1000;
export type ReviewedCohortRow={
 sourceSystem:string;sourceRecordId:string;sourceReference:string;
 observedAt:Date;metricKey:string;value:bigint;
};
const funnelKeys=["impressions","clicks","leads","qualified_leads"] as const;
export function reconcileReviewedFunnelCohorts(rows:readonly ReviewedCohortRow[]){
 const base={attributionValidated:false as const,roiValidated:false as const,
  revenueVerified:false as const,spendCurrencyVerified:false as const,
  independentVerification:false as const};
 const emptyRates={ctrPercent:null,clickToLeadPercent:null,leadQualificationPercent:null};
 if(rows.length>COHORT_ROW_LIMIT)return{...base,status:"ROW_LIMIT_EXCEEDED" as const,
  matchedGroups:0,incompleteGroups:0,inconsistentGroups:0,excludedNonFunnelRows:0,
  matchedTotals:null,rates:emptyRates};
 const groups=new Map<string,Map<string,bigint>>();
 let excludedNonFunnelRows=0;
 for(const row of rows){
  if(!row.sourceSystem||!row.sourceRecordId||!row.sourceReference||
   !(row.observedAt instanceof Date)||!Number.isFinite(row.observedAt.getTime())||
   typeof row.value!=="bigint"||row.value<0n||!allowed.some(k=>k===row.metricKey))
   throw Error("Invalid reviewed cohort observation");
  if(!funnelKeys.some(k=>k===row.metricKey)){excludedNonFunnelRows++;continue;}
  const key=JSON.stringify([row.sourceSystem,row.sourceRecordId,row.sourceReference,row.observedAt.toISOString()]);
  const metrics=groups.get(key)??new Map<string,bigint>();
  if(metrics.has(row.metricKey))throw Error("Duplicate metric in reviewed source cohort");
  metrics.set(row.metricKey,row.value);groups.set(key,metrics);
 }
 let matchedGroups=0,incompleteGroups=0,inconsistentGroups=0;
 let impressions=0n,clicks=0n,leads=0n,qualified=0n;
 for(const group of groups.values()){
  if(funnelKeys.some(k=>!group.has(k))){incompleteGroups++;continue;}
  const i=group.get("impressions")!,c=group.get("clicks")!,l=group.get("leads")!,q=group.get("qualified_leads")!;
  if(i<c||c<l||l<q){inconsistentGroups++;continue;}
  matchedGroups++;impressions+=i;clicks+=c;leads+=l;qualified+=q;
 }
 return{...base,status:matchedGroups===0?"NO_COMPLETE_MATCHED_GROUPS" as const:
   incompleteGroups||inconsistentGroups?"PARTIAL_SOURCE_MATCH" as const:"EXACT_SOURCE_RECORD_MATCH" as const,
  matchedGroups,incompleteGroups,inconsistentGroups,excludedNonFunnelRows,
  matchedTotals:matchedGroups?{impressions:impressions.toString(),clicks:clicks.toString(),
   leads:leads.toString(),qualifiedLeads:qualified.toString()}:null,
  rates:matchedGroups?{ctrPercent:ratio(clicks,impressions),
   clickToLeadPercent:ratio(leads,clicks),leadQualificationPercent:ratio(qualified,leads)}:emptyRates};
}
