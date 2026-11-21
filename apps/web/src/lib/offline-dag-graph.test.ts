import {describe,it,expect} from "vitest";
import {readOfflineEditorManifest,addOfflineEditorNode,addOfflineEditorEdge,
 removeOfflineEditorNode,removeOfflineEditorEdge,layoutOfflineEditor}
 from "./offline-dag-graph";
const fixture=()=>JSON.stringify({draft:{id:"safe-review",version:1,nodes:[
 {id:"start",type:"TRIGGER"},{id:"agent",type:"AGENT_TASK",agentId:"MKT-SCI-001",maxSeconds:45},
 {id:"review",type:"APPROVAL"},{id:"end",type:"END"}],edges:[
 {from:"start",to:"agent"},{from:"agent",to:"review"},{from:"review",to:"end"}]},
 canaryPercent:100,maxSteps:8,executionMode:"DETERMINISTIC_NO_MODEL"});
describe("T3B offline graph authoring respects existing release grammar",()=>{
 it("roundtrips exact bounded manifest and stable left-to-right layout",()=>{
  const a=readOfflineEditorManifest(fixture());
  expect(readOfflineEditorManifest(JSON.stringify(a))).toEqual(a);
  const positions=layoutOfflineEditor(a);
  expect(positions.find(n=>n.id==="start")!.x)
   .toBeLessThan(positions.find(n=>n.id==="end")!.x);
 });
 it("adds and removes only internal nodes and wiring",()=>{
  const a=readOfflineEditorManifest(fixture());
  const b=addOfflineEditorNode(a,{id:"human",type:"HUMAN_TASK"});
  expect(b.draft.nodes).toHaveLength(5);
  const c=addOfflineEditorEdge(b,"agent","human");
  expect(c.draft.edges.some(e=>e.to==="human")).toBe(true);
  expect(removeOfflineEditorEdge(c,"agent","human").draft.edges).toHaveLength(3);
  expect(removeOfflineEditorNode(c,"human").draft.edges).toHaveLength(3);
 });
 it("rejects cycles, duplicate IDs, unsafe effects and non-canonical node types",()=>{
  const a=readOfflineEditorManifest(fixture());
  expect(()=>addOfflineEditorEdge(a,"end","start")).toThrow();
  expect(()=>addOfflineEditorEdge(a,"review","agent")).toThrow();
  expect(()=>addOfflineEditorNode(a,{id:"agent",type:"APPROVAL"})).toThrow();
  expect(()=>addOfflineEditorNode(a,{id:"remote",type:"MCP_TOOL" as "APPROVAL"})).toThrow();
  expect(()=>readOfflineEditorManifest(fixture().replace('"END"','"MCP_TOOL"'))).toThrow();
  expect(()=>readOfflineEditorManifest(fixture().replace('"DETERMINISTIC_NO_MODEL"','"ONLINE_MODEL"'))).toThrow();
  expect(()=>readOfflineEditorManifest(fixture().replace('"maxSeconds":45','"maxSeconds":900'))).toThrow();
  expect(()=>readOfflineEditorManifest(fixture().replace('"maxSteps":8','"maxSteps":100'))).toThrow();
  const unsafe=JSON.parse(fixture());unsafe.draft.nodes[1].sideEffect="IRREVERSIBLE_EXTERNAL";
  expect(()=>readOfflineEditorManifest(JSON.stringify(unsafe))).toThrow();
 });
 it("does not permit visual edits to remove last human destination/trigger by mistake",()=>{
  const a=readOfflineEditorManifest(fixture());
  expect(()=>removeOfflineEditorNode(a,"start")).toThrow();
  expect(()=>removeOfflineEditorNode(a,"end")).toThrow();
  expect(()=>addOfflineEditorNode(a,{id:"bad agent",type:"AGENT_TASK",agentId:"MKT-SCI-001",maxSeconds:45})).toThrow();
 });
});
