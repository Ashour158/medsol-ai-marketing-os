import {OFFLINE_CAMPAIGN_STAGE_KEYS} from '@medsol/contracts';
import {describe,it,expect} from 'vitest';
import {buildCustomerDeliveryDossier} from './customer-delivery-dossier.js';
const now=new Date('2026-11-23T10:00:00Z');
const journey=()=>({
 campaign:{id:'campaign-1',code:'MKT-001',name:'Offline scientific campaign',
  status:'APPROVED',brandId:'brand-1'},
 stages:Object.fromEntries(OFFLINE_CAMPAIGN_STAGE_KEYS.map((key,i)=>[key,i<7])),
 creativeAssets:[{revisionId:'revision-1',publicationLinked:true,current:true,
  rightsReviewedAt:now,approvals:[{decision:'APPROVED'}]},
  {revisionId:'revision-2',publicationLinked:false,current:true,
   rightsReviewedAt:null,approvals:[]}],
 publications:[{id:'publication-1',status:'SIMULATED',attempts:[{mode:'SANDBOX'}]}],
 emailSimulations:[{id:'simulation-1',status:'SIMULATED',
  syntheticRecipientRef:'private-contact-reference',result:{recipientEmail:'private@example.com'}}],
 learningSignals:[{status:'QUARANTINED'}],
 offlineSimulationOnly:true,externalEffectsAuthorized:false,
 productionCertified:false,realProvidersConnectedByJourney:false
});
const performance=()=>({
 organizationId:'tenant-1',campaign:{id:'campaign-1'},status:'REVIEWED_SOURCE_EVIDENCE',
 totals:{leads:'12',qualified_leads:'5',spend_micros:'12000000'},
 derived:{ctrPercent:null,clickToLeadPercent:null,
  leadQualificationPercent:41.66,spendMicrosPerLead:'1000000',
  spendMicrosPerQualifiedLead:'2400000'},
 pendingReviewCount:1,warnings:['OBSERVATION_COHORTS_NOT_RECONCILED'],
 attributionValidated:false,roiValidated:false,revenueVerified:false,
 independentlyVerified:false,providerAccessToken:'secret-provider-token'
});
const market=()=>({
 organizationId:'tenant-1',topics:[{topic:'Molecular research',sector:'Biotechnology',evidenceCount:3,
  distinctSourceHosts:2,priority:'RESEARCH_PRIORITY',freshness:'OBSERVED_WITHIN_90_DAYS'}],
 processed:3,independentVerification:false,marketSizeVerified:false
});
const conversion=()=>({organizationId:'tenant-1',campaignId:'campaign-1',windowCapped:false,syntheticOnly:true,externalEffectsAuthorized:false,
 forms:[{formId:'form-1',campaignId:'campaign-1',brandId:'brand-1',approvalDecision:'APPROVED',syntheticOnly:true,publicFormHosted:false,externalEffectsAuthorized:false}],
 submissions:[{submissionId:'submission-1',formId:'form-1',contactId:'private-fixture-id',outcome:'OUTCOME_UNKNOWN',syntheticOnly:true,
  realConsentVerified:false,actualLeadsCreated:0,crmHandoffsExecuted:0,automaticRetryAuthorized:false,externalEffectsAuthorized:false,
  protocolEvidence:{fixtureOnly:true,actualCrmRequests:0,verifiedRemoteReceipts:0,automaticRetryAuthorized:false,externalEffectsAuthorized:false}}],
 qualifications:[{submissionId:'submission-1',decision:'APPROVED',independentInternalReviewRecorded:true,syntheticOnly:true,
  realLeadVerified:false,crmWriteAuthorized:false,externalEffectsAuthorized:false}]});
describe('T8A six-engine read-only customer dossier',()=>{
 it('projects linked creative, virtual social/email, tenant-wide intelligence and reviewed KPIs without PII',()=>{
  const d=buildCustomerDeliveryDossier('tenant-1',journey(),performance(),market(),now);
  expect(d).toMatchObject({schema:'medsol.customer_delivery_dossier.v1',
   status:'OFFLINE_EVIDENCE_ONLY',offlineGatesMet:7,offlineGatesTotal:10,
   productionStatus:'NOT_CERTIFIED',signed:false,
   independentlyVerified:false,externalEffectsAuthorized:false,
   realProviderDeliveryVerified:false,
   pillars:{
    creative:{brandScopedDraftRevisions:2,campaignLinkedRevisions:1,
     currentLinkedRightsAndApprovalReviewed:1},
    social:{sandboxSimulated:1,realPostsPublished:0},
    email:{syntheticSimulations:1,actualMessagesSent:0,legalConsentVerified:false},
    intelligence:{sourceScope:'TENANT_WIDE_NOT_CAMPAIGN_ATTRIBUTED',
     campaignLinkedQuarantinedSignals:1},
    conversion:{reviewedQualifiedLeadCount:'5',causalAttributionVerified:false},
    commercial:{revenueVerified:false,roiVerified:false,spendCurrencyVerified:false}
   }});
  const json=JSON.stringify(d);
  expect(json).not.toContain('private@example.com');
  expect(json).not.toContain('private-contact-reference');
  expect(json).not.toContain('secret-provider-token');
  expect(json).not.toContain('recipientEmail');
 });
 it('projects bounded historical conversion and qualification counts without identifiers',()=>{
  const d=buildCustomerDeliveryDossier('tenant-1',journey(),performance(),market(),now,conversion());
  expect(d.pillars.conversion.syntheticLedger).toMatchObject({status:'BOUNDED_HISTORICAL_SYNTHETIC_LEDGER',
   counts:{forms:1,approvedFormDecisions:1,submissions:1,mockAccepted:0,mockRejected:0,outcomeUnknown:1,protocolRecorded:1,
    qualificationReviews:1,independentInternalQualificationApprovals:1},actualLeadsCreated:0,actualCrmWrites:0,realConsentVerified:false});
  expect(JSON.stringify(d)).not.toContain('private-fixture-id');expect(JSON.stringify(d)).not.toContain('submission-1');
  expect(buildCustomerDeliveryDossier('tenant-1',journey(),performance(),market(),now,{...conversion(),windowCapped:true}).pillars.conversion.syntheticLedger)
   .toMatchObject({status:'WINDOW_CAPPED',counts:null});
 });
 it('refuses foreign, forged and disconnected conversion evidence',()=>{
  for(const x of [{...conversion(),organizationId:'foreign'},{...conversion(),campaignId:'other'},
   {...conversion(),externalEffectsAuthorized:true},{...conversion(),submissions:conversion().submissions.map(s=>({...s,formId:'unknown'}))},
   {...conversion(),submissions:conversion().submissions.map(s=>({...s,crmHandoffsExecuted:1}))},
   {...conversion(),qualifications:conversion().qualifications.map(q=>({...q,decision:'PENDING'}))}])
   expect(()=>buildCustomerDeliveryDossier('tenant-1',journey(),performance(),market(),now,x)).toThrow('CUSTOMER_DOSSIER_BLOCKED');
 });
 it('rejects cross-campaign source mixing and falsified certification or attribution',()=>{
  expect(()=>buildCustomerDeliveryDossier('tenant-1',journey(),{
   ...performance(),campaign:{id:'campaign-2'}},market(),now)).toThrow('source binding');
  expect(()=>buildCustomerDeliveryDossier('tenant-1',journey(),{
   ...performance(),organizationId:'foreign'},market(),now)).toThrow('source binding');
  expect(()=>buildCustomerDeliveryDossier('tenant-1',journey(),
   performance(),{...market(),organizationId:'foreign'},now)).toThrow('source binding');
  for(const override of [{attributionValidated:true},{roiValidated:true},
   {revenueVerified:true},{independentlyVerified:true}]){
   expect(()=>buildCustomerDeliveryDossier('tenant-1',journey(),
    {...performance(),...override},market(),now)).toThrow('cannot authorize');
  }
  expect(()=>buildCustomerDeliveryDossier('tenant-1',
   {...journey(),externalEffectsAuthorized:true},performance(),market(),now))
   .toThrow('cannot authorize');
  expect(()=>buildCustomerDeliveryDossier('tenant-1',journey(),
   performance(),{...market(),independentVerification:true},now))
   .toThrow('cannot authorize');
 });
 it('fails closed on partial stage evidence, unsafe totals and unbounded source data',()=>{
  expect(()=>buildCustomerDeliveryDossier('tenant-1',
   {...journey(),stages:{brief:true}},performance(),market(),now))
   .toThrow('ten canonical');
  const forged=journey();
  forged.stages={...forged.stages,brandVerification:true};
  delete forged.stages[OFFLINE_CAMPAIGN_STAGE_KEYS[0]!];
  expect(()=>buildCustomerDeliveryDossier('tenant-1',forged,
    performance(),market(),now)).toThrow('ten canonical');
  expect(()=>buildCustomerDeliveryDossier('tenant-1',journey(),
   {...performance(),totals:{leads:'-12'}},market(),now))
   .toThrow('metric');
  expect(()=>buildCustomerDeliveryDossier('tenant-1',
   {...journey(),publications:Array.from({length:21},()=>journey().publications[0]!)},
   performance(),market(),now)).toThrow('Unbounded');
 });
});
