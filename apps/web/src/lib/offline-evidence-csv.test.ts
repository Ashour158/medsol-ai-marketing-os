import {describe,it,expect} from 'vitest';
import {modelOfflineRevenueScenarios,type RevenueScenarioInput} from './offline-revenue-scenarios';
import {revenueScenarioCsv,reviewedMarketCsv,socialSimulationCsv,emailSimulationCsv,
 type SocialTrialExport,type EmailTrialExport,type MarketExportBrief} from './offline-evidence-csv';
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

const social=():SocialTrialExport=>({
 status:'OUTCOME_UNKNOWN',replayed:false,sandboxReceiptOnly:true,
 externalEffectsAuthorized:false,
 simulation:{providerKey:'META_GRAPH',scenario:'TIMEOUT_AFTER_ACCEPT',
  outcome:'OUTCOME_UNKNOWN',transport:'SYNTHETIC_TIMEOUT',
  readback:'SYNTHETIC_DELAYED',virtualCallbackCount:0,
  deduplicatedVirtualCallbackCount:0,realProviderRequests:0,
  verifiedRemoteReceipts:0,automaticRetryAllowed:false,externalEffectsAuthorized:false,
  token:'internal-do-not-export'}
} as SocialTrialExport);
const email=():EmailTrialExport=>({
 status:'SIMULATED',externalEffectsAuthorized:false,replayed:false,
 results:{syntheticRecipients:2,syntheticEligible:1,withdrawn:1,
  complaintSuppressed:0,missingConsent:0,actualMessagesSent:0,
  verifiedProviderReceipts:0,syntheticJourneyPlan:{
   requiresFreshConsentAtExecution:true,
   steps:[{key:'welcome',scheduledAt:'2026-11-23T10:00:00Z',
    scenario:'ACCEPTED',virtualOutcomeUnknown:0}]
  },recipientEmail:'private@example.com'}
} as EmailTrialExport);
describe('T8D directly exported social and email rehearsal evidence',()=>{
 it('exports ambiguous social delivery without retry or real receipt and excludes secret data',()=>{
  const value=socialSimulationCsv(social());
  expect(value).toContain('TIMEOUT_AFTER_ACCEPT');
  expect(value).toContain('OUTCOME_UNKNOWN');
  expect(value).toContain('NOT_REMOTE_DELIVERY');
  expect(value).toContain('NOT_CERTIFIED');
  expect(value).not.toContain('internal-do-not-export');
 });
 it('rejects forged live social receipts, inconsistent outcomes and callback counts',()=>{
  for(const override of [
   {externalEffectsAuthorized:true},
   {simulation:{...social().simulation,realProviderRequests:1}},
   {simulation:{...social().simulation,automaticRetryAllowed:true}},
   {status:'SIMULATED'},
   {simulation:{...social().simulation,virtualCallbackCount:0,deduplicatedVirtualCallbackCount:2}}
  ])expect(()=>socialSimulationCsv({...social(),...override} as SocialTrialExport))
   .toThrow('provenance or safety');
 });
 it('exports anonymous synthetic email counts, no recipient identifiers',()=>{
  const value=emailSimulationCsv(email());
  expect(value).toContain('MOCK_OPT_IN_NOT_LEGAL_CONSENT');
  expect(value).toContain('NOT_CERTIFIED');
  expect(value).toContain('2026-11-23T10:00:00Z');
  expect(value).not.toContain('private@example.com');
  expect(value).not.toContain('contactId');
 });
 it('rejects fake email delivery, inconsistent audience and unsafe schedule',()=>{
  for(const change of [
   {externalEffectsAuthorized:true},
   {results:{...email().results,actualMessagesSent:1}},
   {results:{...email().results,syntheticEligible:3}},
   {results:{...email().results,verifiedProviderReceipts:1}},
   {status:'BLOCKED'},
   {results:{...email().results,syntheticJourneyPlan:{
     requiresFreshConsentAtExecution:true,
     steps:[{key:'bad',scheduledAt:'not-date',scenario:'ACCEPTED',virtualOutcomeUnknown:0}]
   }}}
  ])expect(()=>emailSimulationCsv({...email(),...change} as EmailTrialExport))
   .toThrow('invariants');
 });
});
