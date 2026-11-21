import {createHash,createPublicKey,verify} from 'node:crypto';
import {BadRequestException} from '@nestjs/common';
import {AGENT_ROSTER} from '@medsol/agent-runtime';

/**
 * R3-F: A signed, restrictive configuration of an existing roster agent.
 * This never creates another agent identity, grants authority, enables
 * a remote model/tool, or overrides the canonical risk classification.
 */
export type AgentReleaseManifest={
 agentId:string;name:string;mission:string;authority:string[];
 capabilities:string[];defaultRisk:'R0'|'R1'|'R2'|'R3'|'R4';
 knowledgeKeys:string[];skillKeys:string[];toolKeys:[];
 modelPolicy:'OFFLINE_ONLY';memoryPolicy:'NO_LONG_TERM_MEMORY';
 humanReviewRequired:true;maxInputBytes:number;maxOutputTokens:number
};
const key=(x:unknown):x is string=>typeof x==='string'&&
 /^[a-zA-Z0-9_-]{3,80}$/.test(x);
function unique(values:unknown,label:string,max=30):string[]{
 if(!Array.isArray(values)||values.length>max||
  values.some(v=>!key(v))||new Set(values).size!==values.length)
  throw new BadRequestException('Invalid or duplicate '+label);
 return [...values].sort() as string[];
}
export function parseAgentReleaseManifest(raw:unknown):AgentReleaseManifest{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))
  throw new BadRequestException('Agent release manifest must be an object');
 const v=raw as Record<string,unknown>;
 const fields=['agentId','name','mission','authority','capabilities','defaultRisk',
  'knowledgeKeys','skillKeys','toolKeys','modelPolicy','memoryPolicy',
  'humanReviewRequired','maxInputBytes','maxOutputTokens'];
 if(Object.keys(v).length!==fields.length||
  fields.some(k=>!Object.hasOwn(v,k))||
  Object.keys(v).some(k=>!fields.includes(k)))
  throw new BadRequestException('Unknown or missing agent manifest fields');
 const baseline=AGENT_ROSTER.find(a=>a.id===v.agentId);
 if(!baseline||v.name!==baseline.name||v.defaultRisk!==baseline.defaultRisk)
  throw new BadRequestException('Unrecognized agent or changed canonical identity/risk');
 if(typeof v.mission!=='string'||v.mission.trim().length<12||
  v.mission.length>1000)
  throw new BadRequestException('Bounded agent mission required');
 const authority=unique(v.authority,'authorities');
 const capabilities=unique(v.capabilities,'capabilities');
 const knowledgeKeys=unique(v.knowledgeKeys,'knowledge keys');
 const skillKeys=unique(v.skillKeys,'skill keys');
 const toolKeys=unique(v.toolKeys,'tool keys');
 if(capabilities.length===0||authority.length===0||
  capabilities.some(x=>!baseline.capabilities.includes(x))||
  authority.some(x=>!baseline.authority.includes(x)))
  throw new BadRequestException('Manifest may only restrict canonical authority and capabilities');
 if(toolKeys.length!==0||v.modelPolicy!=='OFFLINE_ONLY'||
  v.memoryPolicy!=='NO_LONG_TERM_MEMORY'||v.humanReviewRequired!==true)
  throw new BadRequestException('External model/tool or persistent memory authority is disabled');
 if(!Number.isSafeInteger(v.maxInputBytes)||
  (v.maxInputBytes as number)<1024||(v.maxInputBytes as number)>65536||
  !Number.isSafeInteger(v.maxOutputTokens)||
  (v.maxOutputTokens as number)<32||(v.maxOutputTokens as number)>768)
  throw new BadRequestException('Manifest resource limits exceed reviewed bounds');
 return{agentId:baseline.id,name:baseline.name,mission:v.mission.trim(),
  authority,capabilities,defaultRisk:baseline.defaultRisk,knowledgeKeys,skillKeys,
  toolKeys:[],modelPolicy:'OFFLINE_ONLY',memoryPolicy:'NO_LONG_TERM_MEMORY',
  humanReviewRequired:true,maxInputBytes:v.maxInputBytes as number,
  maxOutputTokens:v.maxOutputTokens as number};
}
export function agentReleaseDigest(manifest:AgentReleaseManifest):string{
 const v=parseAgentReleaseManifest(manifest);
 return 'sha256:'+createHash('sha256').update(JSON.stringify([
  'medsol-agent-release-v1',v.agentId,v.name,v.mission,v.authority,
  v.capabilities,v.defaultRisk,v.knowledgeKeys,v.skillKeys,v.toolKeys,
  v.modelPolicy,v.memoryPolicy,v.humanReviewRequired,v.maxInputBytes,
  v.maxOutputTokens
 ])).digest('hex');
}
export function agentReleaseSigningPayload(manifest:AgentReleaseManifest):string{
 return 'medsol-agent-release-signature-v1\n'+agentReleaseDigest(manifest);
}
export function verifyTrustedAgentReleaseSignature(manifest:AgentReleaseManifest,
 signature:string,signerKeyId:string,config:{
 trustedPublicKeyPem?:string|undefined;trustedKeyId?:string|undefined
}):boolean{
 if(!config.trustedPublicKeyPem||!config.trustedKeyId||
  signerKeyId!==config.trustedKeyId||typeof signature!=='string'||
  !/^[A-Za-z0-9_-]{80,200}$/.test(signature))return false;
 try{
  const bytes=Buffer.from(signature,'base64url');
  if(bytes.length!==64)return false;
  const keyObj=createPublicKey(config.trustedPublicKeyPem);
  if(keyObj.asymmetricKeyType!=='ed25519')return false;
  return verify(null,Buffer.from(agentReleaseSigningPayload(manifest)),keyObj,bytes);
 }catch{return false;}
}
export const agentReleaseTrustConfig=()=>({
 trustedPublicKeyPem:process.env.MARKETING_AGENT_RELEASE_TRUSTED_PUBLIC_KEY_PEM,
 trustedKeyId:process.env.MARKETING_AGENT_RELEASE_TRUSTED_KEY_ID
});
export function baselineAgentReleaseManifest(agentId:string):AgentReleaseManifest{
 const agent=AGENT_ROSTER.find(a=>a.id===agentId);
 if(!agent)throw new BadRequestException('Unknown agent');
 return parseAgentReleaseManifest({agentId:agent.id,name:agent.name,
  mission:agent.mission,authority:[...agent.authority],
  capabilities:[...agent.capabilities],defaultRisk:agent.defaultRisk,
  knowledgeKeys:[],skillKeys:[],toolKeys:[],modelPolicy:'OFFLINE_ONLY',
  memoryPolicy:'NO_LONG_TERM_MEMORY',humanReviewRequired:true,
  maxInputBytes:65536,maxOutputTokens:768});
}
