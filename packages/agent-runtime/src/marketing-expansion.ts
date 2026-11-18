/**
 * Blueprint v2.1 — deterministic capability review for the existing agents.
 * Pure, in-memory assessments. No retrieval, AI model, CRM, social, email, media
 * generation, irreversible command, or new authoritative data storage.
 * Callers must authenticate the actor and provide tenant-scoped source records.
 */
export type ReviewState='REVIEW_REQUIRED'|'INSUFFICIENT_EVIDENCE'|'BLOCKED';
type Core={status:ReviewState;humanApprovalRequired:true;externalEffectsAuthorized:false;
 independentlyVerified:false;reasons:string[]};
type JSONObject=Record<string,unknown>;
function obj(value:unknown):JSONObject {
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Structured assessment input required');
 return value as JSONObject;
}
function nonempty(v:unknown,name:string,max=200):string {
 if(typeof v!=='string'||!v.trim()||v.length>max)throw new Error('Invalid '+name);
 return v.trim();
}
function scoped(tenant:string,v:JSONObject):void {
 if(!tenant.trim()||v.organizationId!==tenant)throw new Error('Cross-tenant or missing source scope prohibited');
}
function list(v:unknown,name:string,max=100):JSONObject[] {
 if(!Array.isArray(v)||v.length>max)throw new Error('Invalid or oversized '+name);
 return v.map(obj);
}
function stamp(v:unknown,asOf:Date):string {
 const s=nonempty(v,'observation timestamp',40),time=Date.parse(s);
 if(!Number.isFinite(time)||time>asOf.getTime()+60_000||time<asOf.getTime()-3*365*86400_000)
  throw new Error('Evidence timestamp outside reviewed time window');
 return new Date(time).toISOString();
}
function sourceRef(v:unknown):string {
 const s=nonempty(v,'source reference',500);
 if(!s.startsWith('internal:')&&!/^https:\/\/[^/\s]+\/\S*/.test(s))
  throw new Error('Source must be an internal record or an HTTPS evidence URL');
 return s;
}
function base(status:ReviewState,reasons:string[]):Core{
 return{status,humanApprovalRequired:true,externalEffectsAuthorized:false,
  independentlyVerified:false,reasons};
}

export type SearchDiscoveryReview=Core&{
 engineId:'E34';brandId:string;observationCount:number;reviewedCount:number;
 organicPositionObservedCount:number;aiAnswerMentionCount:number;aiAnswerSampleCount:number;
 aiAnswerMentionRatePercent:number|null;
};
export function reviewSearchDiscovery(organizationId:string,raw:unknown,asOf=new Date()):SearchDiscoveryReview {
 const doc=obj(raw);scoped(organizationId,doc);
 const brandId=nonempty(doc.brandId,'brand ID',128);
 const rows=list(doc.observations,'search visibility observations',100);
 const ids=new Set<string>();
 let accepted=0,organic=0,aiSamples=0,aiMentions=0;
 for(const r of rows){
  scoped(organizationId,r);
  const id=nonempty(r.sourceId,'source ID',128);
  if(ids.has(id))throw new Error('Duplicate discovery evidence source ID');
  ids.add(id);
  if(r.channel!=='ORGANIC_SEARCH'&&r.channel!=='AI_ANSWER')throw new Error('Unsupported discovery channel');
  nonempty(r.queryId,'query reference',128);
  stamp(r.observedAt,asOf);
  sourceRef(r.sourceReference);
  if(typeof r.brandMentioned!=='boolean'||typeof r.reviewed!=='boolean'||
     typeof r.collectionPermitted!=='boolean')throw new Error('Invalid discovery provenance flags');
  if(r.position!==undefined&&r.position!==null&&
     (!Number.isSafeInteger(r.position)||(r.position as number)<1||(r.position as number)>1000))
   throw new Error('Invalid organic search position');
  if(r.channel==='AI_ANSWER'&&r.position!=null)
   throw new Error('AI answer mention is not an organic search ranking');
  if(r.reviewed&&r.collectionPermitted){
   accepted++;
   if(r.channel==='ORGANIC_SEARCH'&&r.position!=null)organic++;
   if(r.channel==='AI_ANSWER'){
    aiSamples++;if(r.brandMentioned)aiMentions++;
   }
  }
 }
 const reasons=accepted?['observed_sample_not_population_or_verified_ai_recommendation']:
  ['eligible_reviewed_discovery_evidence_required'];
 if(accepted<rows.length)reasons.push('unreviewed_or_unpermitted_observations_excluded');
 return{...base(accepted?'REVIEW_REQUIRED':'INSUFFICIENT_EVIDENCE',reasons),
  engineId:'E34',brandId,observationCount:rows.length,reviewedCount:accepted,
  organicPositionObservedCount:organic,aiAnswerMentionCount:aiMentions,
  aiAnswerSampleCount:aiSamples,
  aiAnswerMentionRatePercent:aiSamples?Number((100*aiMentions/aiSamples).toFixed(2)):null};
}

const FEEDBACK_THEMES=['PRODUCT_QUALITY','ONBOARDING','PRICE_VALUE','SUPPORT','USABILITY',
 'TRUST','FEATURE_REQUEST','DELIVERY','OTHER'] as const;
type FeedbackTheme=typeof FEEDBACK_THEMES[number];
const FEEDBACK_SOURCES=['FIRST_PARTY_SURVEY','AUTHORIZED_CRM','SUPPORT_CASE',
 'PUBLIC_REVIEW_WITH_RIGHTS'] as const;
export type VoiceOfCustomerReview=Core&{
 engineId:'E35';totalSubmitted:number;eligibleCount:number;excludedCount:number;
 publishableCohort:boolean;themeCounts:Partial<Record<FeedbackTheme,number>>;
 rawPersonalDataReturned:false;
};
export function reviewVoiceOfCustomer(organizationId:string,raw:unknown,asOf=new Date()):VoiceOfCustomerReview {
 const doc=obj(raw);scoped(organizationId,doc);
 nonempty(doc.brandId,'brand ID',128);
 const rows=list(doc.signals,'customer feedback',100);
 const ids=new Set<string>(),counts:Partial<Record<FeedbackTheme,number>>={};
 let eligible=0,excluded=0;
 for(const r of rows){
  scoped(organizationId,r);
  const sourceId=nonempty(r.sourceId,'source ID',128);
  if(ids.has(sourceId))throw new Error('Duplicate feedback record');
  ids.add(sourceId);
  if(!FEEDBACK_THEMES.includes(r.theme as FeedbackTheme)||
     !FEEDBACK_SOURCES.includes(r.sourceType as typeof FEEDBACK_SOURCES[number]))
   throw new Error('Unsupported customer feedback taxonomy or source');
  stamp(r.observedAt,asOf);
  sourceRef(r.sourceReference);
  // A feedback ingest contract deliberately excludes raw text and direct
  // identifiers; redact/minimize before it reaches a multi-agent work package.
  for(const forbidden of ['text','rawText','email','phone','personName','contactId','customerId','address','demographics']){
   if(Object.prototype.hasOwnProperty.call(r,forbidden))
    throw new Error('Raw customer identity or text prohibited in intelligence input');
  }
  if(typeof r.purposeAllowed!=='boolean'||typeof r.sourceReviewed!=='boolean')
   throw new Error('Feedback rights and review flags required');
  if(!r.purposeAllowed||!r.sourceReviewed){excluded++;continue;}
  eligible++;
  const theme=r.theme as FeedbackTheme;
  counts[theme]=(counts[theme]??0)+1;
 }
 // Suppress all theme counts for small cohorts; prevent exposing tiny groups
 // as a proxy for particular people. Subsequent privacy review still required.
 const publishableCohort=eligible>=5;
 const reasons=publishableCohort?['privacy_and_representativeness_review_required']:
  ['cohort_below_minimum_five_or_missing_authorized_sources'];
 if(excluded)reasons.push('unreviewed_or_out_of_purpose_feedback_excluded');
 return{...base(publishableCohort?'REVIEW_REQUIRED':'INSUFFICIENT_EVIDENCE',reasons),
  engineId:'E35',totalSubmitted:rows.length,eligibleCount:eligible,excludedCount:excluded,
  publishableCohort,themeCounts:publishableCohort?
   Object.fromEntries(Object.entries(counts).filter(([,n])=>n>=5)) as Partial<Record<FeedbackTheme,number>>:{},
  rawPersonalDataReturned:false};
}

export type CorporateCommunicationReview=Core&{
 engineId:'E36';briefId:string;communicationType:string;
 reviewRoles:string[];approvedEvidenceCount:number;releaseAuthorized:false;
};
export function reviewCorporateCommunication(organizationId:string,raw:unknown):CorporateCommunicationReview {
 const doc=obj(raw);scoped(organizationId,doc);
 const briefId=nonempty(doc.briefId,'communication brief ID',128);
 const kinds=['PRESS_RELEASE','EARNED_MEDIA_PITCH','EXECUTIVE_STATEMENT','CRISIS_RESPONSE'] as const;
 if(!kinds.includes(doc.type as typeof kinds[number]))throw new Error('Unsupported communications type');
 const evidence=list(doc.claimEvidence,'communication evidence',30);
 let approvedCount=0;
 for(const r of evidence){
  scoped(organizationId,r);nonempty(r.claimId,'claim ID',128);sourceRef(r.sourceReference);
  if(r.authorityVerified===true&&r.rightsReviewed===true)approvedCount++;
 }
 const reviewRoles=['COMMUNICATIONS_OWNER','BRAND_OWNER'];
 if(doc.type==='CRISIS_RESPONSE'||doc.type==='EXECUTIVE_STATEMENT')
  reviewRoles.push('LEGAL_OR_COMPLIANCE_REVIEWER');
 if(doc.regulatedClaim===true)reviewRoles.push('QUALIFIED_SCIENTIFIC_REVIEWER');
 if(doc.regulatedClaim!==undefined&&typeof doc.regulatedClaim!=='boolean')
  throw new Error('Invalid regulated claim review flag');
 const reasons=approvedCount===evidence.length&&evidence.length>0?
  ['human_media_legal_and_brand_release_required']:
  ['authoritative_claims_and_rights_evidence_missing'];
 return{...base(approvedCount===evidence.length&&evidence.length>0?
    'REVIEW_REQUIRED':'INSUFFICIENT_EVIDENCE',reasons),
  engineId:'E36',briefId,communicationType:doc.type as string,reviewRoles,
  approvedEvidenceCount:approvedCount,releaseAuthorized:false};
}

export type RevenueScenarioReview=Core&{
 engineId:'E20';currency:string;
 scenarioOnly:true;incrementalCostMicros:string|null;
 modeledGrossValueMicros:string|null;modeledNetValueMicros:string|null;
 modeledROIBasisPoints:string|null;causalLiftVerified:false;
};
export function reviewRevenueScenario(organizationId:string,raw:unknown):RevenueScenarioReview {
 const doc=obj(raw);scoped(organizationId,doc);
 const currency=nonempty(doc.currency,'ISO currency code',3);
 if(!/^[A-Z]{3}$/.test(currency))throw new Error('Invalid ISO currency code');
 sourceRef(doc.sourceReference);
 const values=['incrementalCostMicros','assumedQualifiedLeadCount','assumedValueMicrosPerLead'];
 const missing=values.filter(k=>typeof doc[k]!=='string'||!/^\d{1,18}$/.test(doc[k] as string));
 if(missing.length)return{...base('INSUFFICIENT_EVIDENCE',['bounded_scenario_assumptions_required']),
  engineId:'E20',currency,scenarioOnly:true,incrementalCostMicros:null,
  modeledGrossValueMicros:null,modeledNetValueMicros:null,
  modeledROIBasisPoints:null,causalLiftVerified:false};
 const cost=BigInt(doc.incrementalCostMicros as string);
 const leadCount=BigInt(doc.assumedQualifiedLeadCount as string);
 const assumedValue=BigInt(doc.assumedValueMicrosPerLead as string);
 const gross=leadCount*assumedValue;
 const net=gross-cost;
 return{...base('REVIEW_REQUIRED',['scenario_assumptions_not_observed_revenue',
   'causal_lift_requires_controlled_experiment','finance_budget_approval_required']),
  engineId:'E20',currency,scenarioOnly:true,incrementalCostMicros:cost.toString(),
  modeledGrossValueMicros:gross.toString(),modeledNetValueMicros:net.toString(),
  modeledROIBasisPoints:cost>0n?(net*10000n/cost).toString():null,
  causalLiftVerified:false};
}

export type AssetAuthenticityReview=Core&{
 engineId:'E14';assetId:string;digestMatchesApproval:boolean;
 editableSourceClaimSupported:boolean;contentCredentials:string;approvalValid:false;
};
export function reviewAssetAuthenticity(organizationId:string,raw:unknown,asOf=new Date()):AssetAuthenticityReview {
 const doc=obj(raw);scoped(organizationId,doc);
 const assetId=nonempty(doc.assetId,'asset ID',128);
 const digest=(s:unknown)=>typeof s==='string'&&/^sha256:[0-9a-f]{64}$/.test(s);
 if(!digest(doc.renditionDigest)||!digest(doc.approvedRenditionDigest))
  throw new Error('Exact SHA-256 rendition hashes required');
 const digestMatchesApproval=doc.renditionDigest===doc.approvedRenditionDigest;
 if(!['EDITABLE_DESIGN_SOURCE','FLATTENED_EXPORT'].includes(doc.assetKind as string))
  throw new Error('Explicit editability classification required');
 const credentials=['UNVERIFIED','SIGNED_VALID','SIGNED_INVALID','NOT_SUPPORTED'];
 if(!credentials.includes(doc.contentCredentials as string))
  throw new Error('Content credential verification state required');
 const rightsExpiry=Date.parse(nonempty(doc.rightsExpiry,'asset rights expiry date',40));
 if(!Number.isFinite(rightsExpiry))throw new Error('Invalid asset rights expiry');
 const rightsValid=rightsExpiry>=asOf.getTime()&&doc.rightsReviewed===true;
 const editable=doc.assetKind==='EDITABLE_DESIGN_SOURCE'&&
  doc.editableProviderVerified===true&&typeof doc.editableSourceRef==='string'&&
  (doc.editableSourceRef as string).startsWith('internal:');
 const reasons:string[]=[];
 if(!digestMatchesApproval)reasons.push('material_rendition_change_revokes_prior_approval');
 if(!rightsValid)reasons.push('rights_expired_or_unreviewed');
 if(doc.contentCredentials==='SIGNED_INVALID')reasons.push('invalid_content_credentials');
 if(doc.assetKind==='EDITABLE_DESIGN_SOURCE'&&!editable)reasons.push('editability_claim_unverified');
 if(!reasons.length)reasons.push('final_asset_publication_approval_still_required');
 return{...base(reasons.length===1&&reasons[0]==='final_asset_publication_approval_still_required'?
   'REVIEW_REQUIRED':'BLOCKED',reasons),
  engineId:'E14',assetId,digestMatchesApproval,
  editableSourceClaimSupported:editable,
  contentCredentials:doc.contentCredentials as string,approvalValid:false};
}

export type PartnerEnablementReview=Core&{
 workflowId:'WF40';productId:string;territory:string;partnerGrantVerified:boolean;
 sourceVersionVerified:boolean;claimEvidenceReady:boolean;dispatchAuthorized:false;
};
export function reviewPartnerEnablement(organizationId:string,raw:unknown):PartnerEnablementReview {
 const doc=obj(raw);scoped(organizationId,doc);
 const productId=nonempty(doc.productId,'product ID',128),territory=nonempty(doc.territory,'territory',100);
 const reasons:string[]=[];
 if(doc.partnerGrantVerified!==true)reasons.push('territory_and_partner_grant_required');
 if(doc.productSourceVerified!==true||!doc.productSourceVersion)
  reasons.push('authoritative_product_revision_required');
 if(doc.claimEvidenceReviewed!==true)reasons.push('product_claims_review_required');
 const status:ReviewState=reasons.length?'BLOCKED':'REVIEW_REQUIRED';
 if(!reasons.length)reasons.push('sales_collateral_requires_exact_brand_and_rights_approval');
 return{...base(status,reasons),workflowId:'WF40',productId,territory,
  partnerGrantVerified:doc.partnerGrantVerified===true,
  sourceVersionVerified:doc.productSourceVerified===true&&!!doc.productSourceVersion,
  claimEvidenceReady:doc.claimEvidenceReviewed===true,dispatchAuthorized:false};
}

export type ActivationReadinessReview=Core&{workflowId:'WF41';passedChecks:number;
 totalChecks:number;readyForCustomerPilot:boolean;productionAuthorized:false};
export function reviewCustomerActivation(organizationId:string,raw:unknown):ActivationReadinessReview{
 const doc=obj(raw);scoped(organizationId,doc);
 const checks=['tenantIsolationVerified','brandMasterReviewed','identityConfigured',
  'rolesAndEntitlementsVerified','exactVersionApprovalsVerified',
  'dataRightsReviewed','providerCapabilityVerified','incidentRunbookAccepted'];
 const passed=checks.filter(k=>doc[k]===true).length;
 const missing=checks.filter(k=>doc[k]!==true);
 // This pure checklist cannot certify external staging/production; even an
 // all-green self-report requires independently signed acceptance evidence.
 return{...base(passed===checks.length?'REVIEW_REQUIRED':'BLOCKED',
  missing.length?missing.map(k=>'required_'+k):['independent_staging_uat_and_release_signoff_required']),
  workflowId:'WF41',passedChecks:passed,totalChecks:checks.length,
  readyForCustomerPilot:false,productionAuthorized:false};
}
