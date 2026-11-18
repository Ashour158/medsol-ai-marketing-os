import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';

/**
 * Narrow AES-256-GCM envelope for provider tokens and PKCE verifiers.
 * Master key is deployment/secret-manager supplied, never a database field.
 * Callers must use a unique tenant/connection/purpose AAD for every secret.
 * This is a vault-envelope foundation, not HSM/KMS integration or certification.
 */
export class ProviderSecretEnvelope{
 private readonly key:Buffer;
 readonly keyId:string;
 constructor(key:Uint8Array,keyId='k1'){
  if(!(key instanceof Uint8Array)||key.length!==32||!/^[a-z0-9_-]{2,24}$/.test(keyId))
   throw new Error('32-byte managed provider encryption key and valid key identifier required');
  this.key=Buffer.from(key);this.keyId=keyId;
 }
 static fromEnvironment():ProviderSecretEnvelope{
  const encoded=process.env.MARKETING_PROVIDER_VAULT_KEY_V1_BASE64??'';
  if(!/^[A-Za-z0-9+/]{43}=$/.test(encoded))
   throw new Error('MARKETING_PROVIDER_VAULT_KEY_V1_BASE64 must contain a generated 32-byte key');
  const decoded=Buffer.from(encoded,'base64');
  if(decoded.length!==32||decoded.toString('base64')!==encoded)
   throw new Error('Invalid provider vault key encoding');
  return new ProviderSecretEnvelope(decoded,'k1');
 }
 private aad(organizationId:string,connectionId:string,purpose:string):Buffer{
  for(const v of [organizationId,connectionId,purpose]){
   if(!/^[a-zA-Z0-9_-]{1,128}$/.test(v))throw new Error('Invalid secret envelope binding');
  }
  return Buffer.from(JSON.stringify(['medsol-provider-envelope-v1',organizationId,connectionId,purpose]));
 }
 encrypt(plaintext:string,organizationId:string,connectionId:string,purpose:string):string{
  if(typeof plaintext!=='string'||plaintext.length<8||Buffer.byteLength(plaintext,'utf8')>8192)
   throw new Error('Unacceptable secret size');
  const nonce=randomBytes(12);
  const cipher=createCipheriv('aes-256-gcm',this.key,nonce);
  cipher.setAAD(this.aad(organizationId,connectionId,purpose));
  const ciphertext=Buffer.concat([cipher.update(plaintext,'utf8'),cipher.final()]);
  return ['aesgcm1',this.keyId,nonce.toString('base64url'),
   cipher.getAuthTag().toString('base64url'),ciphertext.toString('base64url')].join('.');
 }
 decrypt(encoded:string,organizationId:string,connectionId:string,purpose:string):string{
  try{
   const parts=encoded?.split('.')??[];
   if(parts.length!==5||parts[0]!=='aesgcm1'||parts[1]!==this.keyId)
    throw new Error('Incompatible envelope');
   const nonce=Buffer.from(parts[2]!,'base64url'),tag=Buffer.from(parts[3]!,'base64url');
   const ciphertext=Buffer.from(parts[4]!,'base64url');
   if(nonce.length!==12||tag.length!==16||!ciphertext.length||ciphertext.length>8192)
    throw new Error('Invalid envelope fields');
   const decipher=createDecipheriv('aes-256-gcm',this.key,nonce);
   decipher.setAAD(this.aad(organizationId,connectionId,purpose));
   decipher.setAuthTag(tag);
   return Buffer.concat([decipher.update(ciphertext),decipher.final()]).toString('utf8');
  }catch{
   throw new Error('Provider secret authentication failed');
  }
 }
}
