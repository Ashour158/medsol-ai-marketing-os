import {createHash} from 'node:crypto';
/** Descriptive campaign KPIs from reviewed, but not cohort-matched, source rows.
 * No sales attribution, true ROI, currency normalization or causal claims.
 * This is the one calculation helper for MarketingPerformanceService; the
 * existing observation/review tables and permissions remain authoritative.
 */
export type ReviewedMetricRow={
 metricKey:string;_sum:{value:bigint|null};_count:{_all:number}
};
const allowed=["impressions","clicks","engagements","leads","qualified_leads","spend_micros"] as const;
export const monetaryKeys=["spend_micros","reported_revenue_micros","reported_gross_profit_micros"] as const;
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
 observedAt:Date;metricKey:string;value:bigint;currency?:string|null;
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
   typeof row.value!=="bigint"||row.value<0n||![...allowed,...monetaryKeys].some(k=>k===row.metricKey))
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

/** Same-source monetary matching; amounts are human-reviewed reports, never
 * verified finance postings, attributed revenue, exchange-rate conversions or ROI. */
export function reconcileReviewedMonetaryCohorts(rows:readonly ReviewedCohortRow[]){
 const base={independentVerification:false as const,attributionValidated:false as const,
  revenueVerified:false as const,roiValidated:false as const,fxConversionPerformed:false as const};
 const empty={...base,matchedGroups:0,incompleteGroups:0,currencyConflictGroups:0,unknownCurrencyRows:0,
  currencies:[] as {currency:string;matchedGroups:number;reportedSpendMicros:string;reportedRevenueMicros:string;
   grossProfitMatchedGroups:number;reportedGrossProfitMicros:string|null}[]};
 if(rows.length>COHORT_ROW_LIMIT)return{...empty,status:"ROW_LIMIT_EXCEEDED" as const};
 const groups=new Map<string,Map<string,ReviewedCohortRow>>();
 let unknownCurrencyRows=0;
 for(const row of rows){
  if(!monetaryKeys.some(k=>k===row.metricKey))continue;
  if(!row.sourceSystem||!row.sourceRecordId||!row.sourceReference||
   !(row.observedAt instanceof Date)||!Number.isFinite(row.observedAt.getTime())||
   typeof row.value!=="bigint"||row.value<0n)throw Error("Invalid monetary source observation");
  if(!row.currency||! /^[A-Z]{3}$/.test(row.currency))unknownCurrencyRows++;
  const key=JSON.stringify([row.sourceSystem,row.sourceRecordId,row.sourceReference,row.observedAt.toISOString()]);
  const group=groups.get(key)??new Map<string,ReviewedCohortRow>();
  if(group.has(row.metricKey))throw Error("Duplicate monetary metric in source record");
  group.set(row.metricKey,row);groups.set(key,group);
 }
 let matchedGroups=0,incompleteGroups=0,currencyConflictGroups=0;
 const amounts=new Map<string,{matchedGroups:number;spend:bigint;revenue:bigint;grossCount:number;gross:bigint}>();
 for(const group of groups.values()){
  const spend=group.get("spend_micros"),revenue=group.get("reported_revenue_micros"),gross=group.get("reported_gross_profit_micros");
  if(!spend||!revenue||!spend.currency||!revenue.currency||! /^[A-Z]{3}$/.test(spend.currency)||! /^[A-Z]{3}$/.test(revenue.currency)){
   incompleteGroups++;continue;
  }
  if(spend.currency!==revenue.currency||(gross&&gross.currency!==spend.currency)){currencyConflictGroups++;continue;}
  const a=amounts.get(spend.currency)??{matchedGroups:0,spend:0n,revenue:0n,grossCount:0,gross:0n};
  a.matchedGroups++;a.spend+=spend.value;a.revenue+=revenue.value;
  if(gross){a.grossCount++;a.gross+=gross.value;}
  matchedGroups++;amounts.set(spend.currency,a);
 }
 const currencies=[...amounts.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([currency,a])=>({
  currency,matchedGroups:a.matchedGroups,reportedSpendMicros:a.spend.toString(),reportedRevenueMicros:a.revenue.toString(),
  grossProfitMatchedGroups:a.grossCount,reportedGrossProfitMicros:a.grossCount?a.gross.toString():null}));
 return{...base,matchedGroups,incompleteGroups,currencyConflictGroups,unknownCurrencyRows,currencies,
  status:matchedGroups===0?"NO_MATCHED_MONETARY_GROUPS" as const:incompleteGroups||currencyConflictGroups||unknownCurrencyRows?
   "PARTIAL_MONETARY_MATCH" as const:"EXACT_MONETARY_SOURCE_MATCH" as const};
}

/** Read-only manifest from the exact same repeatable-read ledger snapshot.
 * No source URLs, names, contact IDs or record IDs are returned. Digests are
 * evidence fingerprints, not digital signatures or independent verification. */
export function reviewedCommercialEvidenceManifest(organizationId:string,campaignId:string,rows:readonly ReviewedCohortRow[]){
 const flags={independentVerification:false as const,attributionValidated:false as const,revenueVerified:false as const,
  roiValidated:false as const,fxConversionPerformed:false as const,signed:false as const,externalEffectsAuthorized:false as const};
 if(rows.length>COHORT_ROW_LIMIT)return{...flags,status:'ROW_LIMIT_EXCEEDED' as const,rowCount:null,sourceDigest:null,groups:[]};
 const groups=new Map<string,ReviewedCohortRow[]>();
 for(const row of rows){
  if(!row.sourceSystem||!row.sourceRecordId||!row.sourceReference||!(row.observedAt instanceof Date)||
   !Number.isFinite(row.observedAt.getTime())||typeof row.value!=='bigint'||row.value<0n||
   ![...allowed,...monetaryKeys].some(k=>k===row.metricKey))throw Error('Invalid reviewed commercial evidence');
  const key=JSON.stringify([row.sourceSystem,row.sourceRecordId,row.sourceReference,row.observedAt.toISOString()]);
  const previous=groups.get(key)??[];
  if(previous.some(r=>r.metricKey===row.metricKey))throw Error('Duplicate reviewed commercial metric');
  previous.push(row);groups.set(key,previous);
 }
 const digest=(value:unknown)=>'sha256:'+createHash('sha256').update(JSON.stringify(value)).digest('hex');
 const records=[...groups.entries()].map(([key,entries])=>{
  const sorted=[...entries].sort((a,b)=>a.metricKey.localeCompare(b.metricKey));
  const metrics=sorted.map(r=>({metricKey:r.metricKey,value:r.value.toString(),currency:r.currency??null}));
  const recordDigest=digest(['medsol-reviewed-commercial-record-v1',organizationId,campaignId,key,metrics]);
  const funnel=reconcileReviewedFunnelCohorts(sorted),money=reconcileReviewedMonetaryCohorts(sorted);
  return{recordDigest,metrics,funnelStatus:funnel.status,monetaryStatus:money.status};
 }).sort((a,b)=>a.recordDigest.localeCompare(b.recordDigest));
 return{...flags,status:'BOUNDED_REVIEWED_SOURCE_MANIFEST' as const,rowCount:rows.length,
  sourceDigest:digest(['medsol-reviewed-commercial-manifest-v1',organizationId,campaignId,records]),groups:records};
}
