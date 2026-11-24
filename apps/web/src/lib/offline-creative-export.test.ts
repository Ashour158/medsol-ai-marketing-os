import {describe,it,expect} from 'vitest';
import {validateOfflineCreativeDownload,deriveOfflineEditableSvgDraft,type OfflineCreativeRecord,
 type OfflineCreativePreview} from './offline-creative-export';
const record=():OfflineCreativeRecord=>({
 assetId:'asset-12345678',revisionId:'revision-12345678',version:1,
 brandId:'brand-1',renditionDigest:'sha256:'+'a'.repeat(64),
 offlineOnly:true,sourceKind:'FLATTENED_EXPORT'
});
const preview=():OfflineCreativePreview=>({
 assetId:'asset-12345678',revisionId:'revision-12345678',version:1,
 current:true,editableCopy:'Evidence-based research content only.',
 imageDataUrl:'data:image/png;base64,iVBORw0KGgo=',
 renditionDigest:'sha256:'+'a'.repeat(64),offlineOnly:true
});
describe('T8E authorized current immutable creative export',()=>{
 it('returns safe offline filenames and actual PNG and editable copy',()=>{
  const out=validateOfflineCreativeDownload(record(),preview());
  expect(out.pngFilename).toBe('medsol-offline-creative-revision-12345678.png');
  expect(out.copyFilename).toBe('medsol-offline-creative-revision-12345678.txt');
  expect(out.layeredEditableDesign).toBe(false);
  expect(out.externalEffectsAuthorized).toBe(false);
  expect(out.pngDataUrl).toMatch(/^data:image\/png;base64,/);
 });
 it('refuses stale, wrong-tenant-projected, mismatched and unsupported image previews',()=>{
  const p=preview(),a=record();
  for(const override of [
   {revisionId:'revision-foreign'}, {version:2}, {assetId:'foreign'},
   {current:false},{offlineOnly:false},
   {renditionDigest:'sha256:'+'b'.repeat(64)},
   {imageDataUrl:'javascript:alert(1)'},
   {imageDataUrl:'data:image/svg+xml;base64,PHN2Zz4='},
   {editableCopy:'too short'}
  ])expect(()=>validateOfflineCreativeDownload(a,
   {...p,...override} as OfflineCreativePreview)).toThrow('requires verified');
  expect(()=>validateOfflineCreativeDownload(
   {...a,sourceKind:'EDITABLE_SOURCE' as 'FLATTENED_EXPORT'},p))
   .toThrow('requires verified');
 });
});


describe("T1 native editable derived draft export",()=>{
 it("creates editable separate text and shape groups without claiming prior approval",()=>{
  const r=deriveOfflineEditableSvgDraft(record(),{...preview(),title:"Scientific draft"},"#124d83");
  expect(r.filename).toBe("medsol-derived-unapproved-revision-12345678.svg");
  expect(r.svg).toContain('<g id="heading"');
  expect(r.svg).toContain('<g id="body-copy"');
  expect(r.svg).toContain('<g id="accent"');
  expect(r.svg).toContain("UNAPPROVED DERIVED DRAFT");
  expect(r).toMatchObject({derivedEditableDraft:true,verifiedRendition:false,
   inheritsApproval:false,rightsVerified:false,externalEffectsAuthorized:false});
 });
 it("escapes XML and retains long copy rather than embedding unsafe markup",()=>{
  const r=deriveOfflineEditableSvgDraft(record(),{...preview(),title:'<script>alert(1)</script>',
   editableCopy:'A & B <image href="https://bad.invalid"/> '+('LONG '.repeat(120))+'\nEND MARKER'},"#abcdef");
  expect(r.svg).not.toContain("<script>");
  expect(r.svg).not.toContain("<image ");
  expect(r.svg).toContain("&lt;script&gt;");
  expect(r.svg).toContain("&amp;");
  expect(r.svg).toContain("END MARKER");
 });
 it("rejects stale source versions and unsafe accent input",()=>{
  const p={...preview(),title:"Draft title"};
  expect(()=>deriveOfflineEditableSvgDraft(record(),{...p,current:false},"#124d83")).toThrow();
  expect(()=>deriveOfflineEditableSvgDraft(record(),p,'"><script>')).toThrow();
  expect(()=>deriveOfflineEditableSvgDraft(record(),{...p,revisionId:"different"},"#124d83")).toThrow();
 });
});
