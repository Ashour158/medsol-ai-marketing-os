/** Shared CSV encoding for unsigned, offline customer intelligence and revenue
 * scenario exports. No side effects, new business owners or provider calls.
 */
import {modelOfflineRevenueScenarios,type RevenueScenarioInput} from './offline-revenue-scenarios';
const fail=(message:string):never=>{throw Error('OFFLINE_CSV_BLOCKED: '+message);};
const quote=(raw:unknown)=>{
 let value=raw===null||raw===undefined?'':String(raw);
 if(/^\s*[=+@-]/.test(value))value="'"+value;
 return '"'+value.replaceAll('"','""')+'"';
};
const csv=(rows:readonly (readonly unknown[])[])=>
 rows.map(row=>row.map(quote).join(',')).join('\r\n')+'\r\n';
export function revenueScenarioCsv(input:RevenueScenarioInput,
 result:ReturnType<typeof modelOfflineRevenueScenarios>,campaignId:string){
 if(!/^[A-Za-z0-9_-]{1,128}$/.test(campaignId)||
  result?.measuredRevenue!==false||
  result.causalAttributionValidated!==false||
  result.externalEffectsAuthorized!==false||
  JSON.stringify(result)!==JSON.stringify(modelOfflineRevenueScenarios(input)))
  fail('Scenario evidence changed or contains unverifiable revenue');
 const rows:unknown[][]=[
  ['section','case','metric','value','qualification'],
  ['source','campaign_id','id',campaignId,'REVIEWED_SOURCE_ONLY'],
  ['assumption','currency','ISO-style',input.currency,'NOT_VERIFIED_SPEND_CURRENCY'],
  ['assumption','qualified_leads','reviewed',input.reviewedQualifiedLeads,'NOT_CRM_VERIFIED'],
  ['assumption','average_deal_value','major_units',input.assumedDealValueMajor,'HYPOTHETICAL'],
  ['assumption','base_close_rate','basis_points',input.closeRateBasisPoints,'HYPOTHETICAL'],
  ['assumption','gross_margin','basis_points',input.marginBasisPoints,'HYPOTHETICAL']
 ];
 for(const x of result.scenarios){
  rows.push(['scenario',x.name,'close_rate_basis_points',x.closeRateBasisPoints,'HYPOTHETICAL']);
  rows.push(['scenario',x.name,'expected_wins_hundredths',x.expectedWinsHundredths,'NOT_CRM_VERIFIED']);
  rows.push(['scenario',x.name,'illustrative_revenue_major',x.illustrativeGrossRevenueMajor,'NOT_MEASURED_REVENUE']);
  rows.push(['scenario',x.name,'illustrative_contribution_major',x.illustrativeGrossContributionMajor,'NOT_FINANCIAL_POSTING']);
 }
 rows.push(['release','all','production_status','NOT_CERTIFIED','UNSIGNED_OFFLINE_ONLY']);
 return csv(rows);
}
export type MarketExportTopic={
 topic:string;sector:string;evidenceCount:number;recentSignals90Days:number;
 distinctSourceHosts:number;freshness:string;priority:string;
 evidence:Array<{signalId:string;title:string;url:string;publishedAt:string|null}>;
 marketShareVerified:false;marketSizingVerified:false;inferenceAuthorized:false;
};
export type MarketExportBrief={
 organizationId:string;asOf:string;processed:number;topics:MarketExportTopic[];
 independentVerification:false;externalPublishingEnabled:false;
};
export function reviewedMarketCsv(brief:MarketExportBrief,filtered:readonly MarketExportTopic[],
 tenantId:string){
 if(brief?.organizationId!==tenantId||!tenantId||
  brief.independentVerification!==false||brief.externalPublishingEnabled!==false||
  !Array.isArray(brief.topics)||brief.topics.length>200||
  !Array.isArray(filtered)||filtered.length>200||
  !Number.isSafeInteger(brief.processed)||brief.processed<0||brief.processed>200||
  !Number.isFinite(Date.parse(brief.asOf)))
  fail('Invalid or unsafe market evidence source');
 const source=new Set(brief.topics);
 if(filtered.some(t=>!source.has(t)||t.marketShareVerified!==false||
  t.marketSizingVerified!==false||t.inferenceAuthorized!==false||
  !Array.isArray(t.evidence)||t.evidence.length>10))
  fail('Unreviewed or forged topic selection');
 const rows:unknown[][]=[['section','sector','topic','metric','value','qualification']];
 for(const topic of filtered){
  rows.push(['reviewed_topic',topic.sector,topic.topic,'reviewed_signals',
   topic.evidenceCount,'HUMAN_REVIEWED_NOT_INDEPENDENTLY_VERIFIED']);
  rows.push(['reviewed_topic',topic.sector,topic.topic,'recent_90_days',
   topic.recentSignals90Days,'RESEARCH_TRIAGE_ONLY']);
  rows.push(['reviewed_topic',topic.sector,topic.topic,'distinct_source_hosts',
   topic.distinctSourceHosts,'NOT_MARKET_SHARE']);
  rows.push(['reviewed_topic',topic.sector,topic.topic,'priority',
   topic.priority,'NOT_BUSINESS_RECOMMENDATION']);
  for(const e of topic.evidence){
   let url:string;
   try{const parsed=new URL(e.url);url=parsed.protocol==='https:'?e.url:'UNVERIFIED_SOURCE';}
   catch{url='UNVERIFIED_SOURCE';}
   rows.push(['source_citation',topic.sector,topic.topic,e.title,url,
    'CITED_NOT_INDEPENDENTLY_VERIFIED']);
  }
 }
 rows.push(['release','','','production_status','NOT_CERTIFIED','UNSIGNED_OFFLINE_ONLY']);
 return csv(rows);
}
export function saveOfflineCsv(content:string,name:string){
 if(!/^[a-z0-9_-]{1,128}\.csv$/.test(name)||content.length>1_000_000)
  fail('Invalid or oversized offline CSV export');
 const url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'}));
 const anchor=document.createElement('a');
 anchor.href=url;anchor.download=name;document.body.appendChild(anchor);
 anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
