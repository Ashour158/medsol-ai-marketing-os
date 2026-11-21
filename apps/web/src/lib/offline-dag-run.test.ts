import {describe,it,expect} from "vitest";
import {readOfflineDagRun} from "./offline-dag-run";
const tenant="tenant-a",workId="workflow-a";
const fixture=()=>({id:workId,organizationId:tenant,workflowType:"BLUEPRINT_OFFLINE_DAG",
 status:"WAITING_APPROVAL",currentStep:"review",
 input:{offlineOnly:true,externalEffectsAuthorized:false,revision:1,
  releaseDigest:"sha256:"+"a".repeat(64),requestedBy:"user-a"},
 steps:[
  {id:"s-start",stepKey:"start",status:"COMPLETED",input:{
   type:"TRIGGER",agentId:null,order:0,predecessorKeys:[],
   externalEffectsAuthorized:false},output:{controlNode:"TRIGGER"}},
  {id:"s-review",stepKey:"review",status:"WAITING_APPROVAL",input:{
   type:"APPROVAL",agentId:null,order:1,predecessorKeys:["start"],
   externalEffectsAuthorized:false},output:{approvalId:"approval-a"}},
  {id:"s-end",stepKey:"end",status:"PENDING",input:{
   type:"END",agentId:null,order:2,predecessorKeys:["review"],
   externalEffectsAuthorized:false}}
 ]});
describe("T3C canonical offline workflow inspector, fail closed",()=>{
 it("projects exactly one durable independent human wait",()=>{
  const s=readOfflineDagRun(fixture(),workId,tenant);
  expect(s.awaitingApprovalId).toBe("approval-a");
  expect(s.completed).toBe(1);expect(s.total).toBe(3);
  expect(s.externalEffectsAuthorized).toBe(false);
 });
 it("projects approved run only after real ledger reconciles",()=>{
  const x=fixture();x.status="COMPLETED";x.currentStep="END";
  x.steps[1]!.status="COMPLETED";x.steps[2]!.status="COMPLETED";
  expect(readOfflineDagRun(x,workId,tenant).status).toBe("COMPLETED");
 });
 it("rejects foreign tenant, swapped run ID and spoofed workflow type",()=>{
  expect(()=>readOfflineDagRun(fixture(),workId,"tenant-b")).toThrow();
  expect(()=>readOfflineDagRun(fixture(),"other-workflow",tenant)).toThrow();
  expect(()=>readOfflineDagRun({...fixture(),workflowType:"CAMPAIGN"},workId,tenant)).toThrow();
 });
 it("rejects a forged external effects claim and unsafe step effect",()=>{
  const x=fixture();x.input.externalEffectsAuthorized=true;
  expect(()=>readOfflineDagRun(x,workId,tenant)).toThrow();
  const y=fixture();y.steps[0]!.input.externalEffectsAuthorized=true;
  expect(()=>readOfflineDagRun(y,workId,tenant)).toThrow();
 });
 it("rejects unknown node type and invalid approval output",()=>{
  const x=fixture();x.steps[1]!.input.type="MCP_TOOL";
  expect(()=>readOfflineDagRun(x,workId,tenant)).toThrow();
  const y=fixture();y.steps[1]!.output={approvalId:""};
  expect(()=>readOfflineDagRun(y,workId,tenant)).toThrow();
 });
 it("rejects human waits without canonical step and workflow agreement",()=>{
  const x=fixture();x.currentStep="end";
  expect(()=>readOfflineDagRun(x,workId,tenant)).toThrow();
  const y=fixture();y.steps[2]!.status="WAITING_APPROVAL";
  expect(()=>readOfflineDagRun(y,workId,tenant)).toThrow();
 });
 it("rejects duplicate keys and unknown upstream step references",()=>{
  const x=fixture();x.steps[2]!.stepKey="start";
  expect(()=>readOfflineDagRun(x,workId,tenant)).toThrow();
  const y=fixture();y.steps[2]!.input.predecessorKeys=["never"];
  expect(()=>readOfflineDagRun(y,workId,tenant)).toThrow();
 });
 it("rejects false completion, missing offline provenance and unsigned release digest",()=>{
  const x=fixture();x.status="COMPLETED";
  expect(()=>readOfflineDagRun(x,workId,tenant)).toThrow();
  const y=fixture();y.input.offlineOnly=false;
  expect(()=>readOfflineDagRun(y,workId,tenant)).toThrow();
  const z=fixture();z.input.releaseDigest="untrusted";
  expect(()=>readOfflineDagRun(z,workId,tenant)).toThrow();
 });
});
