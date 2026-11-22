import {describe,it,expect} from "vitest";
import {CAMPAIGN_STAGE_ORDER,campaignReadiness,isCampaignSummary,
 portfolioReadinessSummary} from "./campaign-readiness";
const stage=()=>Object.fromEntries(CAMPAIGN_STAGE_ORDER.map(([key])=>[key,false]));
const valid=()=>({campaign:{id:"campaign-123",name:"Research initiative",
 code:"MKT-001",status:"APPROVED"},workflow:{status:"COMPLETED"},
 stages:stage(),offlineSimulationOnly:true,realProvidersConnectedByJourney:false,
 externalEffectsAuthorized:false,productionCertified:false});
describe("T4C canonical campaign readiness",()=>{
 it("returns concrete missing gates, not a fabricated platform release score",()=>{
  const result=campaignReadiness(valid(),"campaign-123");
  expect(result.completed).toBe(0);
  expect(result.total).toBe(10);
  expect(result.blockers[0]?.workspace).toBe("journey");
  expect(result.state).toBe("INCOMPLETE");
  expect(result.productionReady).toBe(false);
 });
 it("distinguishes completed offline simulation from external readiness",()=>{
  const x=valid();x.stages=Object.fromEntries(CAMPAIGN_STAGE_ORDER.map(([k])=>[k,true]));
  const result=campaignReadiness(x,"campaign-123");
  expect(result.state).toBe("SIMULATION_COMPLETE");
  expect(result.blockers).toHaveLength(0);
  expect(result.externalEffectsAuthorized).toBe(false);
  expect(result.independentlyCertified).toBe(false);
 });
 it("blocks failed canonical workflow regardless of positive stage flags",()=>{
  const x=valid();x.workflow={status:"BLOCKED"};
  expect(campaignReadiness(x,"campaign-123").state).toBe("BLOCKED");
  x.workflow={status:"NEEDS_INTERVENTION"};
  expect(campaignReadiness(x,"campaign-123").state).toBe("BLOCKED");
 });
 it("refuses forged identity, loose stage types and absent offline guarantees",()=>{
  const x=valid();
  expect(()=>campaignReadiness(x,"campaign-456")).toThrow("identity mismatch");
  x.stages.briefRecorded="true" as never;
  expect(()=>campaignReadiness(x,"campaign-123")).toThrow("Stage evidence");
  const y=valid();y.externalEffectsAuthorized=true;
  expect(()=>campaignReadiness(y,"campaign-123")).toThrow("offline-only");
  const z=valid();z.productionCertified=true;
  expect(()=>campaignReadiness(z,"campaign-123")).toThrow("offline-only");
  expect(isCampaignSummary({id:"",name:"A",code:"X",status:"DRAFT"})).toBe(false);
 });
 it("counts failed/unknown journey lookups separately rather than treating as ready",()=>{
  const known=campaignReadiness(valid(),"campaign-123");
  expect(portfolioReadinessSummary([
   {kind:"KNOWN",item:known},{kind:"UNKNOWN",id:"campaign-456",
    name:"Outdated source",reason:"Access forbidden"}]))
   .toMatchObject({campaignsChecked:2,known:1,unknown:1,
    simulatedComplete:0,productionReady:false});
 });
});
