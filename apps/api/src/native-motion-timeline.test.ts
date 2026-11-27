import {describe,it,expect} from 'vitest';
import {planOfflineMotionTimeline,resolveOfflineMotionFrame,renderOfflineLayeredSpec} from './offline-layered-design.js';
const source={format:'SQUARE',title:'Opening',body:'Internal draft',accent:'#123456',motion:{openingSeconds:2,scenes:[{title:'Next',body:'Second scene',seconds:3}]}};
describe('native motion timeline',()=>{
 it.each([24,25,30,60])('addresses exact scene boundaries at %i fps',fps=>{
  const t=planOfflineMotionTimeline(source,fps);
  expect(t).toEqual({fps,totalFrames:5*fps,scenes:[{index:0,startFrame:0,endFrameExclusive:2*fps},{index:1,startFrame:2*fps,endFrameExclusive:5*fps}],videoEncodingVerified:false,releaseAuthorized:false});
  expect(resolveOfflineMotionFrame(source,2*fps-1,fps)).toMatchObject({sceneIndex:0,localFrame:2*fps-1});
  expect(resolveOfflineMotionFrame(source,2*fps,fps)).toMatchObject({sceneIndex:1,localFrame:0});
  expect(resolveOfflineMotionFrame(source,5*fps-1,fps)).toMatchObject({sceneIndex:1,localFrame:3*fps-1});
 });
 it.each([-1,150,0.5,NaN,Infinity,'1',null])('rejects invalid frame %s',frame=>{expect(()=>resolveOfflineMotionFrame(source,frame)).toThrow();});
 it.each([0,29.97,120,'30',null])('rejects unsupported rate %s',fps=>{expect(()=>planOfflineMotionTimeline(source,fps)).toThrow();});
 it('rejects still and malformed motion sources',()=>{
  const {motion,...still}=source;
  expect(()=>planOfflineMotionTimeline(still)).toThrow();
  expect(()=>planOfflineMotionTimeline({...still,motion:{...motion,openingSeconds:0}})).toThrow();
 });
 it('does not mutate source or alter existing renderer output',()=>{
  const before=renderOfflineLayeredSpec(source);
  const original=JSON.stringify(source);
  resolveOfflineMotionFrame(source,60);
  expect(JSON.stringify(source)).toBe(original);
  expect(renderOfflineLayeredSpec(source)).toEqual(before);
 });
});
