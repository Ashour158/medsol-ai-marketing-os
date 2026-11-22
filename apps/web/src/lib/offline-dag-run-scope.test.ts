import {describe,it,expect} from "vitest";
import {offlineDagRunScope,mayReuseOfflineDagRequestKey}
 from "./offline-dag-run-scope";
const base={
 blueprintId:"offline-science",activeReleaseId:"signed-v1",
 objective:"Evidence-based scientific education",market:"EG"
};
describe("T2H offline DAG UI idempotency key scope",()=>{
 it("reuses an existing key only for an identical signed release and inputs",()=>{
  const scope=offlineDagRunScope(base);
  expect(mayReuseOfflineDagRequestKey("request-001",scope,scope)).toBe(true);
  expect(mayReuseOfflineDagRequestKey("",scope,scope)).toBe(false);
  expect(mayReuseOfflineDagRequestKey("request-001","",scope)).toBe(false);
 });
 it("invalidates keys on blueprint, active release, objective and market changes",()=>{
  const issued=offlineDagRunScope(base);
  for(const change of [
   {blueprintId:"another-blueprint"},
   {activeReleaseId:"signed-v2"},
   {objective:"Different business objective"},
   {market:"AE"}
  ]){
   const current=offlineDagRunScope({...base,...change});
   expect(mayReuseOfflineDagRequestKey("request-001",issued,current)).toBe(false);
  }
 });
 it("cannot collide by injecting separators or special characters",()=>{
  const a=offlineDagRunScope({...base,blueprintId:"x,\\"y"});
  const b=offlineDagRunScope({...base,blueprintId:"x",activeReleaseId:"y,signed-v1"});
  expect(a).not.toBe(b);
 });
});