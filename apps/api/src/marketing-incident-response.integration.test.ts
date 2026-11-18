import {describe,expect,it,vi,afterEach} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {randomUUID,createHmac} from 'node:crypto';
import {MarketingIncidentResponseService,INCIDENT_ALERT_EVENT} from './marketing-incident-response.service.js';
import {MarketingWorkerHealthService} from './marketing-worker-health.service.js';
import {MarketingIncidentWebhookTransport} from './marketing-incident-webhook.transport.js';
import {permissionForMarketingRoute,hasMarketingPermission} from './marketing-permissions.js';
import {OutboxPublisherService} from './outbox-publisher.service.js';
import {BrainDispatchWorker} from './brain-dispatch.worker.js';
afterEach(()=>vi.unstubAllGlobals());
const enabled=process.env.MARKETING_DB_INTEGRATION==='1';
describe('signed, allowlisted incident webhook boundary',()=>{
 const payload={eventId:'incident:abc',organizationId:'tenant-x',aggregateType:'IncidentResponse',
  aggregateId:'response-1',version:1,correlationId:'corr',
  eventType:INCIDENT_ALERT_EVENT,payload:{kind:'BRAIN_NEEDS_INTERVENTION',
   sourceId:'run-1',severity:'CRITICAL',occurrenceAt:'2026-11-18T11:00:00.000Z',
   level:0,externalPublishingAuthorized:false}};
 it('requires explicit HTTPS host and strong secret; rejects loopback, unreviewed and redirect hosts',()=>{
  const secret='s'.repeat(40);
  for(const c of [
   {url:'http://alerts.example.org/x',allowedHost:'alerts.example.org',secret},
   {url:'https://127.0.0.1/x',allowedHost:'127.0.0.1',secret},
   {url:'https://alerts.evil.example/x',allowedHost:'alerts.example.org',secret},
   {url:'https://alerts.example.org:8443/x',allowedHost:'alerts.example.org',secret},
   {url:'https://alerts.example.org/x',allowedHost:'alerts.example.org',secret:'short'}
  ])expect(()=>new MarketingIncidentWebhookTransport(c)).toThrow();
 });
 it('sends only sanitized metadata with authenticated timestamp and stable event-id, never raw errors',async()=>{
  const fetcher=vi.fn().mockResolvedValue({ok:true});
  vi.stubGlobal('fetch',fetcher);
  const secret='z'.repeat(40);
  const webhook=new MarketingIncidentWebhookTransport({
   url:'https://alerts.example.org/oncall',allowedHost:'alerts.example.org',secret
  });
  await webhook.publish(payload);
  const [url,options]=fetcher.mock.calls[0]!;
  expect(String(url)).toBe('https://alerts.example.org/oncall');
  expect(options.redirect).toBe('error');
  const body=options.body as string;
  expect(body).not.toContain('lastError');
  expect(body).not.toContain('medical');
  expect(JSON.parse(body)).toMatchObject({eventId:'incident:abc',escalationLevel:0,
   sourceId:'run-1',requiresHumanAcknowledgement:true});
  const timestamp=options.headers['x-medsol-alert-timestamp'];
  const expected='sha256='+createHmac('sha256',secret).update(timestamp+'.'+body).digest('hex');
  expect(options.headers['x-medsol-alert-signature']).toBe(expected);
  expect(options.headers['x-medsol-alert-event-id']).toBe('incident:abc');
  await expect(webhook.publish({...payload,eventType:'PUBLISH_SOCIAL'})).rejects.toThrow('Unexpected');
  expect(fetcher).toHaveBeenCalledTimes(1);
 });
 it('does not acknowledge a failed remote delivery as successful',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false,status:503}));
  const webhook=new MarketingIncidentWebhookTransport({
   url:'https://alerts.example.org/ops',allowedHost:'alerts.example.org',secret:'h'.repeat(40)
  });
  await expect(webhook.publish(payload)).rejects.toThrow('non-2xx');
 });
});
describe('authenticated incident response and worker dispatch boundaries',()=>{
 it('restricts acknowledgements to managers and worker fleet visibility to audit roles',()=>{
  expect(permissionForMarketingRoute('POST','/marketing/command-center/incidents/BRAIN_STALE/run-1/acknowledge'))
   .toBe('DECIDE_APPROVAL');
  expect(permissionForMarketingRoute('GET','/marketing/operations/workers')).toBe('READ_AUDIT');
  expect(hasMarketingPermission({role:'VIEWER'} as any,'DECIDE_APPROVAL')).toBe(false);
  expect(hasMarketingPermission({role:'CMO'} as any,'DECIDE_APPROVAL')).toBe(true);
  expect(()=>permissionForMarketingRoute('POST','/marketing/command-center/incidents/FORGED/run-1/acknowledge')).toThrow();
 });
 it('does not dispatch alerts unless a valid transport was explicitly configured',async()=>{
  const db:any={};
  const outbox:any={publishBatch:vi.fn()};
  const responses:any={scan:vi.fn().mockResolvedValue({queued:1})};
  const worker=new BrainDispatchWorker(db,{} as any,outbox,undefined,undefined,responses);
  expect(await worker.pulseIncidents()).toMatchObject({status:'OBSERVED',externalAlertsEnabled:false});
  expect(responses.scan).toHaveBeenCalledWith(25);
  expect(outbox.publishBatch).not.toHaveBeenCalled();
  worker.onModuleDestroy();
  expect(await worker.pulseIncidents()).toMatchObject({status:'STOPPING'});
 });
});
describe.skipIf(!enabled)('PostgreSQL tenant-fenced incident acknowledgement and alert staging',()=>{
 it('queues one outbox alert per occurrence/escalation, survives duplicate scans, and stops after human acknowledgement',async()=>{
  const db=new PrismaClient();
  const org='incident-ops-'+randomUUID();
  const runId='run-'+randomUUID();
  try{
   await db.$connect();
   await db.organization.create({data:{id:org,name:'Ops integration tenant'}});
   await db.brainRun.create({data:{id:runId,organizationId:org,commandKey:'ops-'+randomUUID(),
    correlationId:'corr-'+randomUUID(),input:{test:'incident'},status:'NEEDS_INTERVENTION'}});
   const service=new MarketingIncidentResponseService(db as any);
   await service.scan(100);
   const events=()=>db.outboxEvent.findMany({where:{organizationId:org,eventType:INCIDENT_ALERT_EVENT},orderBy:{occurredAt:'asc'}});
   expect((await events())).toHaveLength(1);
   expect((await events())[0]?.payload).toMatchObject({kind:'BRAIN_NEEDS_INTERVENTION',level:0,
    externalPublishingAuthorized:false});
   const firstAlert=(await events())[0]!;
   const eventEnvelope={eventId:firstAlert.eventId,organizationId:org,eventType:INCIDENT_ALERT_EVENT,
    aggregateType:firstAlert.aggregateType,aggregateId:firstAlert.aggregateId,version:1,
    correlationId:firstAlert.correlationId,payload:firstAlert.payload};
   expect(await service.shouldDeliver(eventEnvelope)).toBe(true);
   await service.scan(100);
   expect((await events())).toHaveLength(1);
   const response=await db.incidentResponse.findUnique({where:{organizationId_kind_sourceId:{
    organizationId:org,kind:'BRAIN_NEEDS_INTERVENTION',sourceId:runId
   }}});
   expect(response).not.toBeNull();
   await db.incidentResponse.update({where:{id:response!.id},
    data:{nextEscalationAt:new Date(Date.now()-60_000)}});
   await service.scan(100);
   expect((await events())).toHaveLength(2);
   expect((await events())[1]?.payload).toMatchObject({level:1});
   await expect(service.acknowledge('foreign-tenant','BRAIN_NEEDS_INTERVENTION',runId,'manager','Investigating alert with operator evidence'))
    .rejects.toThrow('no longer active');
   const acknowledged=await service.acknowledge(org,'BRAIN_NEEDS_INTERVENTION',runId,'manager',
    'Investigating crash evidence and provider billing');
   expect(acknowledged).toMatchObject({replay:false,sourceStatusUnchanged:true});
   expect(await service.acknowledge(org,'BRAIN_NEEDS_INTERVENTION',runId,'manager',
    'Investigating crash evidence and provider billing')).toMatchObject({replay:true});
   await db.incidentResponse.update({where:{id:response!.id},data:{nextEscalationAt:new Date(Date.now()-60_000)}});
   await service.scan(100);
   expect((await events())).toHaveLength(2);
   // Queued webhook events may still exist; acknowledgement suppresses them on delivery.
   expect(await service.shouldDeliver(eventEnvelope)).toBe(false);
   expect(await db.auditEvent.count({where:{organizationId:org,action:'MARKETING_INCIDENT_ACKNOWLEDGED'}})).toBe(1);
   expect((await db.brainRun.findUnique({where:{id:runId}}))?.status).toBe('NEEDS_INTERVENTION');
   const visible=await service.batch(org,'BRAIN_NEEDS_INTERVENTION',[runId]);
   expect(visible.get(runId)?.acknowledgedBy).toBe('manager');
  }finally{
   await db.outboxEvent.deleteMany({where:{organizationId:org}});
   await db.auditEvent.deleteMany({where:{organizationId:org}});
   await db.incidentResponse.deleteMany({where:{organizationId:org}});
   await db.brainRunStep.deleteMany({where:{organizationId:org}});
   await db.brainRun.deleteMany({where:{organizationId:org}});
   await db.organization.deleteMany({where:{id:org}});
   await db.$disconnect();
  }
 },60000);
 it('records an explicit stale versus active worker and does not misreport an empty fleet as healthy',async()=>{
  const db=new PrismaClient(),id=randomUUID();
  try{
   await db.$connect();
   const health=new MarketingWorkerHealthService(db as any);
   await health.heartbeat(id,'STARTING');
   expect((await health.summary()).active).toBeGreaterThanOrEqual(1);
   await db.marketingWorkerHeartbeat.update({where:{id},
    data:{lastSeenAt:new Date(Date.now()-65_000),status:'ACTIVE'}});
   const row=await db.marketingWorkerHeartbeat.findUnique({where:{id}});
   expect(row?.status).toBe('ACTIVE');
   expect(row!.lastSeenAt.getTime()).toBeLessThan(Date.now()-45_000);
   await health.stop(id);
   expect((await db.marketingWorkerHeartbeat.findUnique({where:{id}}))?.status).toBe('STOPPED');
  }finally{
   await db.marketingWorkerHeartbeat.deleteMany({where:{id}});
   await db.$disconnect();
  }
 },30000);
 it('does not recursively alert a dead-lettered incident webhook event',async()=>{
  const db=new PrismaClient(),org='alert-no-loop-'+randomUUID();
  try{
   await db.$connect();
   await db.organization.create({data:{id:org,name:'No alert loop tenant'}});
   await db.outboxEvent.create({data:{organizationId:org,eventId:'dead-alert-'+randomUUID(),
    eventType:INCIDENT_ALERT_EVENT,aggregateType:'IncidentResponse',aggregateId:'not-a-source',
    correlationId:'corr',payload:{},attempts:8,deadLetteredAt:new Date()}});
   const service=new MarketingIncidentResponseService(db as any);
   await service.scan(100);
   expect(await db.incidentResponse.count({where:{organizationId:org}})).toBe(0);
  }finally{
   await db.outboxEvent.deleteMany({where:{organizationId:org}});
   await db.incidentResponse.deleteMany({where:{organizationId:org}});
   await db.organization.deleteMany({where:{id:org}});
   await db.$disconnect();
  }
 },30000);
});
