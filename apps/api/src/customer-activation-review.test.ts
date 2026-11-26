import {describe,it,expect} from 'vitest';
import {normalizeActivationInput,compareActivationTargets,activationReviewId} from './customer-activation-review.js';
const input={requestKey:'fixture-activation-001',brandId:'brand-a',campaignId:'campaign-a',profileDocumentId:'doc-a',expiresAt:'2026-12-01T00:00:00.000Z',fixtureOnly:true,targets:{offlineGates:10,reviewedObservations:4,syntheticEmailRuns:1,virtualSocialRuns:1}};
describe('customer activation review',()=>{
 it('accepts bounded value targets and reports gaps without fabricating outcomes',()=>{
  const x=normalizeActivationInput(input);
  expect(compareActivationTargets(x.targets,{...x.targets,offlineGates:8})).toMatchObject({offlineGates:{target:10,observed:8,met:false},reviewedObservations:{met:true}});
  expect(activationReviewId('a',x.requestKey)).not.toBe(activationReviewId('b',x.requestKey));
 });
 it('rejects self-reported evidence, actual activation flags, out-of-bound goals and malformed identities',()=>{
  for(const bad of [{...input,productionCertified:true},{...input,fixtureOnly:false},{...input,profileDocumentId:'../other'},{...input,targets:{...input.targets,offlineGates:11}},{...input,targets:{...input.targets,verifiedRevenue:1}}])expect(()=>normalizeActivationInput(bad)).toThrow();
 });
});
