import {describe,it,expect} from 'vitest';
import {buildSyntheticFeedback,encodeSyntheticFeedback,decodeSyntheticFeedback} from './synthetic-feedback.js';
const counts={PRODUCT_QUALITY:0,ONBOARDING:0,PRICE_VALUE:0,SUPPORT:5,USABILITY:2,TRUST:0,FEATURE_REQUEST:0,DELIVERY:0,OTHER:0};
const input={brandId:'brand-a',fixtureOnly:true,counts};
describe('Synthetic feedback projection',()=>{
 it('reuses canonical suppression and retains no raw record or minor theme counts',()=>{
  const r=buildSyntheticFeedback('org-a',input);
  expect(r.themeCounts).toEqual({SUPPORT:5});
  expect(r.cohortSize).toBe(7);expect(r.realCustomerData).toBe(false);
  expect(decodeSyntheticFeedback(encodeSyntheticFeedback(r))).toEqual(r);
  expect(buildSyntheticFeedback('org-a',{...input,counts:{...counts,SUPPORT:0}}).themeCounts).toEqual({});
  expect(buildSyntheticFeedback('org-b',input).inputDigest).not.toBe(r.inputDigest);
 });
 it('rejects mixed provenance, personal fields, malformed counts and unsafe output',()=>{
  for(const bad of [{...input,fixtureOnly:false},{...input,contactId:'not-allowed'},{...input,counts:{...counts,USABILITY:-1}},{...input,counts:{...counts,USABILITY:99}}])
   expect(()=>buildSyntheticFeedback('org-a',bad)).toThrow();
  const good=buildSyntheticFeedback('org-a',input);
  expect(decodeSyntheticFeedback(JSON.stringify({...good,themeCounts:{SUPPORT:5,USABILITY:2}}))).toBeNull();
  expect(decodeSyntheticFeedback(JSON.stringify({...good,realCustomerData:true}))).toBeNull();
 });
});
