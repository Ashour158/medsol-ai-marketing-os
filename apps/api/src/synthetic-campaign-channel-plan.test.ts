import {describe,it,expect} from 'vitest';
import {normalizeChannelPlan,channelPlanId,checkChannelCopy} from './synthetic-campaign-channel-plan.js';
const input={requestKey:'fixture-channel-001',kind:'COMMUNICATIONS',channel:'PRESS_RELEASE',headline:'Research event',body:'For research only',sourceIds:['doc-b','doc-a'],expiresAt:'2026-12-01T00:00:00.000Z',fixtureOnly:true,regulatedClaim:false,currency:null,budgetMicros:null};
describe('synthetic campaign channel plan',()=>{
 it('canonicalizes evidence, forbids real dispatch and binds tenant key',()=>{
  expect(normalizeChannelPlan(input).sourceIds).toEqual(['doc-a','doc-b']);
  expect(channelPlanId('tenant-a',input.requestKey)).not.toBe(channelPlanId('tenant-b',input.requestKey));
  for(const bad of [{...input,fixtureOnly:false},{...input,dispatch:true},{...input,sourceIds:['doc-a','doc-a']},{...input,currency:'EGP'},{...input,body:'<script>bad</script>'}])expect(()=>normalizeChannelPlan(bad)).toThrow();
 });
 it('uses hypothetical paid budget and rejects missing or prohibited literal copy',()=>{
  const paid=normalizeChannelPlan({...input,kind:'PAID_MEDIA',channel:'SEARCH_ADS',currency:'EGP',budgetMicros:'100000000'});
  expect(paid.budgetMicros).toBe('100000000');
  const rules={voice:'Evidence first',primaryColor:'#124d83',prohibitedClaims:['guaranteed cure'],requiredDisclaimers:['for research only']};
  expect(()=>checkChannelCopy(paid,rules)).not.toThrow();
  expect(()=>checkChannelCopy({...paid,body:'Guaranteed cure'},rules)).toThrow('brand-policy');
 });
});
