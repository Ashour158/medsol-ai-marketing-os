import {describe,expect,it} from 'vitest';
import {ensureRuntimeReady} from './deployment-readiness.js';

const safe={rolsuper:false,rolbypassrls:false,rolcreaterole:false,rolcreatedb:false};
describe('live readiness is not a static /health assertion',()=>{
 it('accepts a reachable, least-privilege production database role',()=>{
  expect(ensureRuntimeReady([safe],true)).toMatchObject({
   status:'ready',database:'reachable',restrictedRoleVerified:true,
   realProviderOperationsVerified:false,productionCertified:false
  });
 });
 it('fails closed for a privileged production runtime user',()=>{
  for(const privilege of Object.keys(safe) as Array<keyof typeof safe>)
   expect(()=>ensureRuntimeReady([{...safe,[privilege]:true}],true)).toThrow('NON-BYPASSRLS');
 });
 it('fails closed when the live role probe has no result or is ambiguous',()=>{
  expect(()=>ensureRuntimeReady([],true)).toThrow();
  expect(()=>ensureRuntimeReady([safe,safe],true)).toThrow();
 });
 it('reports local development honestly without claiming restricted production role',()=>{
  expect(ensureRuntimeReady([{...safe,rolsuper:true}],false)).toMatchObject({
   restrictedRoleVerified:false,productionCertified:false
  });
 });
});
