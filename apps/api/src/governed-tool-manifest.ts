import {createHash,createPublicKey,verify} from 'node:crypto';
import {BadRequestException,ForbiddenException} from '@nestjs/common';

export const TOOL_TRUST_TIERS=['T0','T1','T2','T3'] as const;
export type ToolTrustTier=typeof TOOL_TRUST_TIERS[number];
export type ToolManifest={
 kind:'MCP'|'A2A';serverKey:string;name:string;endpointOrigin:string|null;
 toolKeys:string[];declaredScopes:string[];trustTier:ToolTrustTier;
 dataClass:'PUBLIC'|'INTERNAL'|'RESTRICTED';supportsWrites:boolean;
 maxResponseBytes:number;timeoutMs:number
};
const identifier=(value:unknown,max=80):value is string=>
 typeof value==='string'&&value.length>=3&&value.length<=max&&
 /^[a-z][a-z0-9_-]*$/.test(value);
function assertOrigin(value:unknown):string|null{
 if(value===null)return null;
 if(typeof value!=='string'||value.length>500)
  throw new BadRequestException('Tool origin must be HTTPS metadata only');
 let url:URL;
 try{url=new URL(value);}catch{throw new BadRequestException('Invalid tool origin');}
 if(url.protocol!=='https:'||url.username||url.password||url.search||
  url.hash||url.pathname!=='/'||url.port||url.origin!==value.replace(/\/$/,''))
  throw new BadRequestException('Tool origin must be an HTTPS origin without credentials, port, path or query');
 const host=url.hostname.toLowerCase();
 if(!/^[a-z0-9.-]+$/.test(host)||host.length>253||
  host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||
  host.endsWith('.internal')||host.endsWith('.invalid')||
  host.endsWith('.test')||host.endsWith('.example')||
  host.endsWith('.onion')||host.endsWith('.arpa')||
  /^\d+(?:\.\d+){0,3}$/.test(host)||host.includes('..')||
  !host.includes('.')||host.startsWith('.')||host.endsWith('.')||
  host.split('.').some(label=>!label||label.length>63||
   label.startsWith('-')||label.endsWith('-')))
  throw new BadRequestException('Non-public or IP-based tool origins prohibited');
 // This is metadata validation, NOT SSRF-safe DNS validation. Remote egress
 // stays disabled; future adapter must pin/validate DNS and redirects.
 return url.origin;
}
function list(raw:unknown,label:string):string[]{
 if(!Array.isArray(raw)||raw.length<1||raw.length>30||
  raw.some(x=>!identifier(x,64))||new Set(raw).size!==raw.length)
  throw new BadRequestException('Distinct declared '+label+' required');
 return [...raw].sort();
}
export function parseToolManifest(raw:unknown):ToolManifest{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))
  throw new BadRequestException('Tool manifest must be an object');
 const v=raw as Record<string,unknown>;
 const fields=['kind','serverKey','name','endpointOrigin','toolKeys',
  'declaredScopes','trustTier','dataClass','supportsWrites','maxResponseBytes','timeoutMs'];
 if(Object.keys(v).some(k=>!fields.includes(k))||
  fields.some(k=>!Object.hasOwn(v,k)))
  throw new BadRequestException('Unknown or missing tool manifest field');
 if(v.kind!=='MCP'&&v.kind!=='A2A')
  throw new BadRequestException('Unsupported tool protocol');
 if(!identifier(v.serverKey)||typeof v.name!=='string'||
  v.name.trim().length<3||v.name.length>120)
  throw new BadRequestException('Invalid tool identity');
 if(!TOOL_TRUST_TIERS.includes(v.trustTier as ToolTrustTier)||
  !['PUBLIC','INTERNAL','RESTRICTED'].includes(String(v.dataClass))||
  typeof v.supportsWrites!=='boolean')
  throw new BadRequestException('Invalid tool trust and data policy');
 if(!Number.isSafeInteger(v.maxResponseBytes)||
  (v.maxResponseBytes as number)<1024||(v.maxResponseBytes as number)>1000000||
  !Number.isSafeInteger(v.timeoutMs)||(v.timeoutMs as number)<100||
  (v.timeoutMs as number)>15000)
  throw new BadRequestException('Unbounded tool response or timeout');
 const origin=assertOrigin(v.endpointOrigin);
 if(origin===null&&v.trustTier!=='T0')
  throw new BadRequestException('Remote trust tier requires declared HTTPS origin');
 if(origin!==null&&v.trustTier==='T0')
  throw new BadRequestException('T0 is offline-only');
 if(v.supportsWrites&&['T0','T1'].includes(v.trustTier as string))
  throw new BadRequestException('Low-trust tool cannot request writes');
 return{kind:v.kind,serverKey:v.serverKey as string,name:v.name.trim(),
  endpointOrigin:origin,toolKeys:list(v.toolKeys,'tool keys'),
  declaredScopes:list(v.declaredScopes,'scopes'),
  trustTier:v.trustTier as ToolTrustTier,
  dataClass:v.dataClass as ToolManifest['dataClass'],
  supportsWrites:v.supportsWrites,maxResponseBytes:v.maxResponseBytes as number,
  timeoutMs:v.timeoutMs as number};
}
export function toolManifestDigest(manifest:ToolManifest):string{
 const v=parseToolManifest(manifest);
 return 'sha256:'+createHash('sha256').update(JSON.stringify([
  'medsol-governed-mcp-a2a-v1',v.kind,v.serverKey,v.name,v.endpointOrigin,
  v.toolKeys,v.declaredScopes,v.trustTier,v.dataClass,v.supportsWrites,
  v.maxResponseBytes,v.timeoutMs
 ])).digest('hex');
}
export function verifyTrustedToolSignature(manifest:ToolManifest,
 signature:string,signerKeyId:string,config:{
 trustedPublicKeyPem?:string|undefined;trustedKeyId?:string|undefined
}):boolean{
 if(!config.trustedPublicKeyPem||!config.trustedKeyId||
  signerKeyId!==config.trustedKeyId||typeof signature!=='string'||
  !/^[A-Za-z0-9_-]{80,200}$/.test(signature))return false;
 try{
  const bytes=Buffer.from(signature,'base64url');
  if(bytes.length!==64)return false;
  const key=createPublicKey(config.trustedPublicKeyPem);
  if(key.asymmetricKeyType!=='ed25519')return false;
  return verify(null,Buffer.from('medsol-tool-manifest-signature-v1\n'+
   toolManifestDigest(manifest)),key,bytes);
 }catch{return false;}
}
/** Egress is disabled regardless of manifest signature, tier or approval. */
export function inspectToolInvocation(manifest:ToolManifest,toolKey:unknown,
 requestedScope:unknown,registeredStatus:unknown){
 const approved=registeredStatus==='APPROVED';
 const declared=typeof toolKey==='string'&&manifest.toolKeys.includes(toolKey);
 const scoped=typeof requestedScope==='string'&&
  manifest.declaredScopes.includes(requestedScope);
 return{approvedMetadata:approved,declaredTool:declared,declaredScope:scoped,
  trustTier:manifest.trustTier,remoteExecutionAuthorized:false as const,
  modelToolCalls:0 as const,mcpCalls:0 as const,a2aCalls:0 as const,
  externalEffectsAuthorized:false as const,
  reason:'MCP/A2A network and agent-to-agent dispatch are locked until audited provider staging'};
}
export function assertToolRemoteDispatchBlocked():never{
 throw new ForbiddenException('R3 MCP/A2A remote execution is not authorized');
}
