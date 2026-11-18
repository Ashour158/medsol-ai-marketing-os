import {BadRequestException,ForbiddenException} from '@nestjs/common';
import {createHash,createHmac,timingSafeEqual} from 'node:crypto';

export type VerifiedMetaWebhook={
 providerKey:'META_GRAPH';payloadDigest:string;signatureDigest:string;
 eventClass:'page'|'instagram';rawSizeBytes:number;entryCount:number;
};
/** Raw-byte Meta signature verification: X-Hub-Signature-256=sha256:<...>
 * is NOT a URL verification token, not a provider delivery receipt, and
 * never enough to authorize a campaign or identify a customer destination.
 */
export function verifySignedMetaWebhook(raw:Uint8Array,signatureHeader:unknown,
  appSecret:Uint8Array):VerifiedMetaWebhook{
 if(!(raw instanceof Uint8Array)||raw.byteLength<2||raw.byteLength>256*1024)
  throw new BadRequestException('Bounded raw webhook payload required');
 if(!(appSecret instanceof Uint8Array)||appSecret.byteLength<32||
  appSecret.byteLength>256)
  throw new ForbiddenException('Deployment-provided Meta webhook secret required');
 if(typeof signatureHeader!=='string'||!/^sha256=[a-f0-9]{64}$/.test(signatureHeader))
  throw new ForbiddenException('Valid Meta raw-body signature required');
 const actual=Buffer.from(signatureHeader.slice(7),'hex');
 const expected=createHmac('sha256',appSecret).update(raw).digest();
 if(!timingSafeEqual(actual,expected))
  throw new ForbiddenException('Meta webhook signature verification failed');
 let parsed:unknown;
 try{parsed=JSON.parse(Buffer.from(raw).toString('utf8'))}
 catch{throw new BadRequestException('Signed webhook payload is not JSON');}
 if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))
  throw new BadRequestException('Signed provider event object required');
 const event=parsed as Record<string,unknown>;
 if(!['page','instagram'].includes(String(event.object))||
  !Array.isArray(event.entry)||event.entry.length===0||event.entry.length>100)
  throw new BadRequestException('Unsupported or excessive signed Meta event class');
 return{
  providerKey:'META_GRAPH',
  payloadDigest:'sha256:'+createHash('sha256').update(raw).digest('hex'),
  signatureDigest:'sha256:'+createHash('sha256').update(signatureHeader).digest('hex'),
  eventClass:event.object as 'page'|'instagram',rawSizeBytes:raw.byteLength,
  entryCount:event.entry.length
 };
}
