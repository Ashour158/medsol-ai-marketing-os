import {describe,expect,it} from 'vitest';
import {exactCreativeScopeHash,isExactCreativeScope} from './exact-creative-scope.js';
const scope=()=>({
 assetId:'asset-1',revisionId:'rev-1',revisionVersion:1,brandId:'brand-1',
 renditionDigest:'sha256:'+'a'.repeat(64),
 sourceRef:'internal:creative-source/a1',
 channel:'SOCIAL' as const,
 destinationRef:'internal:connected-destination/social-a',
 audienceRef:'internal:audience-snapshot/cohort-a',
 policyVersion:'v1',
 scheduledAt:'2026-11-28T12:00:00.000Z',
 expiresAt:'2026-11-27T12:00:00.000Z'
});
describe('R1C immutable creative scope contract',()=>{
 it('uses a deterministic SHA-256 over the exact approved asset and destination parameters',()=>{
  const first=scope();
  expect(isExactCreativeScope(first)).toBe(true);
  expect(exactCreativeScopeHash(first)).toMatch(/^sha256:[0-9a-f]{64}$/);
  const hash=exactCreativeScopeHash(first);
  for(const key of Object.keys(first) as Array<keyof ReturnType<typeof scope>>){
   const x={...first,[key]:key==='revisionVersion'?2:key==='channel'?'EMAIL':String(first[key])+'-different'};
   expect(exactCreativeScopeHash(x as ReturnType<typeof scope>)).not.toBe(hash);
  }
 });
 it('rejects content that omits audience, uses arbitrary URLs, has invalid digest or hidden fields',()=>{
  for(const bad of [
   {...scope(),sourceRef:'https://untrusted.example/file'},
   {...scope(),destinationRef:'https://social.example/abc'},
   {...scope(),audienceRef:''},
   {...scope(),policyVersion:'policy-1'},
   {...scope(),renditionDigest:'fake'},
   {...scope(),revisionVersion:0},
   {...scope(),hiddenCapability:'PUBLISH_NOW'}
  ])expect(isExactCreativeScope(bad)).toBe(false);
 });
});
