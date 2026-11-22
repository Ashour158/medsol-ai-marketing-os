import {describe,it,expect} from "vitest";
import {modelOfflineRevenueScenarios} from "./offline-revenue-scenarios";
const base={
 reviewedQualifiedLeads:"200",
 sourceStatus:"REVIEWED_SOURCE_EVIDENCE" as const,
 currency:"EGP",
 assumedDealValueMajor:"15000",
 closeRateBasisPoints:1000,
 marginBasisPoints:4000
};
describe("T3F offline scenario math is bounded, hypothetical and source-labelled",()=>{
 it("computes downside/base/upside using reviewed leads and explicit assumptions",()=>{
  const r=modelOfflineRevenueScenarios(base);
  expect(r.scenarios.map(x=>x.illustrativeGrossRevenueMajor)).toEqual([
   "150000","300000","450000"
  ]);
  expect(r.scenarios.map(x=>x.expectedWinsHundredths)).toEqual([
   "1000","2000","3000"
  ]);
  expect(r.scenarios[1]?.illustrativeGrossContributionMajor).toBe("120000");
  expect(r.measuredRevenue).toBe(false);
  expect(r.causalAttributionValidated).toBe(false);
  expect(r.externalEffectsAuthorized).toBe(false);
 });
 it("rejects missing or unreviewed source, invalid currency and unsafe assumptions",()=>{
  expect(()=>modelOfflineRevenueScenarios({...base,sourceStatus:"QUARANTINED" as "REVIEWED_SOURCE_EVIDENCE"})).toThrow();
  expect(()=>modelOfflineRevenueScenarios({...base,currency:""})).toThrow();
  expect(()=>modelOfflineRevenueScenarios({...base,assumedDealValueMajor:"12.34"})).toThrow();
  expect(()=>modelOfflineRevenueScenarios({...base,reviewedQualifiedLeads:"-1"})).toThrow();
  expect(()=>modelOfflineRevenueScenarios({...base,closeRateBasisPoints:10001})).toThrow();
  expect(()=>modelOfflineRevenueScenarios({...base,marginBasisPoints:Number.NaN})).toThrow();
 });
 it("rounds gross contribution from exact rational inputs rather than rounded revenue",()=>{
  const r=modelOfflineRevenueScenarios({...base,
   reviewedQualifiedLeads:"1",assumedDealValueMajor:"1",
   closeRateBasisPoints:5000,marginBasisPoints:5000});
  expect(r.scenarios[1]?.illustrativeGrossRevenueMajor).toBe("1");
  // 0.5 expected wins x 1 major unit x 50% margin = 0.25, rounds to zero.
  expect(r.scenarios[1]?.illustrativeGrossContributionMajor).toBe("0");
 });
 it("preserves exact large-number contribution at full margin",()=>{
  const r=modelOfflineRevenueScenarios({...base,
   reviewedQualifiedLeads:"999999999999999",
   assumedDealValueMajor:"999999999999",
   closeRateBasisPoints:10000,marginBasisPoints:10000});
  expect(BigInt(r.scenarios[1]!.illustrativeGrossContributionMajor))
   .toBe(999999999999999n*999999999999n);
 });
 it("never coerces large reviewed values through imprecise floating point math",()=>{
  const r=modelOfflineRevenueScenarios({...base,
   reviewedQualifiedLeads:"999999999999999",
   assumedDealValueMajor:"999999999999",
   closeRateBasisPoints:10000,
   marginBasisPoints:10000});
  expect(BigInt(r.scenarios[1]!.illustrativeGrossRevenueMajor))
   .toBe(999999999999999n*999999999999n);
 });
 it("clamps upside conversion at 100 percent and allows empty reviewed populations",()=>{
  const capped=modelOfflineRevenueScenarios({...base,closeRateBasisPoints:8500});
  expect(capped.scenarios[2]!.closeRateBasisPoints).toBe(10000);
  const none=modelOfflineRevenueScenarios({...base,reviewedQualifiedLeads:"0"});
  expect(none.scenarios.every(x=>x.illustrativeGrossRevenueMajor==="0")).toBe(true);
 });
});
