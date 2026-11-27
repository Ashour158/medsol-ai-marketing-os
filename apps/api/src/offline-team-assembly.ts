import {BadRequestException,ConflictException} from '@nestjs/common';
import {AGENT_ROSTER} from '@medsol/agent-runtime';
import {parseOfflineDagManifest,offlineDagDigest,SAFE_DAG_CAPABILITY} from './r3g-offline-dag.js';
export function parseTeamAssembly(raw:unknown){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new BadRequestException('Exact offline team assembly required');
 const v=raw as Record<string,unknown>;
 if(Object.keys(v).sort().join(',')!=='blueprintId,fixtureOnly,members,version'||
  v.fixtureOnly!==true||typeof v.blueprintId!=='string'||!/^team-[a-z0-9][a-z0-9_-]{2,65}$/.test(v.blueprintId)||
  typeof v.version!=='number'||!Number.isSafeInteger(v.version)||v.version<1||v.version>1000000||
  !Array.isArray(v.members)||v.members.length<1||v.members.length>8)throw new BadRequestException('One to eight canonical offline team members required');
 const members=v.members.map(raw=>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new BadRequestException('Invalid team member');
  const m=raw as Record<string,unknown>;
  if(Object.keys(m).sort().join(',')!=='agentId,expectedVersion,roleLabel'||
   typeof m.agentId!=='string'||!AGENT_ROSTER.some(a=>a.id===m.agentId)||
   typeof m.expectedVersion!=='number'||!Number.isSafeInteger(m.expectedVersion)||m.expectedVersion<1||m.expectedVersion>1000000||
   typeof m.roleLabel!=='string'||!/^[A-Za-z0-9][A-Za-z0-9 _-]{2,79}$/.test(m.roleLabel))
   throw new BadRequestException('Canonical member, exact release version and bounded role label required');
  return {agentId:m.agentId,expectedVersion:m.expectedVersion,roleLabel:m.roleLabel};
 });
 if(new Set(members.map(m=>m.agentId)).size!==members.length||
  new Set(members.map(m=>m.roleLabel.toLowerCase())).size!==members.length)
  throw new BadRequestException('Distinct canonical agents and role labels required');
 return{blueprintId:v.blueprintId,version:v.version,members,fixtureOnly:true as const};
}
type Input=ReturnType<typeof parseTeamAssembly>;
export type TeamMemberEvidence={agentId:string;version:number;digest:string;installed:boolean;status:string;capabilities:readonly string[]};
export function assembleOfflineTeam(input:Input,observations:readonly TeamMemberEvidence[]){
 if(observations.length!==input.members.length)throw new ConflictException('Incomplete team member evidence');
 const members=input.members.map((member,index)=>{
  const observed=observations[index];
  const capability=SAFE_DAG_CAPABILITY[member.agentId];
  if(!observed||observed.agentId!==member.agentId||observed.version!==member.expectedVersion||
   !/^sha256:[0-9a-f]{64}$/.test(observed.digest)||!capability||!observed.capabilities.includes(capability)||
   (observed.installed?observed.status!=='ACTIVE':observed.version!==1||observed.status!=='NOT_INSTALLED'))
   throw new ConflictException('Team member release changed, paused or lacks the safe workflow capability');
  return{agentId:member.agentId,roleLabel:member.roleLabel,observedVersion:observed.version,observedDigest:observed.digest,
   installed:observed.installed,capability};
 });
 // Each selected canonical engine executes at most one bounded task and
 // every path must pass a distinct human approval. Labels are display only.
 const taskIds=members.map((_,i)=>'member-'+String(i+1).padStart(2,'0'));
 const chain=['start',...taskIds,'review','end'];
 const manifest=parseOfflineDagManifest({draft:{id:input.blueprintId,version:input.version,
  nodes:[{id:'start',type:'TRIGGER'},...members.map((m,i)=>({id:taskIds[i],type:'AGENT_TASK',agentId:m.agentId,maxSeconds:45})),
   {id:'review',type:'APPROVAL'},{id:'end',type:'END'}],
  edges:chain.slice(1).map((to,i)=>({from:chain[i],to}))},
  canaryPercent:100,maxSteps:chain.length,executionMode:'DETERMINISTIC_NO_MODEL'});
 return{members,manifest,digest:offlineDagDigest(manifest),fixtureOnly:true as const,
  unsignedDraft:true as const,memberVersionsObservedOnly:true as const,
  independentApprovalRequired:true as const,executionAuthorized:false as const,
  externalEffectsAuthorized:false as const,agentsCreated:0,agentExecutions:0,realModelCalls:0};
}
