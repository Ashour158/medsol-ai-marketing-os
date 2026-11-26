import {describe,it,expect} from 'vitest';
import {reconcileReviewedMonetaryCohorts,COHORT_ROW_LIMIT,type ReviewedCohortRow} from './commercial-metric-calculation.js';
const row=(id:string,key:string,value:bigint,currency:string|null,sourceReference='internal:source',observedAt=new Date('2026-11-25T12:00:00Z')):ReviewedCohortRow=>({
 sourceSystem:'MANUAL_EXPORT',sourceRecordId:id,sourceReference,observedAt,metricKey:key,value,currency});
describe('Reviewed monetary reconciliation',()=>{
 it('keeps same-record currency cohorts separate and never asserts actual finance or attribution',()=>{
  const result=reconcileReviewedMonetaryCohorts([
   row('egp','spend_micros',1000000n,'EGP'),row('egp','reported_revenue_micros',5000000n,'EGP'),
   row('egp','reported_gross_profit_micros',2000000n,'EGP'),
   row('usd','spend_micros',1000000n,'USD'),row('usd','reported_revenue_micros',4000000n,'USD'),
   row('legacy','spend_micros',100n,null),
   row('bad','spend_micros',100n,'USD'),row('bad','reported_revenue_micros',500n,'EGP'),
   row('different','spend_micros',10n,'USD','internal:first'),
   row('different','reported_revenue_micros',50n,'USD','internal:second')
  ]);
  expect(result).toMatchObject({status:'PARTIAL_MONETARY_MATCH',matchedGroups:2,incompleteGroups:3,
   currencyConflictGroups:1,unknownCurrencyRows:1,attributionValidated:false,revenueVerified:false,roiValidated:false,
   fxConversionPerformed:false,currencies:[
    {currency:'EGP',reportedSpendMicros:'1000000',reportedRevenueMicros:'5000000',grossProfitMatchedGroups:1,reportedGrossProfitMicros:'2000000'},
    {currency:'USD',reportedSpendMicros:'1000000',reportedRevenueMicros:'4000000',grossProfitMatchedGroups:0,reportedGrossProfitMicros:null}
   ]});
 });
 it('fails closed on the row bound, duplicate key or invalid negative value',()=>{
  const r=row('s','spend_micros',1n,'USD');
  expect(reconcileReviewedMonetaryCohorts(Array.from({length:COHORT_ROW_LIMIT+1},()=>r))).toMatchObject({status:'ROW_LIMIT_EXCEEDED',currencies:[]});
  expect(()=>reconcileReviewedMonetaryCohorts([r,r])).toThrow('Duplicate');
  expect(()=>reconcileReviewedMonetaryCohorts([{...r,value:-1n}])).toThrow('Invalid');
 });
});
