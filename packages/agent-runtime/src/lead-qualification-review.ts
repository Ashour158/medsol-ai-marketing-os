/** Scoring matrix adapted from MaestroAgent/maestro,
 * agents/sales/lead-qualifier.yaml (blob 42eb87f6d3709cfb40ae57d3406a6bd705c16966).
 * Only the BANT and ICP numerical thresholds are adopted; no upstream
 * CRM writes, prompt instructions, model selection or outreach actions.
 * Unknown scores do not become zero or an inferred disqualification.
 *
 * MIT License
 * 
 * Copyright (c) 2025 Maestro
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 * 
 */
const bantKeys=["budget","authority","need","timeline"] as const;
const fitKeys=["industry","companySize","role","geography"] as const;
const safe=(v:unknown,allowed:readonly string[])=>{
 if(!v||typeof v!=="object"||Array.isArray(v))throw Error("Qualification object required");
 const r=v as Record<string,unknown>;
 if(Object.keys(r).some(k=>!allowed.includes(k)))throw Error("Unsupported qualification field; no contact data");
 return r;
};
const grades=(r:unknown,keys:readonly string[],min:number,max:number)=>{
 const values=safe(r,keys);
 return keys.map(k=>{
  const v=values[k];
  if(v===undefined||v===null)return null;
  if(typeof v!=="number"||!Number.isSafeInteger(v)||v<min||v>max)
   throw Error("Invalid bounded qualification score");
  return v;
 });
};
const total=(v:(number|null)[])=>v.some(x=>x===null)?null:v.reduce<number>((sum,x)=>sum+(x??0),0);
export function reviewLeadQualification(organizationId:string,raw:unknown){
 const r=safe(raw,["organizationId","brandId","sourceReference","sourceReviewed","purposeAllowed","bant","icp"]);
 if(!organizationId||r.organizationId!==organizationId)
  throw Error("Cross-tenant qualification prohibited");
 if(typeof r.brandId!=="string"||!/^[A-Za-z0-9_-]{1,128}$/.test(r.brandId)||
  typeof r.sourceReference!=="string"||!/^internal:[A-Za-z0-9_:/.-]{1,240}$/.test(r.sourceReference))
  throw Error("Bounded brand and internal evidence reference required");
 if(typeof r.sourceReviewed!=="boolean"||typeof r.purposeAllowed!=="boolean")
  throw Error("Qualification review and purpose flags required");
 const bant=grades(r.bant,bantKeys,1,5),icp=grades(r.icp,fitKeys,0,2);
 const authorized=r.sourceReviewed&&r.purposeAllowed;
 const bantTotal=authorized?total(bant):null,icpTotal=authorized?total(icp):null;
 const priority=bantTotal===null?null:bantTotal>=16?"HOT":bantTotal>=11?"WARM":
  bantTotal>=6?"NURTURE":"DISQUALIFY_REVIEW";
 const fitTier=icpTotal===null?null:icpTotal>=7?"A":icpTotal>=5?"B":icpTotal>=3?"C":"D";
 const complete=bantTotal!==null&&icpTotal!==null;
 const suggestedReview=!authorized?"PURPOSE_OR_SOURCE_REVIEW_REQUIRED":
  !complete?"COMPLETE_EVIDENCE":
  priority==="HOT"&&(fitTier==="A"||fitTier==="B")?"SALES_OWNER_REVIEW":
  priority==="WARM"&&(fitTier==="A"||fitTier==="B")?"SALES_DEVELOPMENT_REVIEW":
  priority==="DISQUALIFY_REVIEW"?"HUMAN_DISQUALIFICATION_REVIEW":"MARKETING_NURTURE_REVIEW";
 return{engineId:"E09" as const,workflowId:"WF33" as const,
  status:!authorized?"BLOCKED" as const:!complete?"INSUFFICIENT_EVIDENCE" as const:"REVIEW_REQUIRED" as const,
  brandId:r.brandId,bantTotal,icpTotal,priority,fitTier,suggestedReview,
  humanApprovalRequired:true as const,independentlyVerified:false as const,
  consentVerified:false as const,crmWriteAuthorized:false as const,
  externalEffectsAuthorized:false as const};
}
