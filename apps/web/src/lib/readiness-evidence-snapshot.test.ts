import {describe,expect,it} from "vitest";
import {CAMPAIGN_STAGE_ORDER,campaignReadiness,type PortfolioReadinessRow} from "./campaign-readiness";
import {createReadinessEvidenceSnapshot} from "./readiness-evidence-snapshot";

const full=()=>({
 campaign:{id:"campaign-1",name:"Synthetic campaign",code:"T-001",status:"APPROVED"},
 workflow:{status:"COMPLETED"},
 stages:Object.fromEntries(CAMPAIGN_STAGE_ORDER.map(([key])=>[key,true])),
 offlineSimulationOnly:true,externalEffectsAuthorized:false,
 productionCertified:false,realProvidersConnectedByJourney:false
});
const base=():PortfolioReadinessRow[]=>[
 {kind:"KNOWN",item:campaignReadiness(full(),"campaign-1")},
 {kind:"UNKNOWN",id:"campaign-2",name:"Restricted",reason:"Access denied"}
];
const snapshot=(rows:readonly PortfolioReadinessRow[]=base(),listingCount=2,page=0)=>
 createReadinessEvidenceSnapshot({rows,listingCount,page,inspectedAt:"2026-11-22T15:00:00.000Z"});

describe("T4E unsigned readiness inspection evidence",()=>{
 it("exports only inspected page, calls no providers and never certifies",()=>{
  const s=snapshot();
  expect(s).toMatchObject({schema:"medsol.offline_readiness_operator_inspection.v1",
   inspectedCampaignCount:2,productionStatus:"NOT_CERTIFIED",
   signed:false,independentlyVerified:false,realProviderExecution:false,
   summary:{simulatedComplete:1,unknown:1,productionReady:false}});
  expect(s.items[0]).toMatchObject({state:"SIMULATION_COMPLETE"});
  expect(s.items[1]).toMatchObject({state:"UNKNOWN",reason:"Access denied"});
  expect(JSON.stringify(s)).not.toContain("APPROVED_FOR_PRODUCTION");
 });
 it("rejects duplicate identities, invalid page, oversized inspection and forged certification",()=>{
  const rows=base();
  expect(()=>snapshot([rows[0]!,rows[0]!])).toThrow("Duplicate");
  expect(()=>snapshot(rows,2,1)).toThrow("scope");
  expect(()=>snapshot(rows,101)).toThrow("scope");
  expect(()=>snapshot(Array.from({length:26},()=>rows[0]! ),26)).toThrow("scope");
  const item=rows[0]!;
  if(item.kind!=="KNOWN")throw Error("Fixture");
  const forged={...item,item:{...item.item,productionReady:true as false}};
  expect(()=>snapshot([forged])).toThrow("unsafe");
 });
 it("does not turn incomplete journeys or inaccessible records into passing evidence",()=>{
  const x=full();x.stages.briefRecorded=false;
  const rows:PortfolioReadinessRow[]=[
   {kind:"KNOWN",item:campaignReadiness(x,"campaign-1")},
   {kind:"UNKNOWN",id:"campaign-2",name:"Restricted",reason:"Read failed"}
  ];
  const s=snapshot(rows);
  expect(s.summary.simulatedComplete).toBe(0);
  expect(s.items[0]).toMatchObject({state:"INCOMPLETE"});
  expect(s.productionStatus).toBe("NOT_CERTIFIED");
 });
});
