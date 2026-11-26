import {describe,it,expect} from 'vitest';
import {communityCaseTiming,COMMUNITY_PRIORITY_ORDER,COMMUNITY_TARGET_MINUTES} from './community-case-timing.js';
const createdAt=new Date('2026-11-01T00:00:00.000Z');
const at=(minutes:number)=>new Date(createdAt.getTime()+minutes*60000);
describe('T1 internal community advisory target clock',()=>{
 it('defines risk-ordered bounded targets and exact due boundary',()=>{
  expect(COMMUNITY_PRIORITY_ORDER).toEqual(['URGENT','HIGH','NORMAL','LOW']);
  for(const priority of COMMUNITY_PRIORITY_ORDER){
   const row={priority,status:'OPEN',createdAt,closedAt:null};
   const target=COMMUNITY_TARGET_MINUTES[priority];
   expect(communityCaseTiming(row,at(target-1))).toMatchObject({status:'WITHIN_TARGET',targetMinutes:target});
   expect(communityCaseTiming(row,at(target))).toMatchObject({status:'OVERDUE',dueAt:at(target).toISOString(),externalNotificationAuthorized:false});
  }
 });
 it('preserves original clock through independent review and reopening; freezes closure elapsed time',()=>{
  const row={priority:'HIGH',createdAt,status:'PENDING_REVIEW',closedAt:null};
  expect(communityCaseTiming(row,at(300))).toMatchObject({status:'OVERDUE',elapsedMinutes:300});
  expect(communityCaseTiming({...row,status:'RESOLVED_INTERNAL',closedAt:at(220)},at(300))).toMatchObject({status:'CLOSED_BEFORE_TARGET',elapsedMinutes:220});
  expect(communityCaseTiming({...row,status:'RESOLVED_INTERNAL',closedAt:at(300)},at(400))).toMatchObject({status:'CLOSED_AFTER_TARGET',elapsedMinutes:300});
  expect(communityCaseTiming({...row,status:'OPEN'},at(400))).toMatchObject({status:'OVERDUE',elapsedMinutes:400});
 });
 it('rejects unknown policy scope and inconsistent persisted closure',()=>{
  const row={priority:'HIGH',createdAt,status:'OPEN',closedAt:null};
  expect(()=>communityCaseTiming({...row,priority:'FAKE'},at(10))).toThrow();
  expect(()=>communityCaseTiming({...row,status:'RESOLVED_INTERNAL'},at(10))).toThrow();
  expect(()=>communityCaseTiming({...row,closedAt:at(1)},at(10))).toThrow();
  expect(()=>communityCaseTiming({...row,status:'RESOLVED_INTERNAL',closedAt:at(-1)},at(10))).toThrow();
 });
});
