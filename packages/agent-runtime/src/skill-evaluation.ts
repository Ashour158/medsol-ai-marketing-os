import { AGENT_ROSTER } from './roster.js';
export type SkillEvaluationCase = { id:string; agentId:string; skillKey:string; input:Record<string,unknown>; expectedState:'DRAFT'|'REVIEW_REQUIRED'|'INSUFFICIENT_EVIDENCE'; requiresApproval:boolean };
export type SkillEvaluationResult={cases:number;passed:number;failed:number;passRate:number;failures:{id:string;reason:string}[];eligibleForPromotion:false};
export function evaluateSkillCases(cases:readonly SkillEvaluationCase[],decide:(agentId:string,skillKey:string,input:Record<string,unknown>)=>{state:string;approvalRequired:boolean}):SkillEvaluationResult{
 if(cases.length===0||cases.length>1000)throw new Error('Evaluation dataset must contain 1-1000 cases');
 const failures:{id:string;reason:string}[]=[];
 const ids=new Set<string>();
 for(const c of cases){
  if(!c.id||ids.has(c.id))throw new Error('Duplicate or empty evaluation case id');
  ids.add(c.id);
  const manifest=AGENT_ROSTER.find(m=>m.id===c.agentId);
  if(!manifest||!manifest.capabilities.includes(c.skillKey))throw new Error('Evaluation capability outside registered manifest');
  try{
   const actual=decide(c.agentId,c.skillKey,c.input);
   if(actual.state!==c.expectedState||actual.approvalRequired!==c.requiresApproval)failures.push({id:c.id,reason:'State or approval gate mismatch'});
  }catch{failures.push({id:c.id,reason:'Engine execution failed'});}
 }
 return{cases:cases.length,passed:cases.length-failures.length,failed:failures.length,passRate:(cases.length-failures.length)/cases.length,failures,eligibleForPromotion:false};
}
