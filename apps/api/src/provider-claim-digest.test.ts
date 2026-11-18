import {describe,expect,it} from 'vitest';
import {providerClaimDigest} from './provider-claim-digest.js';

describe('R2E-C tenant-bound signed provider claim digests',()=>{
 it('is deterministic within exact tenant/connection and different across boundaries',()=>{
  const a=providerClaimDigest('tenant-a','conn-a','POST','12345678_99998888');
  expect(a).toMatch(/^sha256:[a-f0-9]{64}$/);
  expect(a).toBe(providerClaimDigest('tenant-a','conn-a','POST','12345678_99998888'));
  for(const other of [
   providerClaimDigest('tenant-b','conn-a','POST','12345678_99998888'),
   providerClaimDigest('tenant-a','conn-b','POST','12345678_99998888'),
   providerClaimDigest('tenant-a','conn-a','POST','12345678_99997777'),
   providerClaimDigest('tenant-a','conn-a','ACCOUNT','12345678')
  ])expect(other).not.toBe(a);
 });
 it('rejects arbitrary URLs, paths, separators, account/post mismatches',()=>{
  for(const [kind,ref] of [
   ['POST','https://example.org/x'],['POST','12345678'],['ACCOUNT','12345678_87654321'],
   ['POST','12345678_../outside'],['ACCOUNT','account:12345678'],
   ['POST','123_4567']
  ] as const)expect(()=>providerClaimDigest('tenant-a','conn-a',kind,ref)).toThrow();
  expect(()=>providerClaimDigest('../other','conn-a','POST','12345678_99998888')).toThrow();
 });
});
