import {portfolioReadinessSummary,type PortfolioReadinessRow} from "./campaign-readiness";

/**
 * Local operator inspection export. A review aid, NEVER signed acceptance evidence.
 * The authenticated backend remains the sole authoritative campaign source.
 */
export function createReadinessEvidenceSnapshot(input:{
 rows:readonly PortfolioReadinessRow[];
 page:number;listingCount:number;inspectedAt:string;
}){
 const {rows,page,listingCount,inspectedAt}=input;
 if(!Number.isSafeInteger(page)||page<0||
    !Number.isSafeInteger(listingCount)||listingCount<0||listingCount>100||
    page>=Math.max(1,Math.ceil(listingCount/25))||
    rows.length>25||rows.length>listingCount||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(inspectedAt)||
    !Number.isFinite(Date.parse(inspectedAt)))
  throw Error("Invalid local readiness inspection scope");
 const ids=new Set<string>();
 const items=rows.map(row=>{
  if(row.kind==="UNKNOWN"){
   if(!row.id||!row.name||!row.reason)throw Error("Invalid unknown campaign evidence");
   if(ids.has(row.id))throw Error("Duplicate campaign evidence");
   ids.add(row.id);
   return{id:row.id,name:row.name,state:"UNKNOWN" as const,
    missingGates:null,reason:row.reason};
  }
  const item=row.item;
  if(!item.id||!item.name||item.total!==10||
     item.completed<0||item.completed>10||
     item.productionReady!==false||item.independentlyCertified!==false||
     item.externalEffectsAuthorized!==false||
     (item.state==="SIMULATION_COMPLETE"&&
      (item.blockers.length!==0||item.completed!==10)))
   throw Error("Invalid or unsafe offline readiness evidence");
  if(ids.has(item.id))throw Error("Duplicate campaign evidence");
  ids.add(item.id);
  return{id:item.id,name:item.name,state:item.state,
   missingGates:item.blockers.map(b=>({key:b.key,label:b.label,workspace:b.workspace})),
   campaignStatus:item.campaignStatus,workflowStatus:item.workflowStatus};
 });
 return {
  schema:"medsol.offline_readiness_operator_inspection.v1",
  inspectedAt,listingCount,inspectedPage:page+1,
  pageSize:25,inspectedCampaignCount:rows.length,
  assertion:"OPERATOR_INSPECTION_ONLY" as const,
  productionStatus:"NOT_CERTIFIED" as const,
  signed:false as const,independentlyVerified:false as const,
  realProviderExecution:false as const,
  summary:portfolioReadinessSummary(rows),items
 };
}
