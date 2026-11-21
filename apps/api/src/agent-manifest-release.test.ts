import {describe,expect,it} from 'vitest';
import {generateKeyPairSync,sign} from 'node:crypto';
import {agentReleaseDigest,agentReleaseSigningPayload,baselineAgentReleaseManifest,
 parseAgentReleaseManifest,verifyTrustedAgentReleaseSignature}
 from './agent-manifest-release.js';
import {AGENT_ROSTER} from '@medsol/agent-runtime';

describe('R3-F canonical restrictive signed agent manifests',()=>{
 const base=()=>baselineAgentReleaseManifest('MKT-CMO-001');
 it('covers every canonical agent and never adds new identities',()=>{
  expect(AGENT_ROSTER).toHaveLength(13);
  for(const a of AGENT_ROSTER){
   const manifest=baselineAgentReleaseManifest(a.id);
   expect(manifest.agentId).toBe(a.id);
   expect(manifest.capabilities).toEqual([...a.capabilities].sort());
   expect(manifest.humanReviewRequired).toBe(true);
  }
 });
 it('canonicalizes unordered lists for stable release digests',()=>{
  const a=base();
  const b={...a,capabilities:[...a.capabilities].reverse()};
  expect(agentReleaseDigest(a)).toBe(agentReleaseDigest(parseAgentReleaseManifest(b)));
 });
 it('emits exact canonical offline signing bytes and refuses an unsafe draft',()=>{
  const manifest=base();
  expect(agentReleaseSigningPayload(manifest)).toBe('medsol-agent-release-signature-v1\n'+agentReleaseDigest(manifest));
  expect(agentReleaseSigningPayload({...manifest,mission:'A different reviewed agent mission'}))
   .not.toBe(agentReleaseSigningPayload(manifest));
  expect(()=>agentReleaseSigningPayload({...manifest,modelPolicy:'ONLINE' as 'OFFLINE_ONLY'})).toThrow();
 });
 it('requires a separately trusted Ed25519 signer',()=>{
  const pair=generateKeyPairSync('ed25519');
  const manifest=base();
  const signature=sign(null,Buffer.from('medsol-agent-release-signature-v1\n'+
   agentReleaseDigest(manifest)),pair.privateKey).toString('base64url');
  const cfg={trustedPublicKeyPem:pair.publicKey.export({
   format:'pem',type:'spki'}).toString(),trustedKeyId:'trusted-release'};
  expect(verifyTrustedAgentReleaseSignature(manifest,signature,'trusted-release',cfg)).toBe(true);
  expect(verifyTrustedAgentReleaseSignature(manifest,signature,'unknown',cfg)).toBe(false);
  expect(verifyTrustedAgentReleaseSignature({...manifest,mission:'A tampered and unreviewed mission'},
   signature,'trusted-release',cfg)).toBe(false);
 });
 it('denies privilege expansion, new identities, weakened gates, unbounded resources',()=>{
  const m=base();
  for(const candidate of [
   {...m,agentId:'MKT-UNKNOWN-999'},
   {...m,defaultRisk:'R0'},
   {...m,authority:[...m.authority,'FinanceLedger']},
   {...m,capabilities:[...m.capabilities,'PUBLISH_SOCIAL']},
   {...m,capabilities:[]},
   {...m,capabilities:[m.capabilities[0],m.capabilities[0]]},
   {...m,toolKeys:['remote_tool']},
   {...m,modelPolicy:'OPENAI'},
   {...m,memoryPolicy:'PERSIST_ALL'},
   {...m,humanReviewRequired:false},
   {...m,maxOutputTokens:1000000},
   {...m,maxInputBytes:9999999},
   {...m,unexpected:true}
  ])expect(()=>parseAgentReleaseManifest(candidate)).toThrow();
 });
});
