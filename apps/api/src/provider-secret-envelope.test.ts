import {describe,expect,it} from 'vitest';
import {randomBytes} from 'node:crypto';
import {ProviderSecretEnvelope} from './provider-secret-envelope.js';

describe('R2C provider secrets authenticated-encryption',()=>{
 it('roundtrips token/verifier and never stores plaintext',()=>{
  const vault=new ProviderSecretEnvelope(randomBytes(32));
  const secret='access-token-ThisWouldBeSensitive-0123456789';
  const encoded=vault.encrypt(secret,'tenant-a','connection-a','access-v1');
  expect(encoded).toMatch(/^aesgcm1\.k1\./);
  expect(encoded).not.toContain(secret);
  expect(vault.decrypt(encoded,'tenant-a','connection-a','access-v1')).toBe(secret);
  expect(vault.encrypt(secret,'tenant-a','connection-a','access-v1')).not.toBe(encoded);
  for(const ctx of [['tenant-b','connection-a','access-v1'],
    ['tenant-a','connection-b','access-v1'],
    ['tenant-a','connection-a','refresh-v1']]){
   expect(()=>vault.decrypt(encoded,ctx[0]!,ctx[1]!,ctx[2]!))
    .toThrow('Provider secret authentication failed');
  }
 });
 it('rejects ciphertext modification, fake key IDs, bad key length and weak secrets',()=>{
  const key=randomBytes(32),vault=new ProviderSecretEnvelope(key);
  const encoded=vault.encrypt('opaque-oauth-secret','tenant-a','connection-a','refresh-v1');
  const chunks=encoded.split('.');
  const broken=[...chunks];broken[4]=(broken[4]![0]==='A'?'B':'A')+broken[4]!.slice(1);
  expect(()=>vault.decrypt(broken.join('.'),'tenant-a','connection-a','refresh-v1')).toThrow();
  const wrongKey=new ProviderSecretEnvelope(randomBytes(32));
  expect(()=>wrongKey.decrypt(encoded,'tenant-a','connection-a','refresh-v1')).toThrow();
  expect(()=>new ProviderSecretEnvelope(randomBytes(16))).toThrow();
  expect(()=>vault.encrypt('short','tenant-a','connection-a','access-v1')).toThrow();
  expect(()=>vault.decrypt('password:token','tenant-a','connection-a','access-v1')).toThrow();
 });
 it('requires an explicit 32-byte deployment secret with canonical base64',()=>{
  const previous=process.env.MARKETING_PROVIDER_VAULT_KEY_V1_BASE64;
  try{
   delete process.env.MARKETING_PROVIDER_VAULT_KEY_V1_BASE64;
   expect(()=>ProviderSecretEnvelope.fromEnvironment()).toThrow();
   process.env.MARKETING_PROVIDER_VAULT_KEY_V1_BASE64=randomBytes(32).toString('base64');
   const vault=ProviderSecretEnvelope.fromEnvironment();
   expect(vault.keyId).toBe('k1');
   process.env.MARKETING_PROVIDER_VAULT_KEY_V1_BASE64='insecure-password';
   expect(()=>ProviderSecretEnvelope.fromEnvironment()).toThrow();
  }finally{
   if(previous===undefined)delete process.env.MARKETING_PROVIDER_VAULT_KEY_V1_BASE64;
   else process.env.MARKETING_PROVIDER_VAULT_KEY_V1_BASE64=previous;
  }
 });
});
