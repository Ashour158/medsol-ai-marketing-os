import {describe,it,expect} from "vitest";
import {selectedCreativeIsCurrent,type ObservedCreativeRevision} from "./journey-creative-current";
const current:ObservedCreativeRevision={
 assetId:"asset-a",revisionId:"r2",brandId:"brand-a",current:true
};
const old:ObservedCreativeRevision={
 assetId:"asset-a",revisionId:"r1",brandId:"brand-a",current:false
};
describe("T3E current creative version guard (presentation only)",()=>{
 it("allows only matching current immutable revision from authoritative journey snapshot",()=>{
  expect(selectedCreativeIsCurrent([old,current],current)).toBe(true);
  expect(selectedCreativeIsCurrent([old,current],old)).toBe(false);
 });
 it("fails closed for no selection, missing current, or another asset",()=>{
  expect(selectedCreativeIsCurrent([old,current],null)).toBe(false);
  expect(selectedCreativeIsCurrent([old],old)).toBe(false);
  expect(selectedCreativeIsCurrent([],current)).toBe(false);
  expect(selectedCreativeIsCurrent([current],{
   ...current,assetId:"asset-b"
  })).toBe(false);
 });
 it("fails closed on cross-brand or conflicting current-version claims",()=>{
  expect(selectedCreativeIsCurrent([current],{...current,brandId:"brand-b"})).toBe(false);
  expect(selectedCreativeIsCurrent([current,{...old,current:true}],current)).toBe(false);
  expect(selectedCreativeIsCurrent([{...old,current:true},old],old)).toBe(false);
 });
 it("does not treat an earlier publication-linked version as current",()=>{
  expect(selectedCreativeIsCurrent([old,current],old)).toBe(false);
 });
});
