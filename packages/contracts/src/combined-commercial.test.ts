import {describe,it,expect} from 'vitest';
import {combinedReviewedCommercial as combine,type CombinedCommercialManifest} from './combined-commercial.js';
const fp=(n:number)=>'sha256:'+n.toString(16).padStart(64,'0');
const group=(n:number,currency='EGP',spend='1000000',revenue='5000000',gross?:string)=>({
 recordDigest:fp(n),funnelStatus:'EXACT_SOURCE_RECORD_MATCH',monetaryStatus:'EXACT_MONETARY_SOURCE_MATCH',
 metrics:[{metricKey:'impressions',value:'100',currency:null},{metricKey:'clicks',value:'20',currency:null},
 {metricKey:'leads',value:'8',currency:null},{metricKey:'qualified_leads',value:'4',currency:null},
 {metricKey:'spend_micros',value:spend,currency},{metricKey:'reported_revenue_micros',value:revenue,currency},
 ...(gross===undefined?[]:[{metricKey:'reported_gross_profit_micros',value:gross,currency}])]
});
const manifest=(groups:CombinedCommercialManifest['groups']):CombinedCommercialManifest=>({
 status:'BOUNDED_REVIEWED_SOURCE_MANIFEST',sourceDigest:fp(999),rowCount:groups.reduce((n,g)=>n+g.metrics.length,0),
 independentVerification:false,attributionValidated:false,revenueVerified:false,roiValidated:false,
 fxConversionPerformed:false,signed:false,externalEffectsAuthorized:false,groups
});
describe('Combined reviewed commercial reconciliation',()=>{
 it('aggregates only complete same-record evidence within each currency; no FX or certified ROI',()=>{
  const report=combine(manifest([group(1,'EGP','1000000','5000000','2000000'),group(2,'EGP','2000000','6000000'),
   group(3,'USD','0','1000000','500000')]));
  expect(report).toMatchObject({status:'EXACT_COMBINED_MATCH',matchedGroups:3,excludedGroups:0,attributionValidated:false,
   roiValidated:false,revenueVerified:false,fxConversionPerformed:false,currencies:[
    {currency:'EGP',matchedGroups:2,impressions:'200',leads:'16',qualifiedLeads:'8',reportedSpendMicros:'3000000',
     reportedRevenueMicros:'11000000',reportedGrossProfitMicros:null,grossProfitMatchedGroups:1,
     spendMicrosPerLead:'187500',spendMicrosPerQualifiedLead:'375000',reportedRevenueToSpendRatio:'3.6666'},
    {currency:'USD',reportedGrossProfitMicros:'500000',reportedRevenueToSpendRatio:null}
   ]});
 });
 it('excludes disconnected, contradictory and currency-conflicting records and gross profit exceeding revenue',()=>{
  const a=group(1),b=group(2),c=group(3),d=group(4,'EGP','10','20','21');
  a.metrics=a.metrics.filter(r=>r.metricKey!=='leads'); b.metrics[1]!.value='101';c.metrics[5]!.currency='USD';
  expect(combine(manifest([a,b,c,d,group(5)]))).toMatchObject({status:'PARTIAL_COMBINED_MATCH',matchedGroups:1,
   excludedGroups:4,invalidGrossProfitGroups:1,currencies:[{currency:'EGP',leads:'8'}]});
 });
 it('refuses malformed amounts, duplicate fingerprints and false provenance; handles limits and zero denominators',()=>{
  const m=manifest([group(1)]);
  expect(()=>combine({...m,rowCount:99})).toThrow('row count');
  expect(()=>combine(manifest([group(1),group(1)]))).toThrow('identity');
  expect(()=>combine({...m,roiValidated:true as false})).toThrow('provenance');
  const invalid=group(1);invalid.metrics[0]!.value='-1';expect(()=>combine(manifest([invalid]))).toThrow('observation');
  const zero=group(2);zero.metrics[2]!.value='0';zero.metrics[3]!.value='0';
  expect(combine(manifest([zero])).currencies[0]).toMatchObject({spendMicrosPerLead:null,spendMicrosPerQualifiedLead:null});
  expect(combine({...manifest([]),status:'ROW_LIMIT_EXCEEDED',sourceDigest:null,rowCount:null})).toMatchObject({status:'ROW_LIMIT_EXCEEDED',currencies:[]});
 });
});
