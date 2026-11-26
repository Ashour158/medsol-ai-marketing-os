/** Shared, read-only arithmetic over the existing reviewed commercial manifest.
 * Exact source-record identity comes from MarketingPerformanceService, not a
 * second ledger. This is descriptive evidence, never causal attribution.
 */
export type CombinedCommercialManifest={
 status:string;sourceDigest:string|null;rowCount:number|null;
 independentVerification:false;attributionValidated:false;revenueVerified:false;
 roiValidated:false;fxConversionPerformed:false;signed:false;externalEffectsAuthorized:false;
 groups:readonly {recordDigest:string;funnelStatus:string;monetaryStatus:string;
  metrics:readonly {metricKey:string;value:string;currency:string|null}[]}[];
};
const digest=(v:unknown)=>typeof v==='string'&&/^sha256:[a-f0-9]{64}$/.test(v);
const keys=['impressions','clicks','engagements','leads','qualified_leads','spend_micros','reported_revenue_micros','reported_gross_profit_micros'];
const money=keys.slice(5);
const decimal=(a:bigint,b:bigint):string|null=>{
 if(b<=0n)return null;
 const scaled=a*10000n/b;
 return (scaled/10000n).toString()+'.'+(scaled%10000n).toString().padStart(4,'0');
};
const unit=(a:bigint,b:bigint)=>b>0n?(a/b).toString():null;
type Totals={groups:number;impressions:bigint;clicks:bigint;leads:bigint;qualified:bigint;
 spend:bigint;revenue:bigint;gross:bigint;grossGroups:number};
export function combinedReviewedCommercial(manifest:CombinedCommercialManifest){
 const flags={independentVerification:false as const,attributionValidated:false as const,revenueVerified:false as const,
  roiValidated:false as const,fxConversionPerformed:false as const,externalEffectsAuthorized:false as const};
 const base={...flags,sourceDigest:manifest.sourceDigest,matchedGroups:0,excludedGroups:0,invalidGrossProfitGroups:0,
  currencies:[] as Array<{currency:string;matchedGroups:number;impressions:string;clicks:string;leads:string;qualifiedLeads:string;
   reportedSpendMicros:string;reportedRevenueMicros:string;reportedGrossProfitMicros:string|null;grossProfitMatchedGroups:number;
   spendMicrosPerLead:string|null;spendMicrosPerQualifiedLead:string|null;reportedRevenueToSpendRatio:string|null}>};
 if(!manifest||manifest.independentVerification!==false||manifest.attributionValidated!==false||manifest.revenueVerified!==false||
  manifest.roiValidated!==false||manifest.fxConversionPerformed!==false||manifest.signed!==false||manifest.externalEffectsAuthorized!==false)
  throw Error('Invalid reviewed commercial provenance');
 if(manifest.status==='ROW_LIMIT_EXCEEDED'){
  if(manifest.sourceDigest!==null||manifest.rowCount!==null||manifest.groups.length!==0)throw Error('Invalid bounded manifest refusal');
  return{...base,status:'ROW_LIMIT_EXCEEDED' as const};
 }
 if(manifest.status!=='BOUNDED_REVIEWED_SOURCE_MANIFEST'||!digest(manifest.sourceDigest)||!Array.isArray(manifest.groups)||
  !Number.isSafeInteger(manifest.rowCount)||manifest.rowCount===null||manifest.rowCount<0||manifest.rowCount>1000||manifest.groups.length>1000)
  throw Error('Invalid combined commercial source scope');
 const groups=new Set<string>(),totals=new Map<string,Totals>();let count=0,matchedGroups=0,excludedGroups=0,invalidGrossProfitGroups=0;
 for(const group of manifest.groups){
  if(!digest(group.recordDigest)||groups.has(group.recordDigest)||!Array.isArray(group.metrics)||!group.metrics.length||group.metrics.length>keys.length)
   throw Error('Invalid combined record identity');
  groups.add(group.recordDigest);
  const byKey=new Map<string,{value:bigint;currency:string|null}>();
  for(const r of group.metrics){
   if(!keys.includes(r.metricKey)||byKey.has(r.metricKey)||typeof r.value!=='string'||!/^(0|[1-9][0-9]{0,24})$/.test(r.value)||
    (r.currency!==null&&(!money.includes(r.metricKey)||! /^[A-Z]{3}$/.test(r.currency)))||
    (r.metricKey.startsWith('reported_')&&r.currency===null))throw Error('Invalid combined commercial observation');
   byKey.set(r.metricKey,{value:BigInt(r.value),currency:r.currency});count++;
  }
  const i=byKey.get('impressions'),c=byKey.get('clicks'),l=byKey.get('leads'),q=byKey.get('qualified_leads');
  const s=byKey.get('spend_micros'),r=byKey.get('reported_revenue_micros'),g=byKey.get('reported_gross_profit_micros');
  if(group.funnelStatus!=='EXACT_SOURCE_RECORD_MATCH'||group.monetaryStatus!=='EXACT_MONETARY_SOURCE_MATCH'||
   !i||!c||!l||!q||i.value<c.value||c.value<l.value||l.value<q.value||!s||!r||!s.currency||s.currency!==r.currency||
   (g&&g.currency!==s.currency)){excludedGroups++;continue;}
  if(g&&g.value>r.value){invalidGrossProfitGroups++;excludedGroups++;continue;}
  const a=totals.get(s.currency)??{groups:0,impressions:0n,clicks:0n,leads:0n,qualified:0n,spend:0n,revenue:0n,gross:0n,grossGroups:0};
  a.groups++;a.impressions+=i.value;a.clicks+=c.value;a.leads+=l.value;a.qualified+=q.value;
  a.spend+=s.value;a.revenue+=r.value;if(g){a.gross+=g.value;a.grossGroups++;}
  totals.set(s.currency,a);matchedGroups++;
 }
 if(count!==manifest.rowCount)throw Error('Combined commercial manifest row count mismatch');
 const currencies=[...totals.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([currency,a])=>({
  currency,matchedGroups:a.groups,impressions:a.impressions.toString(),clicks:a.clicks.toString(),leads:a.leads.toString(),
  qualifiedLeads:a.qualified.toString(),reportedSpendMicros:a.spend.toString(),reportedRevenueMicros:a.revenue.toString(),
  reportedGrossProfitMicros:a.grossGroups===a.groups?a.gross.toString():null,grossProfitMatchedGroups:a.grossGroups,
  spendMicrosPerLead:unit(a.spend,a.leads),spendMicrosPerQualifiedLead:unit(a.spend,a.qualified),
  reportedRevenueToSpendRatio:decimal(a.revenue,a.spend)
 }));
 return{...base,matchedGroups,excludedGroups,invalidGrossProfitGroups,currencies,
  status:matchedGroups===0?'NO_COMPLETE_COMBINED_GROUPS' as const:excludedGroups?'PARTIAL_COMBINED_MATCH' as const:'EXACT_COMBINED_MATCH' as const};
}
