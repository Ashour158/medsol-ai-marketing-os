import {describe,it,expect} from 'vitest';
import {releasePermissions} from './agent-release-ui';

const row={id:'rev-1',agentId:'MKT-CMO-001',status:'PROPOSED',createdBy:'creator',signatureTrusted:true};
describe('agent release studio action affordances mirror canonical approval invariants',()=>{
 it('never offers self approval or an untrusted signature decision',()=>{
  expect(releasePermissions(row,{userId:'creator',role:'ADMIN'}).approve).toBe(false);
  expect(releasePermissions({...row,signatureTrusted:false},{userId:'reviewer',role:'ADMIN'}).approve).toBe(false);
  expect(releasePermissions(row,{userId:'reviewer',role:'ADMIN'}).approve).toBe(true);
 });
 it('restricts controls by admin role and release status',()=>{
  expect(releasePermissions(row,{userId:'reviewer',role:'VIEWER'})).toEqual({approve:false,activate:false,revoke:false});
  expect(releasePermissions({...row,status:'APPROVED'},{userId:'reviewer',role:'SUPER_ADMIN'})).toEqual({approve:false,activate:true,revoke:true});
  expect(releasePermissions({...row,status:'REVOKED'},{userId:'reviewer',role:'ADMIN'})).toEqual({approve:false,activate:false,revoke:false});
  expect(releasePermissions(row,null)).toEqual({approve:false,activate:false,revoke:false});
 });
});
