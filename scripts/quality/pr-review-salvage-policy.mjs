/**
 * Repository-maintainer PR review/salvage policy — bounded, offline-only.
 * NOT an AI Marketing OS domain service, GitHub application, or PR automation.
 * Inputs are previously fetched structured metadata; PR titles/comments are untrusted data.
 */
export const PR_REVIEW_POLICY_VERSION='1.0';
const STATES=new Set(['OPEN','CLOSED','MERGED']);
const REVIEWS=new Set(['APPROVED','CHANGES_REQUESTED','REVIEW_REQUIRED']);
const CHECKS=new Set(['PASS','FAIL','PENDING','UNAVAILABLE']);
function requireBool(value,name){
 if(typeof value!=='boolean')throw new TypeError('Invalid '+name);
}
function requireTime(value,name,asOf){
 if(typeof value!=='string'||!Number.isFinite(Date.parse(value))||
    Date.parse(value)>asOf.getTime()+60_000)throw new TypeError('Invalid '+name);
 return Date.parse(value);
}
const safe=(recommendation,reasons)=>Object.freeze({
 recommendation,reasons:Object.freeze(reasons),
 advisoryOnly:true,mergeAuthorized:false,closeAuthorized:false,
 reopenAuthorized:false,commentAuthorized:false,checksPublicationAuthorized:false
});
export function assessPullRequestReview(raw,asOf=new Date(),staleAfterDays=14){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new TypeError('PR metadata object required');
 if(!Number.isInteger(raw.number)||raw.number<1)throw new TypeError('Valid PR number required');
 if(!STATES.has(raw.state)||!REVIEWS.has(raw.review)||!CHECKS.has(raw.checks))
  throw new TypeError('Unknown PR state/review/check disposition');
 for(const field of ['draft','reopenRequested','headChangedAfterApproval'])
  requireBool(raw[field],field);
 if(!Number.isInteger(raw.unresolvedThreads)||raw.unresolvedThreads<0||raw.unresolvedThreads>10000)
  throw new TypeError('Invalid unresolved thread count');
 if(!Number.isInteger(staleAfterDays)||staleAfterDays<1||staleAfterDays>365)
  throw new TypeError('Invalid stale threshold');
 const updated=requireTime(raw.updatedAt,'PR updatedAt',asOf);
 if(raw.state==='MERGED')return safe('CLOSED_NO_ACTION',['already_merged']);
 if(raw.state==='CLOSED')return raw.reopenRequested?
  safe('MANUAL_REOPEN_REVIEW',['reopen_requested_requires_owner_decision']):
  safe('CLOSED_NO_ACTION',['already_closed_no_reopen_request']);
 const reasons=[];
 if(raw.unresolvedThreads>0)reasons.push('unresolved_review_threads');
 if(raw.review==='CHANGES_REQUESTED')reasons.push('review_changes_requested');
 if(raw.headChangedAfterApproval)reasons.push('approval_stale_after_head_change');
 if(raw.checks==='FAIL')reasons.push('blocking_ci_failure');
 if(raw.checks==='PENDING')reasons.push('ci_pending');
 if(raw.checks==='UNAVAILABLE')reasons.push('required_check_missing_or_app_permission_denied');
 if(reasons.length)return safe('NEEDS_HUMAN_REVIEW',reasons);
 if(raw.draft)return safe('KEEP_OPEN_DRAFT',['draft_not_mergeable']);
 if(asOf.getTime()-updated>staleAfterDays*86400_000)
  return safe('REQUEST_HUMAN_FOLLOWUP',['stale_pr_requires_author_or_owner_review']);
 if(raw.review==='APPROVED'&&raw.checks==='PASS')
  return safe('PROPOSE_HUMAN_MERGE_REVIEW',['approvals_and_checks_require_final_human_signoff']);
 return safe('NEEDS_HUMAN_REVIEW',['review_or_approvals_outstanding']);
}
