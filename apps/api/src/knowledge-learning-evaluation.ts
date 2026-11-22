import {createHash} from 'node:crypto';
import {BadRequestException} from '@nestjs/common';
/** R3-I offline retrieval diagnostics. Human-provided relevance labels are
 * NOT independent truth, model quality assessment, or release authorization.
 */
export type RetrievalCase={
 id:string; query:string; relevantDocumentIds:string[];
};
export type RetrievalObservation={
 id:string; rankedDocumentIds:string[]; relevantDocumentIds:string[];
};
export function parseRetrievalCases(raw:unknown):RetrievalCase[]{
 if(!Array.isArray(raw)||raw.length<1||raw.length>12)
  throw new BadRequestException('Evaluation requires 1-12 labeled retrieval cases');
 const seen=new Set<string>();
 return raw.map((caseInput:unknown)=>{
  if(!caseInput||typeof caseInput!=='object'||Array.isArray(caseInput))
   throw new BadRequestException('Malformed retrieval evaluation case');
  const x=caseInput as Record<string,unknown>;
  if(Object.keys(x).length!==3||Object.keys(x).some(k=>
   !['id','query','relevantDocumentIds'].includes(k)))
   throw new BadRequestException('Unknown evaluation input field');
  if(typeof x.id!=='string'||!/^[a-zA-Z0-9_-]{8,80}$/.test(x.id)||
   seen.has(x.id))
   throw new BadRequestException('Unique stable evaluation case ID required');
  seen.add(x.id);
  if(typeof x.query!=='string'||x.query.trim().length<3||x.query.length>200)
   throw new BadRequestException('Bounded evaluation query required');
  if(!Array.isArray(x.relevantDocumentIds)||x.relevantDocumentIds.length<1||
   x.relevantDocumentIds.length>5||
   x.relevantDocumentIds.some(id=>typeof id!=='string'||
    !/^[a-zA-Z0-9:_-]{8,160}$/.test(id))||
   new Set(x.relevantDocumentIds).size!==x.relevantDocumentIds.length)
   throw new BadRequestException('Evaluation relevance labels must reference 1-5 distinct source IDs');
  return{id:x.id,query:x.query.trim(),
   relevantDocumentIds:x.relevantDocumentIds as string[]};
 });
}
export function evaluationMetrics(rows:readonly RetrievalObservation[],k:number){
 if(!Number.isSafeInteger(k)||k<1||k>10||rows.length===0)
  throw new BadRequestException('Evaluation cutoff and observations required');
 const seenCases=new Set<string>();
 const cases=rows.map(row=>{
  if(typeof row.id!=="string"||!row.id||
     seenCases.has(row.id)||!Array.isArray(row.relevantDocumentIds)||
     row.relevantDocumentIds.length<1||row.relevantDocumentIds.length>5||
     new Set(row.relevantDocumentIds).size!==row.relevantDocumentIds.length||
     !Array.isArray(row.rankedDocumentIds)||row.rankedDocumentIds.length>10||
     row.rankedDocumentIds.some(x=>typeof x!=="string"||!x)||
     new Set(row.rankedDocumentIds).size!==row.rankedDocumentIds.length)
   throw new BadRequestException("Retrieval observations must have distinct bounded source IDs and case IDs");
  seenCases.add(row.id);
  const relevant=new Set(row.relevantDocumentIds);
  const ranked=row.rankedDocumentIds.slice(0,k);
  let hits=0,rr=0,dcg=0;
  for(let i=0;i<ranked.length;i++){
   if(relevant.has(ranked[i]!)){
    hits++;
    if(!rr)rr=1/(i+1);
    dcg+=1/Math.log2(i+2);
   }
  }
  let ideal=0;
  for(let i=0;i<Math.min(k,relevant.size);i++)ideal+=1/Math.log2(i+2);
  return{id:row.id,hitAtK:hits>0,precisionAtK:hits/k,
   recallAtK:hits/relevant.size,reciprocalRank:rr,
   ndcgAtK:ideal?dcg/ideal:0,
   rankedSourceCount:ranked.length,expectedSourceCount:relevant.size};
 });
 const mean=(key:'precisionAtK'|'recallAtK'|'reciprocalRank'|'ndcgAtK')=>
  Number((cases.reduce((n,c)=>n+c[key],0)/cases.length).toFixed(6));
 return{cutoff:k,cases:cases.length,hits:cases.filter(c=>c.hitAtK).length,
  precisionAtK:mean('precisionAtK'),recallAtK:mean('recallAtK'),
  meanReciprocalRank:mean('reciprocalRank'),ndcgAtK:mean('ndcgAtK'),
  observations:cases,independentlyVerified:false,
  evaluationSource:'OPERATOR_LABELED_INTERNAL_CORPUS' as const,
  modelOrSkillPromotionAuthorized:false as const,
  providerRequestsMade:0 as const};
}
export function feedbackDigest(query:string){
 return 'sha256:'+createHash('sha256').update(
  'medsol-r3i-retrieval-feedback-v1\n'+query.trim()).digest('hex');
}
