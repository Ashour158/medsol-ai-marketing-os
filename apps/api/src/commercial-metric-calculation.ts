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
