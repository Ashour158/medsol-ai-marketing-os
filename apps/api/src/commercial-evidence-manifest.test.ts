import {describe,it,expect} from 'vitest';
import {reviewedCommercialEvidenceManifest as build,COHORT_ROW_LIMIT,type ReviewedCohortRow} from './commercial-metric-calculation.js';
const row=(metricKey:string,value:bigint,currency:string|null=null):ReviewedCohortRow=>({
 sourceSystem:'MANUAL_EXPORT',sourceRecordId:'private-record',sourceReference:'internal:private-source',
 observedAt:new Date('2026-11-25T12:00:00Z'),metricKey,value,currency});
describe('Reviewed source evidence manifest',()=>{
 it('binds exact source tuple and values to stable tenant/campaign fingerprint; exports no source identities',()=>{
  const rows=[row('spend_micros',1n,'EGP'),row('reported_revenue_micros',5n,'EGP')];
  const m=build('org','campaign',rows);
  expect(m).toEqual(build('org','campaign',[...rows].reverse()));
  expect(m).toMatchObject({rowCount:2,signed:false,attributionValidated:false,fxConversionPerformed:false,
   groups:[{monetaryStatus:'EXACT_MONETARY_SOURCE_MATCH',metrics:[{metricKey:'reported_revenue_micros',value:'5',currency:'EGP'},{metricKey:'spend_micros',value:'1',currency:'EGP'}]}]});
  expect(m.sourceDigest).not.toBe(build('other','campaign',rows).sourceDigest);
  expect(m.sourceDigest).not.toBe(build('org','other',rows).sourceDigest);
  expect(m.sourceDigest).not.toBe(build('org','campaign',[{...rows[0]!,sourceReference:'internal:changed'},rows[1]!]).sourceDigest);
  expect(JSON.stringify(m)).not.toContain('private-record');expect(JSON.stringify(m)).not.toContain('private-source');
 });
 it('fails closed at the bound and on duplicates',()=>{
  const r=row('impressions',10n);
  expect(build('org','campaign',Array.from({length:COHORT_ROW_LIMIT+1},()=>r))).toMatchObject({status:'ROW_LIMIT_EXCEEDED',sourceDigest:null,groups:[]});
  expect(()=>build('org','campaign',[r,r])).toThrow('Duplicate');
 });
});
