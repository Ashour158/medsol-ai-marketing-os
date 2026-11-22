/**
 * T4C — read-only operator projection of canonical tenant campaign journeys.
 * No independent campaign/approval/creative/analytics state or business writes.
 * A missing/invalid stage fails CLOSED; it never means "ready".
 */
export const CAMPAIGN_STAGE_ORDER=[
 ["briefRecorded","Brief and workflow recorded","journey"],
 ["agentResearchReviewed","Agent research evaluated","agent-brain"],
 ["campaignIndependentlyApproved","Independent campaign approval","approvals"],
 ["creativeDraftAvailable","Creative draft exists","creative"],
 ["creativeRightsReviewed","Creative usage rights checked","creative"],
 ["creativeIndependentlyApproved","Independent creative approval","approvals"],
 ["simulatedSocialPublished","Sandbox social simulation","social"],
 ["syntheticEmailSimulated","Synthetic consent-gated email","email"],
 ["performanceReviewed","Reviewed performance evidence","performance"],
 ["learningFeedbackQuarantined","Learning evidence quarantined","knowledge"]
] as const;
export type CampaignStage=typeof CAMPAIGN_STAGE_ORDER[number][0];
export type ReadinessKind="INCOMPLETE"|"SIMULATION_COMPLETE"|"BLOCKED"|"UNKNOWN";
export type CampaignReadiness={
 id:string;name:string;code:string;campaignStatus:string;workflowStatus:string;
 completed:number;total:number;stageCompletion:Record<CampaignStage,boolean>;
 blockers:Array<{key:CampaignStage;label:string;workspace:string}>;
 state:ReadinessKind;externalEffectsAuthorized:false;
 productionReady:false;independentlyCertified:false;
};
type Campaign={id:string;name:string;code:string;status:string};
type Journey={
 campaign:Campaign;workflow:{status:string}|null;stages:Record<string,unknown>;
 offlineSimulationOnly?:unknown;externalEffectsAuthorized?:unknown;
 productionCertified?:unknown;realProvidersConnectedByJourney?:unknown;
};
const safeId=(x:unknown)=>typeof x==="string"&&/^[A-Za-z0-9_-]{1,128}$/.test(x);
export function isCampaignSummary(x:unknown):x is Campaign{
 if(!x||typeof x!=="object"||Array.isArray(x))return false;
 const v=x as Record<string,unknown>;
 return safeId(v.id)&&typeof v.name==="string"&&v.name.length>0&&
  v.name.length<=250&&typeof v.code==="string"&&v.code.length<=128&&
  typeof v.status==="string";
}
export function campaignReadiness(j:unknown,expectedId:string):CampaignReadiness{
 if(!j||typeof j!=="object"||Array.isArray(j))
  throw Error("Campaign journey response missing or malformed");
 const x=j as Record<string,unknown>;
 if(!isCampaignSummary(x.campaign)||x.campaign.id!==expectedId)
  throw Error("Campaign identity mismatch in authoritative journey");
 if(x.offlineSimulationOnly!==true||x.externalEffectsAuthorized!==false||
  x.productionCertified!==false||x.realProvidersConnectedByJourney!==false)
  throw Error("Campaign journey lacks offline-only safety provenance");
 const stages=x.stages;
 if(!stages||typeof stages!=="object"||Array.isArray(stages))
  throw Error("Canonical journey stages missing");
 const stageObject=stages as Record<string,unknown>;
 const stepValues={} as Record<CampaignStage,boolean>;
 for(const [key] of CAMPAIGN_STAGE_ORDER){
  if(typeof stageObject[key]!=="boolean")
   throw Error("Stage evidence missing for "+key);
  stepValues[key]=stageObject[key] as boolean;
 }
 const workflow=x.workflow;
 let wfStatus="NOT_STARTED";
 if(workflow!==null){
  if(!workflow||typeof workflow!=="object"||Array.isArray(workflow)||
   typeof (workflow as Record<string,unknown>).status!=="string")
   throw Error("Malformed workflow status");
  wfStatus=String((workflow as Record<string,unknown>).status);
 }
 const blockers=CAMPAIGN_STAGE_ORDER.filter(([key])=>!stepValues[key])
  .map(([key,label,workspace])=>({key,label,workspace}));
 const blocked=x.campaign.status==="REJECTED"||
  ["BLOCKED","FAILED","CANCELLED","NEEDS_INTERVENTION"].includes(wfStatus);
 return{id:x.campaign.id,name:x.campaign.name,code:x.campaign.code,
  campaignStatus:x.campaign.status,workflowStatus:wfStatus,
  completed:CAMPAIGN_STAGE_ORDER.length-blockers.length,
  total:CAMPAIGN_STAGE_ORDER.length,stageCompletion:stepValues,blockers,
  state:blocked?"BLOCKED":blockers.length===0?"SIMULATION_COMPLETE":"INCOMPLETE",
  externalEffectsAuthorized:false,productionReady:false,independentlyCertified:false};
}
export type PortfolioReadinessRow=
 {kind:"KNOWN";item:CampaignReadiness}|
 {kind:"UNKNOWN";id:string;name:string;reason:string};
export function portfolioReadinessSummary(rows:readonly PortfolioReadinessRow[]){
 const known=rows.filter((r):r is Extract<PortfolioReadinessRow,{kind:"KNOWN"}>=>r.kind==="KNOWN");
 const unknown=rows.length-known.length;
 return{campaignsChecked:rows.length,known:known.length,unknown,
  simulatedComplete:known.filter(r=>r.item.state==="SIMULATION_COMPLETE").length,
  blocked:known.filter(r=>r.item.state==="BLOCKED").length,
  incomplete:known.filter(r=>r.item.state==="INCOMPLETE").length,
  productionReady:false,independentlyCertified:false};
}

/** Bounded, zero-based page window over the authenticated listing only. */
export function campaignReadinessPageBounds(total:number,page:number){
 if(!Number.isSafeInteger(total)||total<0||total>100||
    !Number.isSafeInteger(page)||page<0||page>=Math.max(1,Math.ceil(total/25)))
  throw Error("Invalid bounded readiness page");
 return {start:page*25,end:Math.min(total,(page+1)*25),
  pages:Math.max(1,Math.ceil(total/25))};
}
