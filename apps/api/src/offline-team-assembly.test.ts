import {describe,it,expect} from 'vitest';
import {parseTeamAssembly,assembleOfflineTeam} from './offline-team-assembly.js';
import {planOfflineDag} from './r3g-offline-dag.js';
const raw={blueprintId:'team-science-launch',version:1,fixtureOnly:true,members:[
 {agentId:'MKT-PM-001',expectedVersion:1,roleLabel:'Portfolio specialist'},
 {agentId:'MKT-SCI-001',expectedVersion:2,roleLabel:'Evidence specialist'}]};
const evidence=[{agentId:'MKT-PM-001',version:1,digest:'sha256:'+'a'.repeat(64),installed:false,status:'NOT_INSTALLED',capabilities:['BUILD_POSITIONING']},
 {agentId:'MKT-SCI-001',version:2,digest:'sha256:'+'b'.repeat(64),installed:true,status:'ACTIVE',capabilities:['CHECK_EVIDENCE']}];
describe('Offline team assembly',()=>{
 it('compiles an ordered bounded canonical DAG with independent review and zero execution',()=>{
  const result=assembleOfflineTeam(parseTeamAssembly(raw),evidence);
  expect(result).toMatchObject({unsignedDraft:true,memberVersionsObservedOnly:true,agentsCreated:0,agentExecutions:0,executionAuthorized:false,externalEffectsAuthorized:false});
  expect(planOfflineDag(result.manifest).map(x=>x.type)).toEqual(['TRIGGER','AGENT_TASK','AGENT_TASK','APPROVAL','END']);
  expect(planOfflineDag(result.manifest).filter(x=>x.type==='AGENT_TASK').map(x=>x.agentId)).toEqual(raw.members.map(x=>x.agentId));
 });
 it('rejects invented identities, duplicate roles, extra authorities and stale or disabled members',()=>{
  for(const invalid of [{...raw,fixtureOnly:false},{...raw,tools:['MCP']},{...raw,members:[raw.members[0],raw.members[0]]},{...raw,members:[{...raw.members[0],agentId:'CUSTOM-AGENT'}]}])
   expect(()=>parseTeamAssembly(invalid)).toThrow();
  for(const changed of [{version:3},{status:'PAUSED'},{capabilities:['EXTRACT_CLAIM']},{digest:'bad'}])
   expect(()=>assembleOfflineTeam(parseTeamAssembly(raw),[evidence[0]!,{...evidence[1]!,...changed}])).toThrow();
 });
});
