import {createHmac} from 'node:crypto';
import type {EventTransport,PublishedEvent} from './outbox-publisher.service.js';
import {INCIDENT_ALERT_EVENT} from './marketing-incident-response.service.js';

export type AlertDestination={url:string;allowedHost:string;secret:string};
/**
 * Only a deployment-managed, pinned HTTPS destination receives minimal incident
 * metadata. Never accepts a user/LLM-supplied URL; no redirect, no raw source text.
 * Receiver MUST verify timestamp, HMAC and deduplicate eventId.
 */
export class MarketingIncidentWebhookTransport implements EventTransport{
 private readonly url:URL;
 private readonly secret:string;
 constructor(config:AlertDestination){
  if(!config||typeof config.url!=='string'||typeof config.allowedHost!=='string'||
     typeof config.secret!=='string'||config.secret.length<32)
   throw new Error('Reviewed incident webhook URL, allowlisted host and 32+ character HMAC secret required');
  let url:URL;
  try{url=new URL(config.url);}catch{throw new Error('Invalid incident webhook URL');}
  if(url.protocol!=='https:'||url.hostname!==config.allowedHost.toLowerCase()||
     !/^[a-z0-9.-]+$/.test(url.hostname)||!url.hostname.includes('.')||
     url.port!==''||url.username||url.password||url.hash||
     /^localhost$|\.localhost$|\.local$|\.internal$/.test(url.hostname)||
     /^(?:\d{1,3}\.){3}\d{1,3}$/.test(url.hostname)||
     url.hostname.includes('..'))
   throw new Error('Incident webhook destination must be an approved external HTTPS host on port 443');
  this.url=url;this.secret=config.secret;
 }
 static fromEnvironment():MarketingIncidentWebhookTransport{
  return new MarketingIncidentWebhookTransport({
   url:process.env.MARKETING_INCIDENT_WEBHOOK_URL??'',
   allowedHost:process.env.MARKETING_INCIDENT_WEBHOOK_ALLOWED_HOST??'',
   secret:process.env.MARKETING_INCIDENT_WEBHOOK_HMAC_SECRET??''
  });
 }
 async publish(event:PublishedEvent):Promise<void>{
  if(event.eventType!==INCIDENT_ALERT_EVENT||event.aggregateType!=='IncidentResponse'||event.version!==1)
   throw new Error('Unexpected outbound incident event');
  const p=event.payload as Record<string,unknown>|null;
  if(!p||!['BRAIN_STALE','BRAIN_NEEDS_INTERVENTION','OUTBOX_DEAD_LETTER'].includes(String(p.kind))||
     !['WARNING','CRITICAL'].includes(String(p.severity))||
     (typeof p.level!=='number'||!Number.isInteger(p.level)||p.level<0||p.level>2)||
     typeof p.sourceId!=='string'||typeof p.occurrenceAt!=='string'||
     p.externalPublishingAuthorized!==false)
   throw new Error('Invalid incident alert payload');
  const body=JSON.stringify({
   eventId:event.eventId,organizationId:event.organizationId,
   kind:p.kind,sourceId:p.sourceId,occurredAt:p.occurrenceAt,
   severity:p.severity,escalationLevel:p.level,
   requiresHumanAcknowledgement:true
  });
  const timestamp=Math.floor(Date.now()/1000).toString();
  const signature='sha256='+createHmac('sha256',this.secret).update(timestamp+'.'+body).digest('hex');
  const response=await fetch(this.url,{
   method:'POST',headers:{'content-type':'application/json','x-medsol-alert-timestamp':timestamp,
    'x-medsol-alert-signature':signature,'x-medsol-alert-event-id':event.eventId},
   body,redirect:'error',signal:AbortSignal.timeout(5000)
  });
  if(!response.ok)throw new Error('Incident webhook delivery returned non-2xx HTTP status');
 }
}
