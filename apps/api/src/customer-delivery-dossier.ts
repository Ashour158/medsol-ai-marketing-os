/** T8A read-only cross-engine campaign dossier.
 * Reuses authoritative campaign, DAM, social, email, learning and performance
 * owners. No duplicate writes, customer-contact export or certification.
 */
type CampaignJourney={
 campaign:{id:string;code:string;name:string;status:string;brandId:string|null};
 stages:Record<string,boolean>;
 creativeAssets:Array<{revisionId:string;publicationLinked:boolean;current:boolean;
  rightsReviewedAt:Date|string|null;approvals:Array<{decision:string}>}>;
 publications:Array<{id:string;status:string;attempts:Array<{mode:string}>}>;
 emailSimulations:Array<{id:string;status:string}>;
 learningSignals:Array<{status:string}>;
 offlineSimulationOnly:boolean;externalEffectsAuthorized:boolean;
 productionCertified:boolean;realProvidersConnectedByJourney:boolean;
};
type CampaignMetrics={
 campaign:{id:string};status:string;totals:Record<string,string>;
 derived:{ctrPercent:number|null;clickToLeadPercent:number|null;
  leadQualificationPercent:number|null;spendMicrosPerLead:string|null;
  spendMicrosPerQualifiedLead:string|null};
 pendingReviewCount:number;warnings:string[];
 attributionValidated:boolean;roiValidated:boolean;revenueVerified:boolean;
 independentlyVerified:boolean;
};
type MarketTopics={
 topics:Array<{topic:string;sector:string;evidenceCount:number;
  distinctSourceHosts:number;priority:string;freshness:string}>;
 processed:number;independentVerification:boolean;marketSizeVerified:boolean;
};
const reject=(message:string):never=>{throw Error('CUSTOMER_DOSSIER_BLOCKED: '+message);};
const count=(value:unknown,max:number)=>{
 if(!Array.isArray(value))return reject('Unbounded source evidence');
 if(value.length>max)return reject('Unbounded source evidence');
 return value.length;
};
export function buildCustomerDeliveryDossier(
 organizationId:string,journey:CampaignJourney,
 performance:CampaignMetrics,market:MarketTopics,observedAt:Date
){
 if(!/^[A-Za-z0-9_-]{1,128}$/.test(organizationId)||
    !/^[A-Za-z0-9_-]{1,128}$/.test(journey?.campaign?.id??'')||
    performance?.campaign?.id!==journey.campaign.id||
    !Number.isFinite(observedAt.getTime()))
  reject('Invalid tenant, campaign, source binding or clock');
 if(journey.offlineSimulationOnly!==true||
    journey.externalEffectsAuthorized!==false||
    journey.productionCertified!==false||
    journey.realProvidersConnectedByJourney!==false||
    performance.attributionValidated!==false||
    performance.roiValidated!==false||
    performance.revenueVerified!==false||
    performance.independentlyVerified!==false||
    market.independentVerification!==false||
    market.marketSizeVerified!==false)
  reject('Sources cannot authorize real effects, attribution or release');
 if(!journey.stages||Object.keys(journey.stages).length!==10||
    Object.values(journey.stages).some(v=>typeof v!=='boolean'))
  reject('Expected the ten canonical offline journey stages');
 count(journey.creativeAssets,150);count(journey.publications,20);
 count(journey.emailSimulations,20);count(journey.learningSignals,20);
 count(market.topics,200);
 if(!Number.isSafeInteger(performance.pendingReviewCount)||
    performance.pendingReviewCount<0||!Array.isArray(performance.warnings)||
    performance.warnings.length>30||performance.warnings.some(w=>
      typeof w!=='string'||!/^[A-Z_]{1,90}$/.test(w)))
  reject('Invalid commercial evidence warnings');
 const totals:Record<string,string>={};
 for(const key of ['impressions','clicks','engagements','leads','qualified_leads','spend_micros']){
  const v=performance.totals[key];
  if(v!==undefined){
   if(typeof v!=='string'||!/^\d{1,30}$/.test(v))
    reject('Invalid reviewed metric value');
   totals[key]=v;
  }
 }
 const linked=journey.creativeAssets.filter(a=>a.publicationLinked);
 const reviewed=linked.filter(a=>a.current&&!!a.rightsReviewedAt&&
  a.approvals.some(x=>x.decision==='APPROVED'));
 const simulatedSocial=journey.publications.filter(p=>p.status==='SIMULATED'&&
  p.attempts.some(a=>a.mode==='SANDBOX'));
 const simulatedEmail=journey.emailSimulations.filter(e=>e.status==='SIMULATED');
 const stageEntries=Object.entries(journey.stages);
 const stages=stageEntries.map(([key,complete])=>({key,
  status:complete?'OFFLINE_GATE_MET':'NOT_DEMONSTRATED'}));
 const marketTopics=market.topics.slice(0,12).map(x=>({
  topic:x.topic.slice(0,180),sector:x.sector.slice(0,120),
  evidenceCount:x.evidenceCount,distinctSourceHosts:x.distinctSourceHosts,
  priority:x.priority,freshness:x.freshness
 }));
 const missing=stages.filter(s=>s.status==='NOT_DEMONSTRATED').map(s=>s.key);
 return{
  schema:'medsol.customer_delivery_dossier.v1' as const,
  organizationId,campaign:{
   id:journey.campaign.id,code:journey.campaign.code,
   name:journey.campaign.name,status:journey.campaign.status,
   brandId:journey.campaign.brandId
  },observedAt:observedAt.toISOString(),
  status:'OFFLINE_EVIDENCE_ONLY' as const,
  stages,offlineGatesMet:stages.length-missing.length,
  offlineGatesTotal:10,missingOfflineGates:missing,
  pillars:{
   creative:{brandScopedDraftRevisions:journey.creativeAssets.length,
    campaignLinkedRevisions:linked.length,
    currentLinkedRightsAndApprovalReviewed:reviewed.length,
    status:reviewed.length?'APPROVED_OFFLINE_SCOPE':'INCOMPLETE'},
   social:{publicationIntents:journey.publications.length,
    sandboxSimulated:simulatedSocial.length,
    status:simulatedSocial.length?'SANDBOX_ONLY':'INCOMPLETE',
    realPostsPublished:0},
   email:{syntheticSimulations:simulatedEmail.length,
    status:simulatedEmail.length?'SYNTHETIC_ONLY':'INCOMPLETE',
    actualMessagesSent:0,legalConsentVerified:false},
   intelligence:{tenantWideReviewedTopics:marketTopics,
    tenantWideReviewedSignals:market.processed,
    campaignLinkedQuarantinedSignals:journey.learningSignals.filter(
     x=>x.status==='QUARANTINED').length,
    sourceScope:'TENANT_WIDE_NOT_CAMPAIGN_ATTRIBUTED' as const,
    marketClaimsIndependentlyVerified:false},
   conversion:{reviewedLeadCount:totals.leads??null,
    reviewedQualifiedLeadCount:totals.qualified_leads??null,
    clickToLeadPercent:performance.derived.clickToLeadPercent,
    leadQualificationPercent:performance.derived.leadQualificationPercent,
    crmQualifiedOutcomesVerified:false,causalAttributionVerified:false},
   commercial:{sourceStatus:performance.status,reviewedTotals:totals,
    derived:performance.derived,pendingReviewCount:performance.pendingReviewCount,
    evidenceWarnings:[...performance.warnings],
    revenueVerified:false,roiVerified:false,spendCurrencyVerified:false}
  },
  limitations:[
   'All delivery is simulated; no external social posts or emails were sent',
   'Creative drafts may be brand scoped and are not campaign linked until approved publication scope',
   'Market topics are tenant-wide reviewed signals, not campaign-attributed intelligence or independently verified market facts',
   'Reviewed observations are not cohort-matched, verified CRM conversions, revenue or ROI',
   'This report is an unsigned operator inspection, not independent 500-case QA or production certification'
  ],
  signed:false as const,independentlyVerified:false as const,
  externalEffectsAuthorized:false as const,
  realProviderDeliveryVerified:false as const,
  productionStatus:'NOT_CERTIFIED' as const
 };
}
