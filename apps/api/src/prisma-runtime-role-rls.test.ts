import {describe,expect,it} from 'vitest';
import {assertRuntimeDatabaseRole} from './prisma.service.js';
describe('production database runtime privilege hard fail',()=>{
 const safe={rolsuper:false,rolbypassrls:false,rolcreaterole:false,rolcreatedb:false};
 it('allows only the dedicated unprivileged, non-BYPASSRLS runtime role',()=>{
  expect(()=>assertRuntimeDatabaseRole([safe])).not.toThrow();
 });
 it('rejects superuser, explicit BYPASSRLS, role creation and database ownership privileges',()=>{
  for(const key of Object.keys(safe) as Array<keyof typeof safe>){
   expect(()=>assertRuntimeDatabaseRole([{...safe,[key]:true}]))
    .toThrow('NON-BYPASSRLS');
  }
 });
 it('fails closed when role metadata is missing, ambiguous or fabricated',()=>{
  expect(()=>assertRuntimeDatabaseRole([])).toThrow('NON-BYPASSRLS');
  expect(()=>assertRuntimeDatabaseRole([safe,safe])).toThrow('NON-BYPASSRLS');
  expect(()=>assertRuntimeDatabaseRole([{...safe,rolbypassrls:null as any}]))
   .toThrow('NON-BYPASSRLS');
 });
});
