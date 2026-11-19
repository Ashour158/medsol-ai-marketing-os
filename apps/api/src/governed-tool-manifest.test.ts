import {describe,expect,it} from 'vitest';
import {generateKeyPairSync,sign} from 'node:crypto';
import {parseToolManifest,toolManifestDigest,verifyTrustedToolSignature,
 inspectToolInvocation,assertToolRemoteDispatchBlocked} from './governed-tool-manifest.js';

const base=()=>({kind:'MCP',serverKey:'reviewed_tool',name:'Review-only Tool',
 endpointOrigin:null,toolKeys:['read_brief'],declaredScopes:['read_internal'],
 trustTier:'T0',dataClass:'INTERNAL',supportsWrites:false,
 maxResponseBytes:20000,timeoutMs:3000});
describe('R3-E governed MCP/A2A signed manifest and zero-egress safety',()=>{
 it('canonicalizes ordering and checks Ed25519 against a separate trusted signer',()=>{
  const manifest=parseToolManifest({...base(),toolKeys:['read_brief','list_sources']});
  const reversed=parseToolManifest({...base(),toolKeys:['list_sources','read_brief']});
  expect(toolManifestDigest(manifest)).toBe(toolManifestDigest(reversed));
  const pair=generateKeyPairSync('ed25519');
  const digest=toolManifestDigest(manifest);
  const signature=sign(null,Buffer.from('medsol-tool-manifest-signature-v1\n'+digest),
   pair.privateKey).toString('base64url');
  const config={trustedPublicKeyPem:pair.publicKey.export({
   type:'spki',format:'pem'}).toString(),trustedKeyId:'release-signer'};
  expect(verifyTrustedToolSignature(manifest,signature,'release-signer',config)).toBe(true);
  expect(verifyTrustedToolSignature(manifest,signature,'untrusted',config)).toBe(false);
  expect(verifyTrustedToolSignature({...manifest,name:'Tampered'},signature,
   'release-signer',config)).toBe(false);
  expect(verifyTrustedToolSignature(manifest,signature,'release-signer',{})).toBe(false);
 });
 it('rejects private or suspicious endpoints and hidden effect fields',()=>{
  for(const origin of ['http://example.com','https://localhost',
   'https://127.0.0.1','https://10.0.0.1','https://[::1]',
   'https://metadata.google.internal','https://example.com/path',
   'https://user:pass@example.com','https://example.com:8443',
   'https://api.example.com?url=http://localhost']){
   expect(()=>parseToolManifest({...base(),trustTier:'T1',
    endpointOrigin:origin})).toThrow();
  }
  expect(()=>parseToolManifest({...base(),url:'https://evil.com'})).toThrow();
  expect(()=>parseToolManifest({...base(),toolKeys:['read_brief','read_brief']}))
   .toThrow();
  expect(()=>parseToolManifest({...base(),trustTier:'T3',
   endpointOrigin:null})).toThrow();
  expect(()=>parseToolManifest({...base(),supportsWrites:true})).toThrow();
  expect(()=>parseToolManifest({...base(),timeoutMs:999999})).toThrow();
 });
 it('recognizes remote metadata but never authorizes remote tools or A2A',()=>{
  const mcp=parseToolManifest({...base(),trustTier:'T2',
   endpointOrigin:'https://tools.example.org',supportsWrites:true});
  const a2a=parseToolManifest({...base(),kind:'A2A',trustTier:'T3',
   endpointOrigin:'https://agents.example.org',supportsWrites:true});
  for(const manifest of [mcp,a2a]){
   const p=inspectToolInvocation(manifest,'read_brief','read_internal','APPROVED');
   expect(p).toMatchObject({approvedMetadata:true,declaredTool:true,
    declaredScope:true,remoteExecutionAuthorized:false,
    modelToolCalls:0,mcpCalls:0,a2aCalls:0,externalEffectsAuthorized:false});
   expect(()=>assertToolRemoteDispatchBlocked()).toThrow('not authorized');
   expect(inspectToolInvocation(manifest,'write_admin','read_internal','APPROVED')
    .declaredTool).toBe(false);
  }
 });
});
