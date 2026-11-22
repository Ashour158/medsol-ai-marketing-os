import {describe,it,expect} from "vitest";
import {summarizeReviewedCommercialMetrics as summarize} from "./commercial-metric-calculation.js";
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
