import {describe,it,expect} from "vitest";
import {compareReviewedWatch,type WatchSnapshot,type WatchTopic} from "./reviewed-market-watch";
import {reviewedMarketWatchCsv} from "./offline-evidence-csv";
const topic:WatchTopic={sector:"Biotech",topic:"Genomics",evidenceCount:2,recentSignals90Days:2,
 distinctSourceHosts:1,lastObservedAt:"2026-11-01T10:00:00Z",freshness:"OBSERVED_WITHIN_90_DAYS",
 priority:"MONITOR",inferenceAuthorized:false,marketShareVerified:false,marketSizingVerified:false};
const snapshot=(asOf:string,topics:WatchTopic[]=[topic]):WatchSnapshot=>({
 organizationId:"tenant-a",asOf,topics,processed:topics.reduce((n,t)=>n+t.evidenceCount,0),
 registryWindowCappedAt:200,independentVerification:false,externalPublishingEnabled:false});
const baseline=snapshot("2026-11-02T10:00:00Z"),newer=snapshot("2026-11-03T10:00:00Z");
const selection=[{sector:topic.sector,topic:topic.topic}];
describe("Tranche 1 reviewed evidence watch",()=>{
 it("reports unchanged and changed reviewed-window signals without market verification",()=>{
  expect(compareReviewedWatch(baseline,newer,selection,"tenant-a").changes[0]?.status).toBe("UNCHANGED");
  const current=snapshot(newer.asOf,[{...topic,evidenceCount:3,recentSignals90Days:3,distinctSourceHosts:2,priority:"RESEARCH_PRIORITY"}]);
  const result=compareReviewedWatch(baseline,current,selection,"tenant-a");
  expect(result).toMatchObject({marketChangeVerified:false,scheduledMonitoringActive:false,
   externalEffectsAuthorized:false,changes:[{status:"REVIEWED_WINDOW_CHANGED",baselineSignals:2,currentSignals:3}]});
  const csv=reviewedMarketWatchCsv(baseline,current,selection,"tenant-a",result);
  expect(csv).toContain("NOT_VERIFIED_MARKET_CHANGE");
  expect(csv).not.toContain("tenant-a");
 });
 it("treats disappeared topics as absent from the window, not proof of market absence",()=>{
  const result=compareReviewedWatch(baseline,snapshot(newer.asOf,[]),selection,"tenant-a");
  expect(result.changes[0]).toMatchObject({status:"NOT_IN_CURRENT_WINDOW",currentSignals:null});
 });
 it("rejects foreign tenants, stale snapshots, duplicates, mismatched counts and forged results",()=>{
  expect(()=>compareReviewedWatch(baseline,{...newer,organizationId:"tenant-b"},selection,"tenant-a")).toThrow();
  expect(()=>compareReviewedWatch(baseline,baseline,selection,"tenant-a")).toThrow();
  expect(()=>compareReviewedWatch(baseline,newer,[...selection,...selection],"tenant-a")).toThrow();
  expect(()=>compareReviewedWatch(baseline,{...newer,processed:1},selection,"tenant-a")).toThrow();
  expect(()=>compareReviewedWatch(baseline,snapshot(newer.asOf,[topic,topic]),selection,"tenant-a")).toThrow();
  const result=compareReviewedWatch(baseline,newer,selection,"tenant-a");
  expect(()=>reviewedMarketWatchCsv(baseline,newer,selection,"tenant-a",{...result,marketChangeVerified:true as false})).toThrow();
 });
 it("flags the canonical window cap and preserves formula-safe topic export",()=>{
  const t={...topic,topic:"=GENOMICS",evidenceCount:200};
  const a=snapshot(baseline.asOf,[t]),b=snapshot(newer.asOf,[t]);
  const selected=[{sector:t.sector,topic:t.topic}];
  const result=compareReviewedWatch(a,b,selected,"tenant-a");
  expect(result.windowMayBeIncomplete).toBe(true);
  expect(reviewedMarketWatchCsv(a,b,selected,"tenant-a",result)).toContain("'=GENOMICS");
 });
});
