import {describe,it,expect} from 'vitest';
import {validateOfflineCreativeDownload,type OfflineCreativeRecord,
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
