import {OFFLINE_CAMPAIGN_STAGE_KEYS} from '@medsol/contracts';
import {describe,it,expect} from 'vitest';
import {dossierCsv,dossierPillarCsv,DOSSIER_PILLARS,validateDossierForExport,type DeliveryDossier} from './customer-delivery-dossier-export';
const fixture=():DeliveryDossier=>({
 schema:'medsol.customer_delivery_dossier.v1',organizationId:'tenant-a',
 campaign:{id:'campaign-1',code:'OFFLINE',name:'=HYPERLINK("http://evil.invalid")',
  status:'APPROVED',brandId:'brand-a'},
 observedAt:'2026-11-23T10:00:00.000Z',status:'OFFLINE_EVIDENCE_ONLY',
 offlineGatesMet:8,offlineGatesTotal:10,
 stages:OFFLINE_CAMPAIGN_STAGE_KEYS.map((key,i)=>({key,
  status:i<8?'OFFLINE_GATE_MET' as const:'NOT_DEMONSTRATED' as const})),
 missingOfflineGates:[OFFLINE_CAMPAIGN_STAGE_KEYS[8]!,OFFLINE_CAMPAIGN_STAGE_KEYS[9]!],
 pillars:{
  creative:{brandScopedDraftRevisions:1,campaignLinkedRevisions:1,
   currentLinkedRightsAndApprovalReviewed:1,status:'APPROVED_OFFLINE_SCOPE'},
  social:{publicationIntents:1,sandboxSimulated:1,status:'SANDBOX_ONLY',realPostsPublished:0},
  email:{syntheticSimulations:1,status:'SYNTHETIC_ONLY',actualMessagesSent:0,
   legalConsentVerified:false},
  intelligence:{tenantWideReviewedTopics:[],tenantWideReviewedSignals:3,
   campaignLinkedQuarantinedSignals:1,
   sourceScope:'TENANT_WIDE_NOT_CAMPAIGN_ATTRIBUTED',
   marketClaimsIndependentlyVerified:false},
  conversion:{reviewedLeadCount:'12',reviewedQualifiedLeadCount:'5',
   clickToLeadPercent:null,leadQualificationPercent:41.66,
   crmQualifiedOutcomesVerified:false,causalAttributionVerified:false},
  commercial:{sourceStatus:'REVIEWED_SOURCE_EVIDENCE',
   reviewedTotals:{leads:'12',qualified_leads:'5'},
   derived:{ctrPercent:null},pendingReviewCount:1,
   evidenceWarnings:['OBSERVATION_COHORTS_NOT_RECONCILED'],
   revenueVerified:false,roiVerified:false,spendCurrencyVerified:false}
 },
 limitations:['No real provider effects'],signed:false,independentlyVerified:false,
 externalEffectsAuthorized:false,realProviderDeliveryVerified:false,
 productionStatus:'NOT_CERTIFIED'
});
describe('T8A operator dossier export safety',()=>{
 it('exports exact combined commercial aggregate without accepting invented arithmetic or extra identifiers',()=>{
  const d=fixture(),summary={status:'EXACT_COMBINED_MATCH' as const,sourceDigest:'sha256:'+'a'.repeat(64),
   matchedGroups:1,excludedGroups:0,invalidGrossProfitGroups:0,independentVerification:false as const,attributionValidated:false as const,
   revenueVerified:false as const,roiValidated:false as const,fxConversionPerformed:false as const,externalEffectsAuthorized:false as const,
   currencies:[{currency:'EGP',matchedGroups:1,impressions:'1000',clicks:'200',leads:'20',qualifiedLeads:'5',
    reportedSpendMicros:'12000000',reportedRevenueMicros:'36000000',reportedGrossProfitMicros:null,grossProfitMatchedGroups:0,
    spendMicrosPerLead:'600000',spendMicrosPerQualifiedLead:'2400000',reportedRevenueToSpendRatio:'3.0000'}]};
  d.pillars.commercial.combinedCommercial=summary;
  expect(dossierPillarCsv(d,'commercial')).toContain('EGP_reportedRevenueToSpendRatio');
  expect(dossierPillarCsv(d,'commercial')).toContain('REPORTED_SAME_CURRENCY_NO_CAUSAL_ATTRIBUTION');
  summary.currencies[0]!.reportedRevenueToSpendRatio='30.0000';
  expect(()=>dossierCsv(d)).toThrow('arithmetic');
  summary.currencies[0]!.reportedRevenueToSpendRatio='3.0000';
  Object.assign(summary.currencies[0]!,{contactId:'forged'});
  expect(()=>dossierCsv(d)).toThrow('Invalid combined commercial dossier');
 });
 it('exports all six sections with explicit offline qualifications and CSV formula protection',()=>{
  const csv=dossierCsv(fixture());
  for(const section of ['creative','social','email','intelligence','conversion','commercial'])
   expect(csv).toContain('"'+section+'"');
  expect(csv).toContain("'=HYPERLINK");
  expect(csv).toContain('NOT_CERTIFIED');
  expect(csv).not.toContain('actual-recipient');
 });
 it('emits one sanitized export per each of six existing customer engines',()=>{
  const d=fixture();
  for(const pillar of DOSSIER_PILLARS){
   const data=dossierPillarCsv(d,pillar);
   expect(data).toContain('"NOT_CERTIFIED"');
   expect(data).toContain('"'+pillar+'"');
   expect(data).not.toContain('private@example.com');
   expect(data).not.toContain('social_access_token');
   if(pillar!=='email')expect(data).not.toContain('"email","synthetic_simulations"');
   else expect(data).toContain('"email","synthetic_simulations"');
  }
 });
 it('exports bounded historical synthetic ledger counts only, refusing fabricated outcomes',()=>{
  const d=fixture();
  d.pillars.conversion.syntheticLedger={status:'BOUNDED_HISTORICAL_SYNTHETIC_LEDGER',syntheticOnly:true,actualLeadsCreated:0,
   actualCrmWrites:0,realConsentVerified:false,externalEffectsAuthorized:false,counts:{forms:1,approvedFormDecisions:1,submissions:1,
    mockAccepted:0,mockRejected:0,outcomeUnknown:1,protocolRecorded:1,qualificationReviews:1,independentInternalQualificationApprovals:1}};
  const data=dossierPillarCsv(d,'conversion');
  expect(data).toContain('independentInternalQualificationApprovals');expect(data).toContain('SYNTHETIC_ONLY_NOT_CRM_VERIFIED');
  d.pillars.conversion.syntheticLedger.counts!.mockAccepted=2;
  expect(()=>dossierCsv(d)).toThrow('Invalid synthetic conversion dossier counts');
  d.pillars.conversion.syntheticLedger={...d.pillars.conversion.syntheticLedger,status:'WINDOW_CAPPED',counts:null};
  expect(dossierPillarCsv(d,'conversion')).toContain('WINDOW_CAPPED');
 });
 it('rejects renamed or reordered stages, faked missing-gate counts and CRM claims',()=>{
  const wrong=fixture();
  wrong.stages[0]!.key='other-stage';
  expect(()=>dossierCsv(wrong)).toThrow('Unsafe');
  const unlisted=fixture();
  unlisted.missingOfflineGates=[];
  expect(()=>dossierCsv(unlisted)).toThrow('Unsafe');
  const consent=fixture();consent.pillars.email.legalConsentVerified=true as false;
  expect(()=>dossierCsv(consent)).toThrow('Unsafe');
  const crm=fixture();crm.pillars.conversion.crmQualifiedOutcomesVerified=true as false;
  expect(()=>dossierCsv(crm)).toThrow('Unsafe');
  expect(()=>dossierPillarCsv(fixture(),'fake' as any)).toThrow('Unsupported');
 });
 it('refuses forged release, real delivery, attribution and missing stage evidence',()=>{
  for(const change of [
   {productionStatus:'CERTIFIED'},{signed:true},
   {externalEffectsAuthorized:true},{independentlyVerified:true}
  ]){
   expect(()=>validateDossierForExport({...fixture(),...change} as DeliveryDossier))
    .toThrow('Unsafe');
  }
  const real=fixture();real.pillars.social.realPostsPublished=1 as 0;
  expect(()=>dossierCsv(real)).toThrow('Unsafe');
  const broken=fixture();broken.stages.pop();
  expect(()=>dossierCsv(broken)).toThrow('Unsafe');
 });
});
