import {describe,it,expect} from "vitest";
import {prepareOfflineWorkflowDraft} from "./blueprint-offline-handoff";
const good=()=>({id:"science-review",version:1,nodes:[
 {id:"start",type:"TRIGGER"},
 {id:"science",type:"AGENT_TASK",agentId:"MKT-SCI-001",maxSeconds:45},
 {id:"approve",type:"APPROVAL"},{id:"end",type:"END"}
],edges:[{from:"start",to:"science"},{from:"science",to:"approve"},
 {from:"approve",to:"end"}]});
describe("T5A Blueprint Studio to Workflow Studio existing-owner handoff",()=>{
 it("preserves exact nodes and edges without claiming signed release or external execution",()=>{
  const d=good();
  const m=prepareOfflineWorkflowDraft(d);
  expect(m.draft).toEqual(d);
  expect(m).toMatchObject({canaryPercent:100,maxSteps:8,
   executionMode:"DETERMINISTIC_NO_MODEL"});
  expect(JSON.stringify(m)).not.toContain("signature");
  expect(JSON.stringify(m)).not.toContain("externalEffectsAuthorized");
 });
 it("rejects schedule, MCP/A2A, provider commands and oversized agent time instead of silently dropping nodes",()=>{
  for(const type of ["SCHEDULE","MCP_TOOL","A2A_TASK","DOMAIN_COMMAND","EVENT_WAIT"]){
   const d=good();d.nodes[1]!.type=type;
   expect(()=>prepareOfflineWorkflowDraft(d)).toThrow();
  }
  const d=good();d.nodes[1]!.maxSeconds=90;
  expect(()=>prepareOfflineWorkflowDraft(d)).toThrow();
 });
 it("rejects bypassing independent human review, cycles and oversized graphs",()=>{
  const d=good();d.edges=[{from:"start",to:"science"},{from:"science",to:"end"}];
  expect(()=>prepareOfflineWorkflowDraft(d)).toThrow("independent approval");
  const cycle=good();cycle.edges.push({from:"approve",to:"science"});
  expect(()=>prepareOfflineWorkflowDraft(cycle)).toThrow();
  expect(()=>prepareOfflineWorkflowDraft({...good(),nodes:Array.from({length:33},(_,i)=>({
   id:"n"+i,type:"APPROVAL"
  }))})).toThrow();
 });
});
