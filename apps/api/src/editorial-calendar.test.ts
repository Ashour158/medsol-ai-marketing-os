import {describe,it,expect} from 'vitest';
import {editorialCalendar as plan,type EditorialEntry} from './editorial-calendar.js';
const entry=(id:string,scheduledAt:string,extra:Partial<EditorialEntry>={}):EditorialEntry=>({
 approvalId:id,assetId:'asset-'+id,revisionId:'rev-'+id,channel:'SOCIAL',destinationRef:'internal:connected-destination/fixture',
 scheduledAt,expiresAt:'2026-12-10T00:00:00.000Z',approvalDecision:'APPROVED',publicationStatus:'PREPARED',current:true,...extra});
const start='2026-12-01T00:00:00.000Z',end='2026-12-02T00:00:00.000Z';
describe('Canonical editorial calendar advisory conflict detection',()=>{
 it('detects same channel and destination overlap including adjacent-window records',()=>{
  const a=entry('a','2026-12-01T00:15:00.000Z'),b=entry('b','2026-11-30T23:45:00.000Z');
  const r=plan([a,b,entry('different','2026-12-01T00:15:00.000Z',{destinationRef:'internal:connected-destination/other'}),
   entry('stale','2026-12-01T00:15:00.000Z',{current:false}),entry('held','2026-12-01T00:15:00.000Z',{publicationStatus:'DISPATCH_HELD'})],start,end,60);
  expect(r.conflicts).toEqual([{approvalId:'a',conflictingApprovalId:'b',distanceMinutes:30}]);
  expect(r.suggestions).toEqual([{approvalId:'a',proposedScheduledAt:'2026-12-01T00:45:00.000Z',requiresNewExactApproval:true}]);
  expect(r).toMatchObject({scheduleChanged:false,externalEffectsAuthorized:false,engagementOptimizationVerified:false});
 });
 it('rejects unbounded windows and never proposes beyond the requested horizon',()=>{
  const r=plan([entry('a','2026-12-01T23:45:00.000Z'),entry('b','2026-12-01T23:30:00.000Z')],start,end,60);
  expect(r.suggestions.every(x=>x.proposedScheduledAt===null)).toBe(true);
  expect(()=>plan([],start,end,5)).toThrow();expect(()=>plan([],start,'2027-03-01T00:00:00.000Z',60)).toThrow();
 });
});
