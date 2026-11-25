import {compareReviewedWatch,type WatchSnapshot,type WatchSelection} from './reviewed-market-watch';
/** Shared CSV encoding for unsigned, offline customer intelligence and revenue
 * scenario exports. No side effects, new business owners or provider calls.
 */
import {modelOfflineRevenueScenarios,modelOfflineConversionFunnel,modelOfflineCrmHandoff,
 type RevenueScenarioInput,type OfflineConversionInput,type OfflineHandoffInput} from './offline-revenue-scenarios';
const fail=(message:string):never=>{throw Error('OFFLINE_CSV_BLOCKED: '+message);};
const quote=(raw:unknown)=>{
 let value=raw===null||raw===undefined?'':String(raw);
 if(/^\s*[=+@-]/.test(value))value="'"+value;
 return '"'+value.replaceAll('"','""')+'"';
};
const csv=(rows:readonly (readonly unknown[])[])=>
 rows.map(row=>row.map(quote).join(',')).join('\r\n')+'\r\n';
export function revenueScenarioCsv(input:RevenueScenarioInput,
 result:ReturnType<typeof modelOfflineRevenueScenarios>,campaignId:string){
 if(!/^[A-Za-z0-9_-]{1,128}$/.test(campaignId)||
  result?.measuredRevenue!==false||
  result.causalAttributionValidated!==false||
  result.externalEffectsAuthorized!==false||
  JSON.stringify(result)!==JSON.stringify(modelOfflineRevenueScenarios(input)))
  fail('Scenario evidence changed or contains unverifiable revenue');
 const rows:unknown[][]=[
  ['section','case','metric','value','qualification'],
  ['source','campaign_id','id',campaignId,'REVIEWED_SOURCE_ONLY'],
  ['assumption','currency','ISO-style',input.currency,'NOT_VERIFIED_SPEND_CURRENCY'],
  ['assumption','qualified_leads','reviewed',input.reviewedQualifiedLeads,'NOT_CRM_VERIFIED'],
  ['assumption','average_deal_value','major_units',input.assumedDealValueMajor,'HYPOTHETICAL'],
  ['assumption','base_close_rate','basis_points',input.closeRateBasisPoints,'HYPOTHETICAL'],
  ['assumption','gross_margin','basis_points',input.marginBasisPoints,'HYPOTHETICAL']
 ];
 for(const x of result.scenarios){
  rows.push(['scenario',x.name,'close_rate_basis_points',x.closeRateBasisPoints,'HYPOTHETICAL']);
  rows.push(['scenario',x.name,'expected_wins_hundredths',x.expectedWinsHundredths,'NOT_CRM_VERIFIED']);
  rows.push(['scenario',x.name,'illustrative_revenue_major',x.illustrativeGrossRevenueMajor,'NOT_MEASURED_REVENUE']);
  rows.push(['scenario',x.name,'illustrative_contribution_major',x.illustrativeGrossContributionMajor,'NOT_FINANCIAL_POSTING']);
 }
 rows.push(['release','all','production_status','NOT_CERTIFIED','UNSIGNED_OFFLINE_ONLY']);
 return csv(rows);
}
export type MarketExportTopic={
 topic:string;sector:string;evidenceCount:number;recentSignals90Days:number;
 distinctSourceHosts:number;freshness:string;priority:string;
 evidence:Array<{signalId:string;title:string;url:string;publishedAt:string|null}>;
 marketShareVerified:false;marketSizingVerified:false;inferenceAuthorized:false;
};
export type MarketExportBrief={
 organizationId:string;asOf:string;processed:number;topics:MarketExportTopic[];
 independentVerification:false;externalPublishingEnabled:false;
};
export function reviewedMarketCsv(brief:MarketExportBrief,filtered:readonly MarketExportTopic[],
 tenantId:string){
 if(brief?.organizationId!==tenantId||!tenantId||
  brief.independentVerification!==false||brief.externalPublishingEnabled!==false||
  !Array.isArray(brief.topics)||brief.topics.length>200||
  !Array.isArray(filtered)||filtered.length>200||
  !Number.isSafeInteger(brief.processed)||brief.processed<0||brief.processed>200||
  !Number.isFinite(Date.parse(brief.asOf)))
  fail('Invalid or unsafe market evidence source');
 const source=new Set(brief.topics);
 if(filtered.some(t=>!source.has(t)||t.marketShareVerified!==false||
  t.marketSizingVerified!==false||t.inferenceAuthorized!==false||
  !Array.isArray(t.evidence)||t.evidence.length>10))
  fail('Unreviewed or forged topic selection');
 const rows:unknown[][]=[['section','sector','topic','metric','value','qualification']];
 for(const topic of filtered){
  rows.push(['reviewed_topic',topic.sector,topic.topic,'reviewed_signals',
   topic.evidenceCount,'HUMAN_REVIEWED_NOT_INDEPENDENTLY_VERIFIED']);
  rows.push(['reviewed_topic',topic.sector,topic.topic,'recent_90_days',
   topic.recentSignals90Days,'RESEARCH_TRIAGE_ONLY']);
  rows.push(['reviewed_topic',topic.sector,topic.topic,'distinct_source_hosts',
   topic.distinctSourceHosts,'NOT_MARKET_SHARE']);
  rows.push(['reviewed_topic',topic.sector,topic.topic,'priority',
   topic.priority,'NOT_BUSINESS_RECOMMENDATION']);
  for(const e of topic.evidence){
   let url:string;
   try{const parsed=new URL(e.url);url=parsed.protocol==='https:'?e.url:'UNVERIFIED_SOURCE';}
   catch{url='UNVERIFIED_SOURCE';}
   rows.push(['source_citation',topic.sector,topic.topic,e.title,url,
    'CITED_NOT_INDEPENDENTLY_VERIFIED']);
  }
 }
 rows.push(['release','','','production_status','NOT_CERTIFIED','UNSIGNED_OFFLINE_ONLY']);
 return csv(rows);
}
export function saveOfflineCsv(content:string,name:string){
 if(!/^[a-z0-9_-]{1,128}\.csv$/.test(name)||content.length>1_000_000)
  fail('Invalid or oversized offline CSV export');
 const url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'}));
 const anchor=document.createElement('a');
 anchor.href=url;anchor.download=name;document.body.appendChild(anchor);
 anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

/**
 * Exports of *existing* social and email simulation responses only; not
 * provider receipts or legal consent. Never serialize raw transport payloads,
 * sender/recipient addresses, provider references, tokens or contact IDs.
 */
export type SocialTrialExport={
 status:'SIMULATED'|'BLOCKED'|'OUTCOME_UNKNOWN';
 replayed:boolean;sandboxReceiptOnly:true;externalEffectsAuthorized:false;
 simulation:{providerKey:string;scenario:string;outcome:string;transport:string;
  readback:string;virtualCallbackCount:number;deduplicatedVirtualCallbackCount:number;
  realProviderRequests:0;verifiedRemoteReceipts:0;automaticRetryAllowed:false;
  externalEffectsAuthorized:false};
};
const boundedCount=(value:unknown)=>
 Number.isSafeInteger(value)&&Number(value)>=0&&Number(value)<=10000;
const enumToken=(s:unknown)=>typeof s==='string'&&
 /^[A-Z][A-Z0-9_]{0,79}$/.test(s);
export function socialSimulationCsv(report:SocialTrialExport){
 const r=report?.simulation;
 if(!r||!['SIMULATED','BLOCKED','OUTCOME_UNKNOWN'].includes(report.status)||
  report.status!==r.outcome||typeof report.replayed!=='boolean'||
  report.sandboxReceiptOnly!==true||report.externalEffectsAuthorized!==false||
  r.realProviderRequests!==0||r.verifiedRemoteReceipts!==0||
  r.externalEffectsAuthorized!==false||r.automaticRetryAllowed!==false||
  ![r.providerKey,r.scenario,r.outcome,r.transport,r.readback].every(enumToken)||
  !boundedCount(r.virtualCallbackCount)||
  !boundedCount(r.deduplicatedVirtualCallbackCount)||
  r.deduplicatedVirtualCallbackCount>r.virtualCallbackCount)
  fail('Social simulator provenance or safety invariants not verified');
 return csv([
  ['section','metric','value','qualification'],
  ['social','provider_key',r.providerKey,'SIMULATED_PLATFORM_KEY_ONLY'],
  ['social','scenario',r.scenario,'SYNTHETIC_RESPONSE'],
  ['social','outcome',r.outcome,'NOT_REMOTE_DELIVERY'],
  ['social','transport',r.transport,'SYNTHETIC_TRANSPORT'],
  ['social','readback',r.readback,'SYNTHETIC_READBACK'],
  ['social','virtual_callbacks',r.virtualCallbackCount,'NO_REAL_WEBHOOK'],
  ['social','deduplicated_virtual_callbacks',r.deduplicatedVirtualCallbackCount,'NO_REAL_WEBHOOK'],
  ['social','replay',report.replayed?'YES':'NO','OFFLINE_IDEMPOTENCY_ONLY'],
  ['social','real_provider_requests',0,'NOT_CONNECTED'],
  ['social','verified_remote_receipts',0,'NOT_CONNECTED'],
  ['release','production_status','NOT_CERTIFIED','UNSIGNED_OFFLINE_ONLY']
 ]);
}
export type EmailTrialExport={
 status:'SIMULATED'|'BLOCKED';externalEffectsAuthorized:false;
 replayed:boolean;
 results:{syntheticRecipients:number;syntheticEligible:number;withdrawn:number;
  complaintSuppressed:number;hardBounceSuppressed?:number;missingConsent:number;
  actualMessagesSent:0;verifiedProviderReceipts:0;
  syntheticJourneyPlan?:{requiresFreshConsentAtExecution:true;
   steps:Array<{key:string;scheduledAt:string;scenario:string;
    virtualOutcomeUnknown:number}>}|null};
};
export function emailSimulationCsv(report:EmailTrialExport){
 const r=report?.results;
 if(!r||!['SIMULATED','BLOCKED'].includes(report.status)||
  report.externalEffectsAuthorized!==false||typeof report.replayed!=='boolean'||
  r.actualMessagesSent!==0||r.verifiedProviderReceipts!==0||
  ![r.syntheticRecipients,r.syntheticEligible,r.withdrawn,r.complaintSuppressed,r.hardBounceSuppressed??0,
   r.missingConsent].every(boundedCount)||
  r.syntheticEligible+r.withdrawn+r.complaintSuppressed+(r.hardBounceSuppressed??0)+r.missingConsent!==
   r.syntheticRecipients||
  (report.status==='SIMULATED')!==(r.syntheticEligible>0))
  fail('Synthetic email eligibility or no-delivery invariants not verified');
 const steps=r.syntheticJourneyPlan?.steps??[];
 if((r.syntheticJourneyPlan!=null&&
   (r.syntheticJourneyPlan.requiresFreshConsentAtExecution!==true||
    !Array.isArray(r.syntheticJourneyPlan.steps)))||
  steps.length>20||steps.some(s=>!s||typeof s.key!=='string'||
   !/^[A-Za-z0-9_-]{1,64}$/.test(s.key)||!enumToken(s.scenario)||
   !Number.isFinite(Date.parse(s.scheduledAt))||
   !boundedCount(s.virtualOutcomeUnknown)))
  fail('Invalid or unsafe synthetic mail schedule');
 return csv([
  ['section','metric','value','qualification'],
  ['email','scenario_status',report.status,'NO_REAL_DELIVERY'],
  ['email','synthetic_recipients',r.syntheticRecipients,'ANONYMOUS_SYNTHETIC_ONLY'],
  ['email','eligible_simulations',r.syntheticEligible,'MOCK_OPT_IN_NOT_LEGAL_CONSENT'],
  ['email','withdrawn',r.withdrawn,'SYNTHETIC_SUPPRESSION'],
  ['email','complaint_suppressed',r.complaintSuppressed,'SYNTHETIC_SUPPRESSION'],
  ['email','hard_bounce_suppressed',r.hardBounceSuppressed??0,'SYNTHETIC_SUPPRESSION'],
  ['email','no_mock_opt_in',r.missingConsent,'SYNTHETIC_SUPPRESSION'],
  ...steps.map(s=>['virtual_step',s.key,s.scheduledAt,
    'SIMULATED_'+s.scenario+'_OUTCOME_UNKNOWN_'+s.virtualOutcomeUnknown]),
  ['email','actual_messages_sent',0,'NOT_CONNECTED'],
  ['email','verified_remote_receipts',0,'NOT_CONNECTED'],
  ['email','legal_consent_verified','NO','MOCK_CONSENT_IS_NOT_LEGAL_PROOF'],
  ['release','production_status','NOT_CERTIFIED','UNSIGNED_OFFLINE_ONLY']
 ]);
}

/** Fail-closed local-only funnel export; values are recomputed from original
 * anonymized fixture, never represent website visits, form data or CRM leads.
 */
export function conversionFunnelCsv(input:OfflineConversionInput,
 result:ReturnType<typeof modelOfflineConversionFunnel>){
 const recalculated=modelOfflineConversionFunnel(input);
 if(result?.externalEffectsAuthorized!==false||
  result.measuredConversions!==false||result.crmHandoffsExecuted!==0||
  result.actualLeadsCreated!==0||result.actualVisitorsObserved!==0||
  result.legalConsentVerified!==false||result.causalAttributionValidated!==false||
  result.productionStatus!=='NOT_CERTIFIED'||
  JSON.stringify(result)!==JSON.stringify(recalculated))
  fail('Conversion report does not match anonymous offline fixture');
 const rows:unknown[][]=[
  ['section','metric','value','qualification'],
  ['source','scenario',result.scenario,'NO_REAL_FORM_SUBMISSION'],
  ['source','status',result.status,'ANONYMOUS_SYNTHETIC_ONLY'],
  ['funnel','virtual_visits',result.counts.visits,'NOT_OBSERVED_TRAFFIC'],
  ['funnel','virtual_cta_clicks',result.counts.clicks,'NOT_OBSERVED_TRAFFIC'],
  ['funnel','virtual_form_submissions',result.counts.submissions,'NOT_CRM_VERIFIED'],
  ['funnel','virtual_qualified_leads',result.counts.qualified,'NOT_CRM_VERIFIED'],
  ...Object.entries(result.rates).map(([key,value])=>
   ['rate',key,value??'UNDEFINED_ZERO_DENOMINATOR','VIRTUAL_FUNNEL_ONLY']),
  ['real','actual_visitors',0,'NO_REAL_WEBSITE'],
  ['real','actual_leads_created',0,'NO_REAL_CRM'],
  ['real','crm_handoffs_executed',0,'NO_REAL_CRM'],
  ['real','legal_consent_verified','NO','SIMULATION_ONLY'],
  ['release','production_status','NOT_CERTIFIED','UNSIGNED_OFFLINE_ONLY']
 ];
 return csv(rows);
}

/** Original MKT-SOC-001 classifier returns REVIEW ADVICE only. Never serialize
 * user message contents, reply text, profiles, contact addresses, or publish intents.
 */
export type DiscussionTriageExport={
 discussionId:string;
 disposition:'INFORMATIONAL'|'ANSWERED'|'NO_RESPONSE'|'HUMAN_REVIEW_REQUIRED';
 reasons:string[];
 escalations:Array<'SCIENTIFIC_REVIEW'|'BRAND_REVIEW'|'PRIVACY_REVIEW'>;
 answerRecordedNotScientificallyVerified:boolean;
 humanApprovalRequired:true;externalEffectsAuthorized:false;
};
export function discussionTriageCsv(r:DiscussionTriageExport){
 const dispositions=['INFORMATIONAL','ANSWERED','NO_RESPONSE','HUMAN_REVIEW_REQUIRED'];
 const escalationTypes=['SCIENTIFIC_REVIEW','BRAND_REVIEW','PRIVACY_REVIEW'];
 if(!r||typeof r.discussionId!=='string'||
  !/^[A-Za-z0-9_-]{1,128}$/.test(r.discussionId)||
  !dispositions.includes(r.disposition)||
  r.humanApprovalRequired!==true||r.externalEffectsAuthorized!==false||
  typeof r.answerRecordedNotScientificallyVerified!=='boolean'||
  !Array.isArray(r.reasons)||r.reasons.length<1||r.reasons.length>10||
  r.reasons.some(x=>typeof x!=='string'||!/^[a-z_]{2,80}$/.test(x))||
  !Array.isArray(r.escalations)||r.escalations.length>3||
  new Set(r.escalations).size!==r.escalations.length||
  r.escalations.some(x=>!escalationTypes.includes(x))||
  (r.escalations.length>0&&r.disposition!=='HUMAN_REVIEW_REQUIRED')||
  (r.disposition==='ANSWERED')!==r.answerRecordedNotScientificallyVerified)
  fail('Triage export must remain a bounded original-agent human decision suggestion');
 return csv([
  ['section','metric','value','qualification'],
  ['social_review','discussion_id',r.discussionId,'OPERATOR_SUPPLIED_ID_NOT_PROVIDER_VERIFIED'],
  ['social_review','disposition',r.disposition,'DRAFT_CLASSIFIER_ONLY'],
  ...r.reasons.map(x=>['reason',x,'PRESENT','NO_AUTONOMOUS_REPLY']),
  ...r.escalations.map(x=>['human_escalation',x,'REVIEW_REQUIRED','NO_EXTERNAL_EFFECT']),
  ['social_review','human_approval_required','YES','NEVER_AUTONOMOUS'],
  ['social_review','social_reply_executed','NO','NOT_CONNECTED'],
  ['release','production_status','NOT_CERTIFIED','UNSIGNED_OFFLINE_ONLY']
 ]);
}

/** Recomputes the anonymous handoff rehearsal and prevents reporting a mock
 * result as CRM or consent evidence. Never serializes the request key.
 */
export function crmHandoffRehearsalCsv(input:OfflineHandoffInput,
 result:ReturnType<typeof modelOfflineCrmHandoff>){
 const expected=modelOfflineCrmHandoff(input);
 if(result?.actualLeadsCreated!==0||result.crmHandoffsExecuted!==0||
  result.externalEffectsAuthorized!==false||result.legalConsentVerified!==false||
  result.realContactDataCollected!==false||result.automaticRetryAuthorized!==false||
  result.productionStatus!=='NOT_CERTIFIED'||
  JSON.stringify(result)!==JSON.stringify(expected))
  fail('CRM handoff rehearsal provenance or safety invariants changed');
 return csv([
  ['section','metric','value','qualification'],
  ['source','kind','ANONYMOUS_OFFLINE_FIXTURE','NO_CONTACT_RECORD'],
  ['handoff','status',result.status,'NO_PROVIDER_DELIVERY'],
  ['handoff','mock_candidates',result.mockQualifiedCandidates,'NOT_REAL_LEADS'],
  ['handoff','mock_consent',input.mockConsent,'NOT_LEGAL_CONSENT'],
  ['handoff','mock_dedupe',input.mockDedupe,'LOCAL_FIXTURE_ONLY'],
  ['handoff','mock_transport',result.simulatedProviderResponse,'NO_REMOTE_ATTEMPT'],
  ...result.blockers.map(b=>['blocker',b,'BLOCKED','HUMAN_OPERATOR_REVIEW']),
  ['handoff','automatic_retry','DISABLED','OUTCOME_UNKNOWN_MUST_BE_RECONCILED'],
  ['real','crm_handoffs_executed',0,'NOT_CONNECTED'],
  ['real','actual_leads_created',0,'NOT_CONNECTED'],
  ['release','production_status','NOT_CERTIFIED','UNSIGNED_OFFLINE_ONLY']
 ]);
}

/** Reviewed-window change report; comparison is recomputed against the two
 * tenant-matched source snapshots. No source payloads or URLs are exported. */
export function reviewedMarketWatchCsv(baseline:WatchSnapshot,current:WatchSnapshot,
 selection:readonly WatchSelection[],tenant:string,
 result:ReturnType<typeof compareReviewedWatch>){
 const expected=compareReviewedWatch(baseline,current,selection,tenant);
 if(JSON.stringify(result)!==JSON.stringify(expected))
  fail('Reviewed watch result differs from source snapshots');
 return csv([
  ['section','sector','topic','metric','value','qualification'],
  ['snapshot','','','baseline_as_of',result.baselineAsOf,'REVIEWED_WINDOW_ONLY'],
  ['snapshot','','','current_as_of',result.currentAsOf,'REVIEWED_WINDOW_ONLY'],
  ...result.changes.flatMap(c=>[
   ['topic',c.sector,c.topic,'status',c.status,'NOT_VERIFIED_MARKET_CHANGE'],
   ['topic',c.sector,c.topic,'changed_fields',c.changedFields.join(';'),'REVIEWED_WINDOW_ONLY'],
   ['topic',c.sector,c.topic,'baseline_signals',c.baselineSignals,'REVIEWED_WINDOW_ONLY'],
   ['topic',c.sector,c.topic,'current_signals',c.currentSignals??'NOT_IN_WINDOW','NOT_EVIDENCE_OF_ABSENCE']
  ]),
  ['scope','','','window_may_be_incomplete',result.windowMayBeIncomplete?'YES':'NO','BOUNDED_SOURCE_READ'],
  ['release','','','production_status','NOT_CERTIFIED','UNSIGNED_OFFLINE_ONLY']
 ]);
}
