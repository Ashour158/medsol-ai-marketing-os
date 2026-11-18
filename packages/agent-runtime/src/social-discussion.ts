/**
 * Deterministic, draft-only social discussion classification owned by MKT-SOC-001.
 * No retrieval, social scraping, public reply, deletion or private user profiling.
 * Input is untrusted and its supplied "answered" claim is NOT proof of a verified answer.
 */
export type DiscussionDisposition='INFORMATIONAL'|'ANSWERED'|'NO_RESPONSE'|'HUMAN_REVIEW_REQUIRED';
export type DiscussionEscalation='SCIENTIFIC_REVIEW'|'BRAND_REVIEW'|'PRIVACY_REVIEW';
export type SocialTriageResult={
 discussionId:string;
 disposition:DiscussionDisposition;
 reasons:string[];
 escalations:DiscussionEscalation[];
 answerRecordedNotScientificallyVerified:boolean;
 humanApprovalRequired:true;
 externalEffectsAuthorized:false;
};
function record(value:unknown):Record<string,unknown>|null {
 return value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;
}
function validText(value:unknown,min:number,max:number):value is string {
 return typeof value==='string'&&value.trim().length>=min&&value.length<=max;
}
const CLINICAL=/\b(patient|diagnos(?:is|e|ed|tic)|treat(?:ment|ed)?|dos(?:e|age)|symptom|adverse|side effect|clinical outcome|medication|therapy|harm|injury)\b/i;
const REGULATORY=/\b(fda|ce marked|approved|certified|cure|guaranteed|clinical claim|clearance)\b/i;
const PERSONAL=/\b(patient record|personal data|phone number|email address|private information|data breach|medical report)\b/i;
const THANKS=/^(thanks|thank you|much appreciated|great work|well done)[!. ]*$/i;
/** This classification is a moderation suggestion, never an autonomous reply decision. */
export function triageSocialDiscussion(organizationId:string,raw:unknown):SocialTriageResult {
 const item=record(raw);
 if(!validText(organizationId,1,200)||!item)throw new Error('Structured tenant-scoped discussion required');
 if(item.organizationId!==undefined&&item.organizationId!==organizationId)
  throw new Error('Cross-tenant discussion prohibited');
 if(!validText(item.discussionId,1,128)||!/^[A-Za-z0-9_-]+$/.test(item.discussionId))
  throw new Error('Valid discussion identifier required');
 if(!validText(item.text,1,4000))throw new Error('Bounded discussion text required');
 const text=item.text.trim();
 const status=item.status??'OPEN';
 if(status!=='OPEN'&&status!=='ANSWERED'&&status!=='CLOSED')
  throw new Error('Invalid discussion answer status');
 const moderation=item.moderation??'NORMAL';
 if(moderation!=='NORMAL'&&moderation!=='SPAM')throw new Error('Invalid moderation status');
 if(item.humanReviewedAnswer!==undefined&&typeof item.humanReviewedAnswer!=='boolean')
  throw new Error('Invalid independent review marker');
 if(item.answerEvidenceReference!==undefined &&
  (!validText(item.answerEvidenceReference,9,500)||
   !/^internal:[-A-Za-z0-9_/:.]+$/.test(item.answerEvidenceReference)))
  throw new Error('Answer evidence must reference a bounded internal record');
 const escalations:DiscussionEscalation[]=[];
 if(CLINICAL.test(text))escalations.push('SCIENTIFIC_REVIEW');
 if(REGULATORY.test(text))escalations.push('BRAND_REVIEW');
 if(PERSONAL.test(text))escalations.push('PRIVACY_REVIEW');
 const result=(disposition:DiscussionDisposition,reasons:string[],verifiedAnswer=false):SocialTriageResult=>({
  discussionId:item.discussionId as string,disposition,reasons,escalations,
  answerRecordedNotScientificallyVerified:verifiedAnswer,humanApprovalRequired:true,externalEffectsAuthorized:false
 });
 // Escalation wins over apparent spam, acknowledgements, or an externally asserted answer.
 if(escalations.length)return result('HUMAN_REVIEW_REQUIRED',['sensitive_discussion_requires_specialist_review']);
 if(status==='ANSWERED'){
  if(item.humanReviewedAnswer===true&&typeof item.answerEvidenceReference==='string')
   return result('ANSWERED',['reviewed_answer_record_exists'],true);
  return result('HUMAN_REVIEW_REQUIRED',['answered_claim_lacks_reviewed_record']);
 }
 if(moderation==='SPAM')return result('NO_RESPONSE',['spam_marked_for_human_moderation']);
 if(THANKS.test(text)||status==='CLOSED')return result('NO_RESPONSE',['closed_or_acknowledgement']);
 if(/[?？]/u.test(text)||/\b(please explain|could you|how do|what is|can you|where can|is it possible)\b/i.test(text))
  return result('HUMAN_REVIEW_REQUIRED',['unanswered_request_requires_human_reply_decision']);
 return result('INFORMATIONAL',['informational_discussion_no_verified_reply_required']);
}
