import {describe,it,expect} from 'vitest';
import {parseBusinessProfile,serializeBusinessProfile,decodeBusinessProfile} from './business-profile.js';
const example={name:'Synthetic Bio Research',industry:'Life sciences',offerings:'Research reagents and instruments',audience:'University research laboratories',territories:'Egypt',differentiators:'Technical support and sample training'};
describe('Structured reviewed business profile contract',()=>{
 it('round trips a bounded canonical snapshot without an extra identity',()=>{
  const profile=parseBusinessProfile(example),text=serializeBusinessProfile(profile);
  expect(decodeBusinessProfile(text)).toEqual(example);
  expect(decodeBusinessProfile(text+' ')).toBeNull();
  expect(text.length).toBeLessThan(800);
 });
 it('rejects extraneous claims, control payloads and missing fields',()=>{
  for(const invalid of [{...example,verified:true},{...example,name:'<script>'},{...example,offerings:'x'.repeat(101)},{...example,audience:''}]){
   expect(()=>parseBusinessProfile(invalid)).toThrow();
  }
  expect(decodeBusinessProfile(JSON.stringify(example))).toBeNull();
 });
});
