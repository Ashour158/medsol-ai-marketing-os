/** Unsigned operator exports of the server's read-only, sanitized dossier.
 * No CRM contacts, recipient identifiers, approval actors or provider secrets.
 */
export type DeliveryDossier={
 schema:'medsol.customer_delivery_dossier.v1';
 organizationId:string;campaign:{id:string;code:string;name:string;status:string;brandId:string|null};
 observedAt:string;status:'OFFLINE_EVIDENCE_ONLY';
 offlineGatesMet:number;offlineGatesTotal:10;
 stages:Array<{key:string;status:'OFFLINE_GATE_MET'|'NOT_DEMONSTRATED'}>;
 missingOfflineGates:string[];
 pillars:{
  creative:{brandScopedDraftRevisions:number;campaignLinkedRevisions:number;
   currentLinkedRightsAndApprovalReviewed:number;status:string};
  social:{publicationIntents:number;sandboxSimulated:number;status:string;realPostsPublished:0};
  email:{syntheticSimulations:number;status:string;actualMessagesSent:0;legalConsentVerified:false};
  intelligence:{tenantWideReviewedTopics:Array<{topic:string;sector:string;evidenceCount:number;
   distinctSourceHosts:number;priority:string;freshness:string}>;
   tenantWideReviewedSignals:number;campaignLinkedQuarantinedSignals:number;
   sourceScope:'TENANT_WIDE_NOT_CAMPAIGN_ATTRIBUTED';marketClaimsIndependentlyVerified:false};
  conversion:{reviewedLeadCount:string|null;reviewedQualifiedLeadCount:string|null;
   clickToLeadPercent:number|null;leadQualificationPercent:number|null;
   crmQualifiedOutcomesVerified:false;causalAttributionVerified:false};
  commercial:{sourceStatus:string;reviewedTotals:Record<string,string>;
   derived:Record<string,number|string|null>;pendingReviewCount:number;
   evidenceWarnings:string[];revenueVerified:false;roiVerified:false;
   spendCurrencyVerified:false}
 };
 limitations:string[];signed:false;independentlyVerified:false;
 externalEffectsAuthorized:false;realProviderDeliveryVerified:false;
 productionStatus:'NOT_CERTIFIED';
};
export function validateDossierForExport(d:DeliveryDossier){
 if(d?.schema!=='medsol.customer_delivery_dossier.v1'||
  d.status!=='OFFLINE_EVIDENCE_ONLY'||d.productionStatus!=='NOT_CERTIFIED'||
  d.signed!==false||d.independentlyVerified!==false||
  d.externalEffectsAuthorized!==false||d.realProviderDeliveryVerified!==false||
  d.offlineGatesTotal!==10||!Array.isArray(d.stages)||d.stages.length!==10||
  d.stages.some(s=>!['OFFLINE_GATE_MET','NOT_DEMONSTRATED'].includes(s.status))||
  d.offlineGatesMet!==d.stages.filter(s=>s.status==='OFFLINE_GATE_MET').length||
  !d.pillars||d.pillars.social.realPostsPublished!==0||
  d.pillars.email.actualMessagesSent!==0||
  d.pillars.conversion.causalAttributionVerified!==false||
  d.pillars.commercial.roiVerified!==false)
  throw Error('Unsafe or incomplete operator dossier export');
 return d;
}
const cell=(v:unknown)=>{
 let value=v===null||v===undefined?'':String(v);
 // Spreadsheet formulas and leading whitespace before formulas are inert.
 if(/^\s*[=+@-]/.test(value))value="'"+value;
 return '"'+value.replaceAll('"','""')+'"';
};
export function dossierCsv(d:DeliveryDossier){
 validateDossierForExport(d);
 const rows:Array<[string,string,unknown,string]>=[
  ['report','campaign',d.campaign.name,'UNSIGNED_OFFLINE_ONLY'],
  ['report','campaign_id',d.campaign.id,'TENANT_SCOPED'],
  ['report','observed_at',d.observedAt,'OPERATOR_INSPECTION'],
  ['report','production_status',d.productionStatus,'NOT_CERTIFIED'],
  ['creative','linked_revisions',d.pillars.creative.campaignLinkedRevisions,'OFFLINE_ONLY'],
  ['creative','reviewed_linked_revisions',d.pillars.creative.currentLinkedRightsAndApprovalReviewed,'OFFLINE_ONLY'],
  ['social','sandbox_publications',d.pillars.social.sandboxSimulated,'ZERO_REAL_POSTS'],
  ['email','synthetic_simulations',d.pillars.email.syntheticSimulations,'ZERO_REAL_MESSAGES'],
  ['intelligence','tenant_reviewed_signals',d.pillars.intelligence.tenantWideReviewedSignals,
   'NOT_CAMPAIGN_ATTRIBUTED'],
  ['conversion','reviewed_leads',d.pillars.conversion.reviewedLeadCount,'NOT_CRM_VERIFIED'],
  ['conversion','reviewed_qualified_leads',d.pillars.conversion.reviewedQualifiedLeadCount,'NOT_CRM_VERIFIED'],
  ['commercial','source_status',d.pillars.commercial.sourceStatus,'NOT_REVENUE_VERIFIED'],
  ['commercial','pending_reviews',d.pillars.commercial.pendingReviewCount,'EXCLUDED_FROM_KPIS'],
  ...d.stages.map(s=>['offline_gate',s.key,s.status,'NOT_PRODUCTION_CERTIFIED'] as [string,string,unknown,string]),
  ...d.pillars.commercial.evidenceWarnings.map(w=>
   ['commercial_warning',w,'PRESENT','REQUIRES_RECONCILIATION'] as [string,string,unknown,string])
 ];
 return [['section','metric','value','qualification'],...rows].map(r=>
  r.map(cell).join(',')).join('\r\n')+'\r\n';
}
