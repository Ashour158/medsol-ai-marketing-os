import {describe,it,expect} from 'vitest';
import {modelOfflineRevenueScenarios,type RevenueScenarioInput} from './offline-revenue-scenarios';
import {revenueScenarioCsv,reviewedMarketCsv,type MarketExportBrief} from './offline-evidence-csv';
const input:RevenueScenarioInput={reviewedQualifiedLeads:'120',
 sourceStatus:'REVIEWED_SOURCE_EVIDENCE',currency:'EGP',
 assumedDealValueMajor:'5000',closeRateBasisPoints:1000,marginBasisPoints:3500};
const market=():MarketExportBrief=>({
 organizationId:'tenant-a',asOf:'2026-11-23T10:00:00Z',processed:1,
 independentVerification:false,externalPublishingEnabled:false,
 topics:[{topic:'=HYPERLINK("https://evil.invalid")',sector:'biotechnology',
  evidenceCount:1,recentSignals90Days:1,distinctSourceHosts:1,
  freshness:'OBSERVED_WITHIN_90_DAYS',priority:'MONITOR',
  marketShareVerified:false,marketSizingVerified:false,inferenceAuthorized:false,
  evidence:[{signalId:'signal-1',title:'External source',url:'https://source.example.org',
   publishedAt:null}]}]
});
describe('T8B source-bound offline customer exports',()=>{
 it('recomputes all scenario arithmetic and never labels hypothetical wins as actual revenue',()=>{
  const csv=revenueScenarioCsv(input,modelOfflineRevenueScenarios(input),'campaign-1');
  expect(csv).toContain('NOT_MEASURED_REVENUE');
  expect(csv).toContain('NOT_CRM_VERIFIED');
  expect(csv).toContain('NOT_CERTIFIED');
  expect(csv).toContain('HYPOTHETICAL');
  expect(csv).not.toContain('VERIFIED_ROI');
 });
 it('blocks changed assumptions, fake revenue and altered scenario output',()=>{
  const result=modelOfflineRevenueScenarios(input);
  expect(()=>revenueScenarioCsv({...input,closeRateBasisPoints:1100},result,'campaign-1'))
   .toThrow('Scenario evidence changed');
  expect(()=>revenueScenarioCsv(input,{...result,measuredRevenue:true as false},
   'campaign-1')).toThrow('Scenario evidence changed');
  expect(()=>revenueScenarioCsv(input,result,'../foreign')).toThrow('Scenario evidence changed');
 });
 it('exports filtered tenant-wide citations safely, escaping formula-prefixed topics',()=>{
  const b=market();const csv=reviewedMarketCsv(b,b.topics,'tenant-a');
  expect(csv).toContain("'=HYPERLINK");
  expect(csv).toContain('https://source.example.org');
  expect(csv).toContain('HUMAN_REVIEWED_NOT_INDEPENDENTLY_VERIFIED');
  expect(csv).toContain('NOT_MARKET_SHARE');
  expect(csv).toContain('NOT_CERTIFIED');
 });
 it('rejects cross-tenant exports, forged topics and false independent verification',()=>{
  const b=market();
  expect(()=>reviewedMarketCsv(b,b.topics,'tenant-b')).toThrow('Invalid or unsafe');
  expect(()=>reviewedMarketCsv({...b,independentVerification:true as false},
   b.topics,'tenant-a')).toThrow('Invalid or unsafe');
  expect(()=>reviewedMarketCsv(b,[{...b.topics[0]!}], 'tenant-a'))
   .toThrow('Unreviewed or forged');
 });
});
