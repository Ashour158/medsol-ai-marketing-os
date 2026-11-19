import {describe,expect,it} from 'vitest';
import {generateKeyPairSync,sign} from 'node:crypto';
import {parseOfflineDagManifest,offlineDagDigest,planOfflineDag,
 canaryAllows,verifyOfflineDagSignature,SAFE_DAG_CAPABILITY}
 from './r3g-offline-dag.js';
import {AGENT_ROSTER} from '@medsol/agent-runtime';
const valid=()=>({draft:{id:'review-fanout',version:1,nodes:[
 {id:'trigger',type:'TRIGGER'},{id:'fork',type:'PARALLEL'},
 {id:'agent1',type:'AGENT_TASK',agentId:'MKT-CMO-001'},
 {id:'agent2',type:'AGENT_TASK',agentId:'MKT-SCI-001'},
 {id:'join',type:'JOIN'},{id:'human',type:'HUMAN_TASK'},{id:'end',type:'END'}
 ],edges:[
 {from:'trigger',to:'fork'},{from:'fork',to:'agent1'},{from:'fork',to:'agent2'},
 {from:'agent1',to:'join'},{from:'agent2',to:'join'},
 {from:'join',to:'human'},{from:'human',to:'end'}
 ]},canaryPercent:100,maxSteps:20,executionMode:'DETERMINISTIC_NO_MODEL'});
describe('R3-G release compiler and cryptographic gates',()=>{
 it('reuses exact canonical topology for fanout/join and bound agents',()=>{
  const p=planOfflineDag(valid());
  expect(p.map(x=>x.id)).toEqual(['trigger','fork','agent1','agent2','join','human','end']);
  expect(p.find(x=>x.id==='join')?.predecessors).toEqual(['agent1','agent2']);
  for(const agent of AGENT_ROSTER)
   expect(agent.capabilities).toContain(SAFE_DAG_CAPABILITY[agent.id]);
 });
 it('canonicalizes definitions and rejects tampering of signer trust',()=>{
  const manifest=parseOfflineDagManifest(valid());
  const reversed={...manifest,draft:{...manifest.draft,
   nodes:[...manifest.draft.nodes].reverse(),edges:[...manifest.draft.edges].reverse()}};
  expect(offlineDagDigest(reversed)).toBe(offlineDagDigest(manifest));
  const pair=generateKeyPairSync('ed25519');
  const signature=sign(null,Buffer.from('medsol-r3g-dag-signature-v1\n'+
   offlineDagDigest(manifest)),pair.privateKey).toString('base64url');
  const trust={keyId:'offline-review',publicKeyPem:
   pair.publicKey.export({type:'spki',format:'pem'}).toString()};
  expect(verifyOfflineDagSignature(manifest,signature,'offline-review',trust)).toBe(true);
  expect(verifyOfflineDagSignature({...manifest,canaryPercent:50},
   signature,'offline-review',trust)).toBe(false);
  expect(verifyOfflineDagSignature(manifest,signature,'untrusted',trust)).toBe(false);
 });
 it('refuses effects, schedules, event waits, tools, model mode and unsafe config',()=>{
  const manifest=valid();
  for(const type of ['MCP_TOOL','A2A_TASK','DOMAIN_COMMAND','SCHEDULE',
   'EVENT_WAIT','CONDITION','TRANSFORM','LOOP_BOUNDED','COMPENSATE']){
   const broken=JSON.parse(JSON.stringify(manifest));
   broken.draft.nodes[2].type=type;
   expect(()=>parseOfflineDagManifest(broken)).toThrow();
  }
  for(const altered of [
   {...manifest,executionMode:'MODEL_LIVE'},
   {...manifest,canaryPercent:0},{...manifest,maxSteps:2},
   {...manifest,draft:{...manifest.draft,unknown:'hidden'}},
   {...manifest,draft:{...manifest.draft,nodes:
    manifest.draft.nodes.map(n=>n.id==='agent1'?{...n,sideEffect:'IRREVERSIBLE_EXTERNAL'}:n)}}
  ])expect(()=>parseOfflineDagManifest(altered)).toThrow();
 });
 it('assigns stable unbiased canary buckets by tenant+key, never from caller flags',()=>{
  expect(canaryAllows('tenant','abc','key',100)).toBe(true);
  expect(canaryAllows('tenant','abc','key',1)).toBe(canaryAllows('tenant','abc','key',1));
  expect(()=>canaryAllows('tenant','abc','key',0)).toThrow();
 });
});
