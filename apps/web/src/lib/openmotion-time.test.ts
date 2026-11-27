import {describe,it,expect} from 'vitest';
import {formatTime,secondsToFrame,frameToSeconds} from './openmotion-time';
describe('OpenMotion adopted time utilities',()=>{
 it('formats scene start and minute boundaries',()=>{
  expect(formatTime(0)).toBe('00:00');expect(formatTime(7)).toBe('00:07');expect(formatTime(65)).toBe('01:05');
 });
 it('maps bounded integer scene starts to exact frames and back',()=>{
  for(const fps of [24,25,30,60])for(const seconds of [0,2,7,24]){
   expect(secondsToFrame(seconds,fps)).toBe(seconds*fps);
   expect(frameToSeconds(seconds*fps,fps)).toBe(seconds);
  }
 });
 it('rejects nonfinite or negative timing through safe zero defaults',()=>{
  expect(formatTime(NaN)).toBe('00:00');expect(secondsToFrame(Infinity,30)).toBe(0);
  expect(frameToSeconds(-1,30)).toBe(0);expect(secondsToFrame(2,0)).toBe(0);
 });
});
