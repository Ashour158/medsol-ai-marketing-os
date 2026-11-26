import {describe,it,expect} from 'vitest';
import {isOfflineWebm,offlineWebmBytes} from './offline-webm.js';
const header=Buffer.from('1a45dfa38b428681014282847765626d18538067','hex');
const fixture=Buffer.concat([header,Buffer.alloc(120,1)]);
describe('bounded offline WebM header inspection (not decoder)',()=>{
 it('accepts explicit header and segment marker and canonical base64',()=>{
  expect(isOfflineWebm(fixture)).toBe(true);
  expect(offlineWebmBytes(fixture.toString('base64'))).toEqual(fixture);
 });
 it('rejects wrong doctype, truncated header, fake marker and noncanonical bytes',()=>{
  const badType=Buffer.from(fixture);badType.write('xxxx',12);
  const badSegment=Buffer.from(fixture);badSegment[15]=0;
  for(const v of [badType,badSegment,Buffer.alloc(128),fixture.subarray(0,12),Buffer.concat([fixture,Buffer.alloc(1048576)])])expect(isOfflineWebm(v)).toBe(false);
  expect(()=>offlineWebmBytes('data:video/webm;base64,'+fixture.toString('base64'))).toThrow();
 });
});
