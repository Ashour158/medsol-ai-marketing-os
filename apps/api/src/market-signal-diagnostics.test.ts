import {describe,expect,it} from "vitest";
import {reviewedMarketSignals} from "./market-signal-diagnostics.js";
const today=new Date("2026-11-22T00:00:00.000Z");
const signal=(id:string,url:string,daysAgo:number,topic="proteomics")=>({
 id,topic,sector:"biotechnology",sourceUrl:url,sourceTitle:"Reviewed "+id,
 observedAt:new Date(today.getTime()-daysAgo*86400000),sourcePublishedAt:null
});
describe("T6A market intelligence never manufactures commercial claims",()=>{
 it("requires reviewed source diversity and recency for research priority",()=>{
  const report=reviewedMarketSignals([
   signal("a","https://journal-a.org/1",4),
   signal("b","https://journal-b.org/2",7),
   signal("c","https://journal-a.org/3",3)],today);
  expect(report.topics[0]).toMatchObject({
   evidenceCount:3,recentSignals90Days:3,distinctSourceHosts:2,
   freshness:"OBSERVED_WITHIN_90_DAYS",priority:"RESEARCH_PRIORITY",
   sourceCoverage:"MULTIPLE_SOURCE_HOSTS",
   inferenceAuthorized:false,marketShareVerified:false,
   marketSizingVerified:false
  });
  expect(report.independentVerification).toBe(false);
  expect(report.registryWindowCappedAt).toBe(200);
 });
 it("flags stale or single-host signals and never counts unverified host identities",()=>{
  const stale=reviewedMarketSignals([
   signal("a","https://one.org/1",200),
   signal("b","https://one.org/2",220),
   signal("c","internal:missing",250)],today);
  expect(stale.topics[0]).toMatchObject({
   freshness:"STALE",distinctSourceHosts:1,
   priority:"MONITOR",sourceCoverage:"SINGLE_OR_UNKNOWN_HOST",
   marketShareVerified:false
  });
 });
 it("does not merge distinct sectors and keeps stable sorting with no evidence",()=>{
  const empty=reviewedMarketSignals([],today);
  expect(empty.topics).toEqual([]);
  expect(empty.processed).toBe(0);
  const mixed=reviewedMarketSignals([
   signal("a","https://one.org/a",12),
   {...signal("b","https://two.org/b",4),sector:"clinical"},
  ],today);
  expect(mixed.topics).toHaveLength(2);
 });
});
