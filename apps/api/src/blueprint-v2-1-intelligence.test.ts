import {describe,expect,it} from 'vitest';
import {
 AGENT_ROSTER,MarketingDomainAgent,AgentRegistry,AgentRuntime,
 reviewSearchDiscovery,reviewVoiceOfCustomer,reviewCorporateCommunication,
 reviewRevenueScenario,reviewAssetAuthenticity,reviewPartnerEnablement,
 reviewCustomerActivation
} from '@medsol/agent-runtime';
const fixed=new Date('2026-11-18T18:00:00.000Z');
const source={organizationId:'tenant-a',sourceReference:'internal:evidence-a',
 observedAt:'2026-11-18T12:00:00.000Z'};
const digest='sha256:'+'a'.repeat(64);
describe('Blueprint v2.1 bounded specialist review logic',()=>{
 it('E34 counts only reviewed and permitted observed samples, never fabricates AI position',()=>{
  const input={organizationId:'tenant-a',brandId:'brand-x',observations:[
   {...source,sourceId:'s1',queryId:'q1',channel:'AI_ANSWER',brandMentioned:true,
    reviewed:true,collectionPermitted:true},
   {...source,sourceId:'s2',queryId:'q2',channel:'AI_ANSWER',brandMentioned:false,
    reviewed:true,collectionPermitted:true},
   {...source,sourceId:'s3',queryId:'q3',channel:'ORGANIC_SEARCH',
    position:3,brandMentioned:true,reviewed:true,collectionPermitted:true},
   {...source,sourceId:'s4',queryId:'q4',channel:'AI_ANSWER',brandMentioned:true,
    reviewed:false,collectionPermitted:true}
  ]};
  const r=reviewSearchDiscovery('tenant-a',input,fixed);
  expect(r).toMatchObject({engineId:'E34',status:'REVIEW_REQUIRED',
   reviewedCount:3,aiAnswerSampleCount:2,aiAnswerMentionCount:1,
   aiAnswerMentionRatePercent:50,organicPositionObservedCount:1,
   externalEffectsAuthorized:false,independentlyVerified:false});
  expect(()=>reviewSearchDiscovery('tenant-b',input,fixed)).toThrow('Cross-tenant');
  expect(()=>reviewSearchDiscovery('tenant-a',{...input,observations:[{...input.observations[0],position:1}]},fixed))
   .toThrow('AI answer mention is not an organic search ranking');
  expect(()=>reviewSearchDiscovery('tenant-a',{...input,observations:[
    input.observations[0],input.observations[0]]},fixed)).toThrow('Duplicate discovery');
 });
 it('E35 excludes out-of-purpose records, suppresses small cohorts and never returns raw identifiers',()=>{
  const make=(n:number)=>({...source,sourceId:'feedback-'+n,sourceType:'FIRST_PARTY_SURVEY',
   theme:'USABILITY',purposeAllowed:true,sourceReviewed:true});
  const input={organizationId:'tenant-a',brandId:'brand-x',signals:[0,1,2,3,4].map(make)};
  expect(reviewVoiceOfCustomer('tenant-a',input,fixed)).toMatchObject({
   engineId:'E35',eligibleCount:5,publishableCohort:true,themeCounts:{USABILITY:5},
   rawPersonalDataReturned:false,externalEffectsAuthorized:false});
  const small=reviewVoiceOfCustomer('tenant-a',{...input,signals:input.signals.slice(0,4)},fixed);
  expect(small.themeCounts).toEqual({});
  expect(small.status).toBe('INSUFFICIENT_EVIDENCE');
  expect(reviewVoiceOfCustomer('tenant-a',{...input,signals:[
   ...input.signals.slice(0,4),{...make(5),purposeAllowed:false}]},fixed).excludedCount).toBe(1);
  expect(()=>reviewVoiceOfCustomer('tenant-a',{...input,signals:[
   {...make(1),email:'private@example.org'}]},fixed)).toThrow('Raw customer identity');
  expect(()=>reviewVoiceOfCustomer('tenant-a',{...input,signals:[
   {...make(1),organizationId:'other'}]},fixed)).toThrow('Cross-tenant');
 });
 it('E36 enforces qualified review for regulated and crisis PR without distribution authority',()=>{
  const packet={organizationId:'tenant-a',briefId:'brief-1',type:'CRISIS_RESPONSE',
   regulatedClaim:true,claimEvidence:[{organizationId:'tenant-a',claimId:'approved-1',
    sourceReference:'internal:scientific-claim-1',authorityVerified:true,rightsReviewed:true}]};
  const r=reviewCorporateCommunication('tenant-a',packet);
  expect(r.reviewRoles).toEqual(['COMMUNICATIONS_OWNER','BRAND_OWNER',
   'LEGAL_OR_COMPLIANCE_REVIEWER','QUALIFIED_SCIENTIFIC_REVIEWER']);
  expect(r).toMatchObject({engineId:'E36',releaseAuthorized:false,
   humanApprovalRequired:true,status:'REVIEW_REQUIRED'});
  expect(reviewCorporateCommunication('tenant-a',{...packet,claimEvidence:[]}).status)
   .toBe('INSUFFICIENT_EVIDENCE');
 });
 it('E20 models assumptions only and labels no causal lift as verified',()=>{
  const r=reviewRevenueScenario('tenant-a',{
   organizationId:'tenant-a',currency:'USD',sourceReference:'internal:scenario',
   incrementalCostMicros:'5000000',assumedQualifiedLeadCount:'2',
   assumedValueMicrosPerLead:'10000000'});
  expect(r).toMatchObject({modeledGrossValueMicros:'20000000',
   modeledNetValueMicros:'15000000',modeledROIBasisPoints:'30000',
   causalLiftVerified:false,independentlyVerified:false,scenarioOnly:true});
  expect(reviewRevenueScenario('tenant-a',{organizationId:'tenant-a',currency:'USD',
   sourceReference:'internal:scenario'}).status).toBe('INSUFFICIENT_EVIDENCE');
  expect(()=>reviewRevenueScenario('tenant-a',{organizationId:'tenant-b',currency:'USD',
   sourceReference:'internal:scenario'})).toThrow('Cross-tenant');
 });
 it('E14 detects material edit, unverifiable editability and rights expiry',()=>{
  const input={organizationId:'tenant-a',assetId:'asset-a',renditionDigest:digest,
   approvedRenditionDigest:digest,assetKind:'EDITABLE_DESIGN_SOURCE',
   editableProviderVerified:true,editableSourceRef:'internal:design-123',
   rightsReviewed:true,rightsExpiry:'2027-05-01',contentCredentials:'SIGNED_VALID'};
  const good=reviewAssetAuthenticity('tenant-a',input,fixed);
  expect(good).toMatchObject({status:'REVIEW_REQUIRED',digestMatchesApproval:true,
   editableSourceClaimSupported:true,approvalValid:false});
  const changed=reviewAssetAuthenticity('tenant-a',{
   ...input,renditionDigest:'sha256:'+'b'.repeat(64)},fixed);
  expect(changed.status).toBe('BLOCKED');
  expect(changed.reasons).toContain('material_rendition_change_revokes_prior_approval');
  const falseEdit=reviewAssetAuthenticity('tenant-a',{
   ...input,editableProviderVerified:false},fixed);
  expect(falseEdit.editableSourceClaimSupported).toBe(false);
  const expired=reviewAssetAuthenticity('tenant-a',{
   ...input,rightsExpiry:'2020-01-01'},fixed);
  expect(expired.reasons).toContain('rights_expired_or_unreviewed');
 });
 it('WF40 requires authoritative product and territory grant with no partner dispatch',()=>{
  const raw={organizationId:'tenant-a',productId:'sku-1',territory:'EG',
   partnerGrantVerified:true,productSourceVerified:true,productSourceVersion:'v3',
   claimEvidenceReviewed:true};
  expect(reviewPartnerEnablement('tenant-a',raw)).toMatchObject({
   workflowId:'WF40',status:'REVIEW_REQUIRED',dispatchAuthorized:false});
  expect(reviewPartnerEnablement('tenant-a',{...raw,partnerGrantVerified:false})
   .reasons).toContain('territory_and_partner_grant_required');
 });
 it('WF41 activation remains an independent acceptance decision even with all self-reported checks',()=>{
  const base={organizationId:'tenant-a',tenantIsolationVerified:true,
   brandMasterReviewed:true,identityConfigured:true,rolesAndEntitlementsVerified:true,
   exactVersionApprovalsVerified:true,dataRightsReviewed:true,providerCapabilityVerified:true,
   incidentRunbookAccepted:true};
  expect(reviewCustomerActivation('tenant-a',base)).toMatchObject({
   passedChecks:8,totalChecks:8,readyForCustomerPilot:false,productionAuthorized:false});
  const bad=reviewCustomerActivation('tenant-a',{...base,identityConfigured:false});
  expect(bad.status).toBe('BLOCKED');
  expect(bad.reasons).toContain('required_identityConfigured');
 });
 it('all new review engines execute under the same seven canonical agents, with no side effects',async()=>{
  const cases=[
   ['MKT-STR-001','searchDiscoveryInput',{organizationId:'tenant-a',brandId:'brand-a',observations:[]}],
   ['MKT-SOC-001','voiceOfCustomerInput',{organizationId:'tenant-a',brandId:'brand-a',signals:[]}],
   ['MKT-CONT-001','corporateCommunicationInput',{organizationId:'tenant-a',briefId:'br',
    type:'PRESS_RELEASE',claimEvidence:[]}],
   ['MKT-ANA-001','revenueScenarioInput',{organizationId:'tenant-a',currency:'USD',
    sourceReference:'internal:scenario'}],
   ['MKT-CREATIVE-001','assetAuthenticityInput',{organizationId:'tenant-a',
    assetId:'asset',renditionDigest:digest,approvedRenditionDigest:digest,
    assetKind:'FLATTENED_EXPORT',rightsExpiry:'2027-01-01',rightsReviewed:true,
    contentCredentials:'UNVERIFIED'}],
   ['MKT-PM-001','partnerEnablementInput',{organizationId:'tenant-a',
    productId:'sku',territory:'EG'}],
   ['MKT-OPS-001','customerActivationInput',{organizationId:'tenant-a'}]
  ] as const;
  const registry=new AgentRegistry();
  for(const manifest of AGENT_ROSTER)registry.register(new MarketingDomainAgent(manifest));
  expect(registry.list().length).toBe(13);
  for(const [id,key,value] of cases){
   const manifest=AGENT_ROSTER.find(a=>a.id===id)!;
   const result=await new AgentRuntime(registry).execute(id,{
    executionId:'integration-test',organizationId:'tenant-a',correlationId:'corr',
    capabilities:[manifest.capabilities[0]!],input:{[key]:value,requestedOutcome:'Review only'}
   });
   const packet=result.payload as {expansionReview?:{externalEffectsAuthorized:boolean};controls:{externalEffectPermitted:boolean}};
   expect(result.executionAllowed).toBe(true);
   expect(result.approvalRequired).toBe(true);
   expect(packet.expansionReview?.externalEffectsAuthorized).toBe(false);
   expect(packet.controls.externalEffectPermitted).toBe(false);
  }
 });
});
