import {describe,it,expect} from 'vitest';
import {modelOfflineConversionFunnel,type OfflineConversionInput}
 from './offline-revenue-scenarios';
import {conversionFunnelCsv} from './offline-evidence-csv';
const fixture=():OfflineConversionInput=>({
 virtualVisits:'100',virtualCtaClicks:'20',virtualFormSubmissions:'8',
 virtualQualifiedLeads:'3',failureCase:'NONE'
});
describe('T8E anonymous offline conversion and form preview',()=>{
 it('models a consistent full funnel with exact bounded ratios and no real lead record',()=>{
  const r=modelOfflineConversionFunnel(fixture());
  expect(r.rates).toEqual({clickThroughPercent:'20.00',
   formCompletionPercent:'40.00',qualifiedPercent:'37.50',
   visitToQualifiedPercent:'3.00'});
  expect(r).toMatchObject({source:'ANONYMOUS_OFFLINE_FIXTURE',
   status:'SIMULATED_COUNTS_ONLY',actualVisitorsObserved:0,
   actualLeadsCreated:0,crmHandoffsExecuted:0,
   measuredConversions:false,causalAttributionValidated:false,
   legalConsentVerified:false,externalEffectsAuthorized:false,
   productionStatus:'NOT_CERTIFIED'});
  const csv=conversionFunnelCsv(fixture(),r);
  expect(csv).toContain('ANONYMOUS_SYNTHETIC_ONLY');
  expect(csv).toContain('NOT_CRM_VERIFIED');
  expect(csv).toContain('NOT_CERTIFIED');
 });
 it('returns null percentages on an empty fake funnel, not NaN or Infinity',()=>{
  const r=modelOfflineConversionFunnel({...fixture(),virtualVisits:'0',
   virtualCtaClicks:'0',virtualFormSubmissions:'0',virtualQualifiedLeads:'0'});
  expect(r.rates.clickThroughPercent).toBeNull();
  expect(r.rates.visitToQualifiedPercent).toBeNull();
 });
 it('blocks contradictory counts, huge input and invalid number encodings',()=>{
  for(const f of [
   {virtualVisits:'5'}, {virtualCtaClicks:'101'},
   {virtualFormSubmissions:'21'},{virtualQualifiedLeads:'9'},
   {virtualVisits:'9999999999'},{virtualVisits:'1.0'},
   {virtualVisits:'=SUM(1,2)'},{virtualVisits:'-1'},
   {failureCase:'UNSAFE_EXTERNAL_SEND'}
  ])expect(()=>modelOfflineConversionFunnel({...fixture(),...f} as OfflineConversionInput))
   .toThrow();
 });
 it('explicitly blocks fake consent, duplicates, bots and throttles without a CRM write',()=>{
  for(const failureCase of ['MOCK_CONSENT_DENIED','DUPLICATE_ATTEMPT',
   'BOT_REJECTED','RATE_LIMITED'] as const){
   const r=modelOfflineConversionFunnel({...fixture(),failureCase});
   expect(r).toMatchObject({status:'MOCK_SUBMISSION_BLOCKED',
    actualLeadsCreated:0,crmHandoffsExecuted:0});
   expect(conversionFunnelCsv({...fixture(),failureCase},r)).toContain(
    'NO_REAL_FORM_SUBMISSION');
  }
 });
 it('refuses an edited conversion status, real CRM count or different input when exporting',()=>{
  const data=fixture(),r=modelOfflineConversionFunnel(data);
  expect(()=>conversionFunnelCsv({...data,virtualQualifiedLeads:'4'},r))
   .toThrow('does not match');
  expect(()=>conversionFunnelCsv(data,{...r,actualLeadsCreated:1 as 0}))
   .toThrow('does not match');
  expect(()=>conversionFunnelCsv(data,{...r,productionStatus:'CERTIFIED' as 'NOT_CERTIFIED'}))
   .toThrow('does not match');
 });
});
