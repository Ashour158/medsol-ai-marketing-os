import {OFFLINE_CAMPAIGN_STAGE_KEYS,validateCombinedCommercialSummary,type CombinedCommercialSummary} from '@medsol/contracts';
/** Unsigned operator exports of the server's read-only, sanitized dossier.
 * No CRM contacts, recipient identifiers, approval actors or provider secrets.
 */
type SyntheticLedgerCounts={forms:number;approvedFormDecisions:number;submissions:number;mockAccepted:number;mockRejected:number;outcomeUnknown:number;
 protocolRecorded:number;qualificationReviews:number;independentInternalQualificationApprovals:number};
type SyntheticLedger={status:'WINDOW_CAPPED'|'BOUNDED_HISTORICAL_SYNTHETIC_LEDGER';counts:SyntheticLedgerCounts|null;
 syntheticOnly:true;actualLeadsCreated:0;actualCrmWrites:0;realConsentVerified:false;externalEffectsAuthorized:false};
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
   crmQualifiedOutcomesVerified:false;causalAttributionVerified:false;syntheticLedger?:SyntheticLedger|null};
  commercial:{sourceStatus:string;reviewedTotals:Record<string,string>;
   derived:Record<string,number|string|null>;pendingReviewCount:number;
   evidenceWarnings:string[];revenueVerified:false;roiVerified:false;
   spendCurrencyVerified:false;combinedCommercial?:CombinedCommercialSummary|null}
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
  d.stages.some((s,i)=>s.key!==OFFLINE_CAMPAIGN_STAGE_KEYS[i]||
   !['OFFLINE_GATE_MET','NOT_DEMONSTRATED'].includes(s.status))||
  d.offlineGatesMet!==d.stages.filter(s=>s.status==='OFFLINE_GATE_MET').length||
  !Array.isArray(d.missingOfflineGates)||
  JSON.stringify(d.missingOfflineGates)!==JSON.stringify(d.stages.filter(s=>
   s.status==='NOT_DEMONSTRATED').map(s=>s.key))||
  !d.pillars||d.pillars.social.realPostsPublished!==0||
  d.pillars.email.actualMessagesSent!==0||
  d.pillars.email.legalConsentVerified!==false||
  d.pillars.intelligence.sourceScope!=='TENANT_WIDE_NOT_CAMPAIGN_ATTRIBUTED'||
  d.pillars.intelligence.marketClaimsIndependentlyVerified!==false||
  d.pillars.conversion.crmQualifiedOutcomesVerified!==false||
  d.pillars.conversion.causalAttributionVerified!==false||
  d.pillars.commercial.revenueVerified!==false||
  d.pillars.commercial.spendCurrencyVerified!==false||
  d.pillars.commercial.roiVerified!==false)
  throw Error('Unsafe or incomplete operator dossier export');
 const ledger=d.pillars.conversion.syntheticLedger;
 if(ledger){
  if(Object.keys(ledger).some(k=>!['status','counts','syntheticOnly','actualLeadsCreated','actualCrmWrites','realConsentVerified','externalEffectsAuthorized'].includes(k))||
   ledger.syntheticOnly!==true||ledger.actualLeadsCreated!==0||ledger.actualCrmWrites!==0||
   ledger.realConsentVerified!==false||ledger.externalEffectsAuthorized!==false||
   (ledger.status==='WINDOW_CAPPED'?ledger.counts!==null:ledger.status!=='BOUNDED_HISTORICAL_SYNTHETIC_LEDGER'||!ledger.counts))
   throw Error('Unsafe synthetic conversion dossier');
  if(ledger.counts){
   const c=ledger.counts,keys=['forms','approvedFormDecisions','submissions','mockAccepted','mockRejected','outcomeUnknown','protocolRecorded','qualificationReviews','independentInternalQualificationApprovals'] as const;
   if(Object.keys(c).length!==keys.length||keys.some(k=>!Number.isSafeInteger(c[k])||c[k]<0||c[k]>100)||
    c.forms>50||c.approvedFormDecisions>c.forms||c.mockAccepted+c.mockRejected+c.outcomeUnknown!==c.submissions||
    c.protocolRecorded>c.submissions||c.qualificationReviews>c.submissions||c.independentInternalQualificationApprovals>c.qualificationReviews)
    throw Error('Invalid synthetic conversion dossier counts');
  }
 }
 if(d.pillars.commercial.combinedCommercial!==undefined&&d.pillars.commercial.combinedCommercial!==null)
  validateCombinedCommercialSummary(d.pillars.commercial.combinedCommercial);
 return d;
}
const cell=(v:unknown)=>{
 let value=v===null||v===undefined?'':String(v);
 // Spreadsheet formulas and leading whitespace before formulas are inert.
 if(/^\s*[=+@-]/.test(value))value="'"+value;
 return '"'+value.replaceAll('"','""')+'"';
};
type DossierRow=[string,string,unknown,string];
export const DOSSIER_PILLARS=['creative','social','email','intelligence','conversion','commercial'] as const;
export type DossierPillar=typeof DOSSIER_PILLARS[number];
function dossierRows(d:DeliveryDossier):DossierRow[]{
 validateDossierForExport(d);
 const rows:Array<DossierRow>=[
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
 const combined=d.pillars.commercial.combinedCommercial;
 if(combined){
  rows.push(['commercial','combined_cohort_status',combined.status,'REPORTED_NOT_VERIFIED']);
  rows.push(['commercial','combined_source_digest',combined.sourceDigest,'REVIEWED_MANIFEST']);
  for(const key of ['matchedGroups','excludedGroups','invalidGrossProfitGroups'] as const)rows.push(['commercial',key,combined[key],'REPORTED_NOT_VERIFIED']);
  for(const c of combined.currencies)for(const [key,value] of Object.entries(c))if(key!=='currency')
   rows.push(['commercial',c.currency+'_'+key,value,'REPORTED_SAME_CURRENCY_NO_CAUSAL_ATTRIBUTION']);
 }
 const synthetic=d.pillars.conversion.syntheticLedger;
 if(synthetic){
  rows.push(['conversion','synthetic_ledger_status',synthetic.status,'HISTORICAL_MOCK_RECORDS_NOT_REAL_LEADS']);
  if(synthetic.counts)for(const [key,value] of Object.entries(synthetic.counts))
   rows.push(['conversion',key,value,'SYNTHETIC_ONLY_NOT_CRM_VERIFIED']);
 }
 return rows;
}
const encodeRows=(rows:DossierRow[])=>
 [['section','metric','value','qualification'],...rows].map(r=>
  r.map(cell).join(',')).join('\r\n')+'\r\n';
export function dossierCsv(d:DeliveryDossier){
 return encodeRows(dossierRows(d));
}
/** Single-pillar export from the same sanitized dossier, never raw contact data. */
export function dossierPillarCsv(d:DeliveryDossier,pillar:DossierPillar){
 if(!DOSSIER_PILLARS.includes(pillar))
  throw Error('Unsupported customer pillar');
 const rows=dossierRows(d).filter(r=>r[0]===pillar);
 if(rows.length===0)throw Error('Missing customer pillar evidence');
 return encodeRows([
  ['report','campaign_id',d.campaign.id,'TENANT_SCOPED'],
  ['report','observed_at',d.observedAt,'OPERATOR_INSPECTION'],
  ['report','production_status','NOT_CERTIFIED','UNSIGNED_OFFLINE_ONLY'],
  ...rows
 ]);
}
