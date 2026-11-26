import {describe,it,expect} from 'vitest';
import type {Approval} from '@prisma/client';
import {syntheticQualificationScope,matchSyntheticQualification,SYNTHETIC_LEAD_REVIEW} from './synthetic-lead-qualification.js';
const target={id:'submission-1',organizationId:'tenant-a',formId:'form-1',payloadDigest:'sha256:'+'1'.repeat(64),
 consentEventId:'consent-1',createdBy:'submitter',outcome:'OUTCOME_UNKNOWN',
 form:{brandId:'brand-a',campaignId:'campaign-a',campaignVersion:4,contentDigest:'sha256:'+'2'.repeat(64)}};
const grades={bant:{budget:4,authority:4,need:5,timeline:4},icp:{industry:2,companySize:2,role:2,geography:2}};
describe('Exact synthetic lead qualification scope',()=>{
 it('reuses the bounded rubric and never authorizes a real CRM action or retry',()=>{
  const exact=syntheticQualificationScope(target,'requester',grades);
  expect(exact.scope).toMatchObject({submissionId:target.id,priorMockOutcome:'OUTCOME_UNKNOWN',realLeadVerified:false,externalEffectsAuthorized:false,
   assessment:{bantTotal:17,icpTotal:8,priority:'HOT',fitTier:'A',humanApprovalRequired:true,crmWriteAuthorized:false,independentlyVerified:false}});
  const reordered={icp:{geography:2,role:2,industry:2,companySize:2},bant:{timeline:4,need:5,authority:4,budget:4}};
  expect(syntheticQualificationScope(target,'requester',reordered)).toEqual(exact);
  expect(syntheticQualificationScope({...target,consentEventId:'new-consent'},'requester',grades).scopeDigest).not.toBe(exact.scopeDigest);
 });
 it('rejects incomplete grades, extra fields and tampered or foreign approval scope',()=>{
  for(const raw of [{...grades,bant:{...grades.bant,budget:null}},{...grades,icp:{...grades.icp,role:3}},{...grades,email:'no@example.invalid'}])
   expect(()=>syntheticQualificationScope(target,'requester',raw)).toThrow();
  const exact=syntheticQualificationScope(target,'requester',grades);
  const approval={objectType:SYNTHETIC_LEAD_REVIEW,organizationId:target.organizationId,objectId:target.id,
   requestedBy:'requester',requiredAuthority:'HUMAN_MARKETING_AUTHORITY',scope:exact.scope,scopeDigest:exact.scopeDigest} as unknown as Approval;
  expect(matchSyntheticQualification(target,approval)).toEqual(exact);
  expect(matchSyntheticQualification({...target,organizationId:'tenant-b'},approval)).toBeNull();
  expect(matchSyntheticQualification(target,{...approval,scope:{...exact.scope,realLeadVerified:true}})).toBeNull();
  expect(matchSyntheticQualification(target,{...approval,scopeDigest:'sha256:'+'f'.repeat(64)})).toBeNull();
 });
});
