import {describe,expect,it} from 'vitest';
import {createHmac} from 'node:crypto';
import {verifySignedMetaWebhook} from './meta-signed-webhook-verifier.js';
const secret=Buffer.from('0123456789abcdef0123456789abcdef');
const raw=Buffer.from(JSON.stringify({object:'page',
 entry:[{id:'page123',changes:[{field:'feed'}]}]}));
const sign=(bytes:Uint8Array,key=secret)=>
 'sha256='+createHmac('sha256',key).update(bytes).digest('hex');
describe('R2E-C signed Meta post claim isolation',()=>{
 const now=Math.floor(Date.now()/1000);
 const pageId='123456789012';
 const payload=(val:unknown,overrides:Record<string,unknown>={})=>
  Buffer.from(JSON.stringify({object:'page',entry:[{
   id:pageId,time:now,changes:[{field:'feed',value:val}],...overrides
  }]}));
 it('extracts only an exact signed page feed post addition',()=>{
  const raw=payload({item:'post',verb:'add',post_id:pageId+'_987654321000'});
  const result=verifySignedMetaWebhook(raw,sign(raw),secret);
  expect(result.postClaim).toEqual({
   accountRef:pageId,postRef:pageId+'_987654321000',
   eventAt:new Date(now*1000)
  });
 });
 it('does not promote unrelated signed notifications to post references',()=>{
  const cases=[
   payload({item:'post',verb:'edit',post_id:pageId+'_987654321000'}),
   payload({item:'comment',verb:'add',post_id:pageId+'_987654321000'}),
   payload({item:'post',verb:'add',post_id:'999999999999_987654321000'}),
   payload({item:'post',verb:'add',post_id:pageId+'_987654321000'},
    {time:now-60*60*24*45}),
   payload({item:'post',verb:'add',post_id:pageId+'_987654321000'},
    {time:now+60*60}),
   payload({item:'post',verb:'add',post_id:pageId+'_987654321000'},
    {id:'not-a-provider-id'}),
   Buffer.from(JSON.stringify({object:'instagram',
    entry:[{id:pageId,time:now,changes:[{
     field:'feed',value:{item:'post',verb:'add',post_id:pageId+'_987654321000'}
    }]}]}))
  ];
  for(const raw of cases)
   expect(verifySignedMetaWebhook(raw,sign(raw),secret).postClaim).toBeNull();
 });
 it('rejects tampered post identifiers before any candidate is accepted',()=>{
  const raw=payload({item:'post',verb:'add',post_id:pageId+'_987654321000'});
  const tampered=Buffer.from(raw);
  tampered[tampered.length-8]=tampered[tampered.length-8]!^1;
  expect(()=>verifySignedMetaWebhook(tampered,sign(raw),secret)).toThrow('signature');
 });
});

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
  expect(()=>verifySignedMetaWebhook(changed,sign(raw),secret)).toThrow();
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
