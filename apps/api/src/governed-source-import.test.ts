import {describe,it,expect} from 'vitest';
import {governedSourceImport as validate} from './governed-source-import.js';
const declaration={collectionPermitted:true,noPersonalData:true,permissionReference:'internal:source-rights/license-record',rightsBasis:'LICENSED_CONTENT',scope:'METADATA_ONLY'};
const now=new Date('2026-11-26T00:00:00.000Z'),expiry=new Date('2026-12-26T00:00:00.000Z');
describe('Governed operator source import',()=>{
 it('records declared rights without legal or network verification',()=>{
  expect(validate(declaration,'https://example.org/market',expiry,'Metadata only',now)).toMatchObject({
   sourceHost:'example.org',collectionPermitted:true,legalRightsVerified:false,actualNetworkRequests:0,externalEffectsAuthorized:false});
 });
 it('rejects unpermitted, over-scope, expired, private or credential-bearing provenance',()=>{
  for(const url of ['http://example.org','https://localhost','https://127.0.0.1','https://[::1]','https://private.local','https://user:pass@example.org','https://example.org/?token=secret'])
   expect(()=>validate(declaration,url,expiry,'Metadata only',now)).toThrow();
  expect(()=>validate({...declaration,collectionPermitted:false},'https://example.org',expiry,'Text',now)).toThrow();
  expect(()=>validate(declaration,'https://example.org',expiry,'x'.repeat(1001),now)).toThrow();
  expect(()=>validate(declaration,'https://example.org',now,'Text',now)).toThrow();
 });
});
