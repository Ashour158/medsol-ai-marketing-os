import {describe,it,expect} from 'vitest';
import {normalizeExperimentInput,assignSyntheticExperiment,evaluateSyntheticExperiment} from './synthetic-experiment.js';
const input=normalizeExperimentInput({experimentKey:'fixture-experiment-01',campaignId:'campaign',formAId:'form-a',formBId:'form-b',
 contactIds:['contact-4','contact-2','contact-1','contact-3'],endsAt:'2026-12-01T10:00:00.000Z'});
const consent=new Map(input.contactIds.map(x=>[x,'consent-'+x]));
const assignments=assignSyntheticExperiment('tenant',input,consent);
const scope={policy:'SYNTHETIC_EXPERIMENT_V1' as const,organizationId:'tenant',requestedBy:'requester',input,
 brandId:'brand',campaignVersion:5,formADigest:'sha256:'+'a'.repeat(64),formBDigest:'sha256:'+'b'.repeat(64),assignments,
 syntheticOnly:true as const,actualExposureVerified:false as const,externalEffectsAuthorized:false as const};
describe('Synthetic experimental assignment and recorded outcome evidence',()=>{
 it('is balanced, stable under input reordering, and binds original synthetic consent',()=>{
  expect(assignments.filter(x=>x.arm==='A')).toHaveLength(2);expect(assignments.filter(x=>x.arm==='B')).toHaveLength(2);
  expect(assignSyntheticExperiment('tenant',{...input,contactIds:[...input.contactIds].reverse()},consent)).toEqual(assignments);
  expect(()=>assignSyntheticExperiment('tenant',input,new Map())).toThrow('current synthetic consent');
  for(const patch of [{contactIds:['a','a','b','c']},{contactIds:['a']},{formBId:'form-a'},{endsAt:'bad'},{email:'real@example.invalid'}])
   expect(()=>normalizeExperimentInput({...input,...patch})).toThrow();
 });
 it('does not count preapproval, postwindow, foreign, changed-consent, or crossover records',()=>{
  const a=assignments.filter(x=>x.arm==='A'),b=assignments.filter(x=>x.arm==='B');
  const approval=new Date('2026-11-30T10:00:00.000Z'),within=new Date('2026-11-30T11:00:00.000Z');
  const row=(m:typeof assignments[number],formId:string,createdAt=within)=>({contactId:m.contactId,consentEventId:m.consentEventId,formId,createdAt});
  const result=evaluateSyntheticExperiment(scope,approval,[
   row(a[0]!,'form-a'),row(a[0]!,'form-a'),row(a[1]!,'form-a',new Date('2026-11-30T09:00:00Z')),
   row(b[0]!,'form-b'),row(b[0]!,'form-a'),{...row(b[1]!,'form-b'),consentEventId:'new'},
   row(b[1]!,'form-b',new Date('2026-12-02T10:00:00Z')),{...row(a[0]!,'form-a'),contactId:'foreign'}]);
  expect(result).toMatchObject({status:'CONTAMINATED_SYNTHETIC_EVIDENCE',crossoverContacts:1,changedConsentContacts:1,
   arms:[{arm:'A',assigned:2,recordedAssignedFormSubmissions:1,recordedSubmissionRatePercent:50},
    {arm:'B',assigned:2,recordedAssignedFormSubmissions:0,recordedSubmissionRatePercent:0}],
   actualExposureVerified:false,causalLiftValidated:false,realLeadsVerified:false,externalEffectsAuthorized:false});
 });
});
