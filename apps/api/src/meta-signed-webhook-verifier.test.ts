import {describe,expect,it} from 'vitest';
import {createHmac} from 'node:crypto';
import {verifySignedMetaWebhook} from './meta-signed-webhook-verifier.js';
const secret=Buffer.from('0123456789abcdef0123456789abcdef');
const raw=Buffer.from(JSON.stringify({object:'page',
 entry:[{id:'page123',changes:[{field:'feed'}]}]}));
const sign=(bytes:Uint8Array,key=secret)=>
 'sha256='+createHmac('sha256',key).update(bytes).digest('hex');
describe('R2E-A Meta raw-byte signature conformance reference cases',()=>{
 it('accepts exact raw signed page and instagram bodies without claiming receipt authority',()=>{
  const checked=verifySignedMetaWebhook(raw,sign(raw),secret);
  expect(checked).toMatchObject({providerKey:'META_GRAPH',eventClass:'page',
   rawSizeBytes:raw.byteLength,entryCount:1});
  expect(checked.payloadDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
  expect(checked.signatureDigest).not.toEqual(checked.payloadDigest);
  const ig=Buffer.from(JSON.stringify({object:'instagram',entry:[{id:'ig123'}]}));
  expect(verifySignedMetaWebhook(ig,sign(ig),secret).eventClass).toBe('instagram');
 });
 it('rejects every changed byte, missing/wrong header, wrong secret and unsupported digest',()=>{
  const changed=Buffer.from(raw);changed[15]=changed[15]!^1;
  await expect(()=>verifySignedMetaWebhook(changed,sign(raw),secret)).toThrow();
  for(const bad of [undefined,'','sha1=aaaa','sha256=deadbeef','sha256='+'A'.repeat(64)])
   expect(()=>verifySignedMetaWebhook(raw,bad,secret)).toThrow();
  expect(()=>verifySignedMetaWebhook(raw,sign(raw),Buffer.alloc(32,1))).toThrow('signature');
  expect(()=>verifySignedMetaWebhook(raw,sign(raw),Buffer.alloc(10))).toThrow('secret');
 });
 it('refuses even correctly signed nonmarketing or malformed notification contents',()=>{
  for(const value of [
   Buffer.from('{}'),Buffer.from('not json'),Buffer.from('[]'),
   Buffer.from(JSON.stringify({object:'whatsapp_business_account',entry:[{id:'1'}]})),
   Buffer.from(JSON.stringify({object:'page',entry:[]})),
   Buffer.from(JSON.stringify({object:'page',entry:new Array(101).fill({})}))
  ])expect(()=>verifySignedMetaWebhook(value,sign(value),secret)).toThrow();
  const oversized=Buffer.alloc(256*1024+1,65);
  expect(()=>verifySignedMetaWebhook(oversized,sign(oversized),secret)).toThrow('Bounded');
 });
});
