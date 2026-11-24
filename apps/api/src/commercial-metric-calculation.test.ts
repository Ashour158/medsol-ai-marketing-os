import {describe,it,expect} from "vitest";
import {summarizeReviewedCommercialMetrics as summarize,reconcileReviewedFunnelCohorts as reconcile,COHORT_ROW_LIMIT,type ReviewedCohortRow} from "./commercial-metric-calculation.js";
const row=(metricKey:string,value:bigint)=>({
 metricKey,_sum:{value},_count:{_all:1}
});
describe("T6A commercial conversion descriptive quality",()=>{
 it("computes source-reviewed ratios, exact integer spend costs and no ROI claims",()=>{
  const report=summarize([row("impressions",1000n),row("clicks",50n),
   row("leads",5n),row("qualified_leads",2n),row("spend_micros",60000000n)],2);
  expect(report.derived).toMatchObject({ctrPercent:5,clickToLeadPercent:10,
   leadQualificationPercent:40,spendMicrosPerLead:"12000000",
   spendMicrosPerQualifiedLead:"30000000"});
  expect(report.warnings).toContain("QUARANTINED_OBSERVATIONS_EXCLUDED");
  expect(report.warnings).toContain("OBSERVATION_COHORTS_NOT_RECONCILED");
  expect(report.warnings).toContain("SPEND_CURRENCY_NOT_RECONCILED");
  expect(report.attributionValidated).toBe(false);
  expect(report.roiValidated).toBe(false);
  expect(report.revenueVerified).toBe(false);
  expect(report.spendCurrencyVerified).toBe(false);
 });
 it("refuses impossible funnel rates and never emits greater than 100 percent",()=>{
  const report=summarize([row("impressions",5n),row("clicks",7n),
   row("leads",8n),row("qualified_leads",9n)],0);
  expect(report.derived.ctrPercent).toBeNull();
  expect(report.derived.clickToLeadPercent).toBeNull();
  expect(report.derived.leadQualificationPercent).toBeNull();
  expect(report.warnings).toEqual(expect.arrayContaining([
   "CLICKS_EXCEED_IMPRESSIONS","LEADS_EXCEED_CLICKS",
   "QUALIFIED_LEADS_EXCEED_LEADS"]));
 });
 it("handles missing denominators and zero cohorts without inventing conversion",()=>{
  const incomplete=summarize([row("clicks",0n),row("leads",3n)],0);
  expect(incomplete.derived.ctrPercent).toBeNull();
  expect(incomplete.derived.clickToLeadPercent).toBeNull();
  expect(incomplete.derived.spendMicrosPerLead).toBeNull();
  const empty=summarize([],0);
  expect(empty.status).toBe("INSUFFICIENT_REVIEWED_DATA");
  expect(empty.warnings).toEqual([]);
 });
 it("stays exact above Number.MAX_SAFE_INTEGER and denies invalid aggregates",()=>{
  const report=summarize([
   row("impressions",10n**40n),row("clicks",5n*10n**39n),
   row("leads",10n**30n),row("spend_micros",10n**36n)],0);
  expect(report.derived.ctrPercent).toBe(50);
  expect(report.derived.spendMicrosPerLead).toBe("1000000");
  for(const bad of [
   [row("clicks",-1n)],[row("clicks",1n),row("clicks",2n)],
   [row("unrecognized",2n)]
  ])expect(()=>summarize(bad,0)).toThrow();
  expect(()=>summarize([],NaN)).toThrow();
 });
});


const cohort=(record="row-1",counts=[100n,20n,8n,4n],source="MANUAL_EXPORT"):ReviewedCohortRow[]=>
 ["impressions","clicks","leads","qualified_leads"].map((metricKey,i)=>({
  metricKey,value:counts[i]!,sourceSystem:source,sourceRecordId:record,
  sourceReference:"internal:original-export",observedAt:new Date("2026-11-01T10:00:00.000Z")
 }));
describe("T1 exact source-record cohort reconciliation",()=>{
 it("matches reviewed complete groups using exact bigint arithmetic",()=>{
  const result=reconcile([...cohort(),...cohort("row-2",[100n,40n,12n,6n])]);
  expect(result).toMatchObject({status:"EXACT_SOURCE_RECORD_MATCH",matchedGroups:2,
   matchedTotals:{impressions:"200",clicks:"60",leads:"20",qualifiedLeads:"10"},
   rates:{ctrPercent:30,clickToLeadPercent:33.33,leadQualificationPercent:50},
   attributionValidated:false,roiValidated:false,revenueVerified:false,spendCurrencyVerified:false});
  expect(JSON.stringify(result)).not.toContain("internal:original-export");
 });
 it("never joins different source records, times, references or systems",()=>{
  const rows=cohort();
  for(const variant of [
   {...rows[3]!,sourceRecordId:"different"},
   {...rows[3]!,observedAt:new Date("2026-11-01T10:00:01Z")},
   {...rows[3]!,sourceReference:"internal:other"},
   {...rows[3]!,sourceSystem:"APPROVED_CONNECTOR_EXPORT"}
  ]){
   const r=reconcile([...rows.slice(0,3),variant]);
   expect(r).toMatchObject({matchedGroups:0,incompleteGroups:2,matchedTotals:null,
    rates:{ctrPercent:null,clickToLeadPercent:null,leadQualificationPercent:null}});
  }
 });
 it("excludes incomplete and contradictory groups rather than laundering rates",()=>{
  const r=reconcile([...cohort(),...cohort("impossible",[5n,8n,3n,2n]),
   ...cohort("missing").slice(0,2),
   {...cohort("monetary")[0]!,metricKey:"spend_micros"}]);
  expect(r).toMatchObject({status:"PARTIAL_SOURCE_MATCH",matchedGroups:1,
   incompleteGroups:1,inconsistentGroups:1,excludedNonFunnelRows:1,
   matchedTotals:{impressions:"100",clicks:"20",leads:"8",qualifiedLeads:"4"}});
 });
 it("fails closed on oversized scans, duplicate metric records and malformed rows",()=>{
  const row=cohort()[0]!;
  expect(reconcile(Array.from({length:COHORT_ROW_LIMIT+1},()=>row))).toMatchObject({
   status:"ROW_LIMIT_EXCEEDED",matchedGroups:0,matchedTotals:null});
  expect(()=>reconcile([row,row])).toThrow("Duplicate metric");
  expect(()=>reconcile([{...row,value:-1n}])).toThrow();
  expect(()=>reconcile([{...row,observedAt:new Date("invalid")}])).toThrow();
  expect(reconcile(cohort("zero",[0n,0n,0n,0n])).rates.ctrPercent).toBeNull();
 });
});
