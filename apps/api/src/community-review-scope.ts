import {createHash} from 'node:crypto';
import type {SocialCommunityCase} from '@prisma/client';
export const COMMUNITY_REVIEW_OBJECT='SocialCommunityCaseSpecialist';
export function communityReviewScope(row:Pick<SocialCommunityCase,'id'|'organizationId'|'brandId'|'discussionDigest'|'reviewRound'|'escalations'>,escalation:string){
 if(!row.reviewRound||!row.escalations.includes(escalation))throw Error('Current community review scope required');
 const scope={caseId:row.id,brandId:row.brandId,reviewRound:row.reviewRound,escalation,
  discussionDigest:row.discussionDigest,syntheticOnly:true,externalEffectsAuthorized:false};
 const scopeDigest='sha256:'+createHash('sha256').update(JSON.stringify([
  'medsol-community-review-v1',row.organizationId,row.id,row.brandId,row.discussionDigest,row.reviewRound,escalation
 ])).digest('hex');
 return{scope,scopeDigest,requiredAuthority:'HUMAN_COMMUNITY_'+escalation};
}
export function communityReviewMatches(row:SocialCommunityCase,approval:{
 objectId:string;objectType:string;organizationId:string;requiredAuthority:string;scopeDigest:string|null;scope:unknown;requestedBy:string|null
 }){
 if(row.id!==approval.objectId||row.organizationId!==approval.organizationId||
  approval.objectType!==COMMUNITY_REVIEW_OBJECT||!row.reviewRound||!row.assignedTo||approval.requestedBy!==row.assignedTo||
  !approval.scope||typeof approval.scope!=='object'||Array.isArray(approval.scope))return false;
 const actual=approval.scope as Record<string,unknown>,escalation=actual.escalation;
 if(typeof escalation!=='string'||!row.escalations.includes(escalation))return false;
 const expected=communityReviewScope(row,escalation);
 return approval.requiredAuthority===expected.requiredAuthority&&approval.scopeDigest===expected.scopeDigest&&
  Object.keys(actual).length===Object.keys(expected.scope).length&&Object.entries(expected.scope).every(([k,v])=>actual[k]===v);
}
