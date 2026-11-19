import {describe,expect,it} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {randomUUID,createHmac} from 'node:crypto';
import {PlatformIntegrationHubService} from './platform-integration-hub.service.js';
import {ProviderWebhookEvidenceService} from './provider-webhook-evidence.service.js';
import {permissionForMarketingRoute} from './marketing-permissions.js';

const enabled=process.env.MARKETING_DB_INTEGRATION==='1';
const secret=Buffer.from('0123456789abcdef0123456789abcdef');
const event=Buffer.from(JSON.stringify({
 object:'page',entry:[{id:'unbound-provider-page',changes:[{field:'feed'}]}]
}));
const signature=(raw=event)=>'sha256='+createHmac('sha256',secret).update(raw).digest('hex');
describe('R2E-A signed webhook ingress is server-only and fail closed',()=>{
 it('does not create a browser/AI reachable callback or publish endpoint',()=>{
  for(const path of [
   '/marketing/webhooks/meta/con1','/marketing/integrations/con1/webhooks/ingest',
   '/marketing/publications/pub1/remote-receipt'
  ])expect(()=>permissionForMarketingRoute('POST',path)).toThrow();
 });
 it.skipIf(!enabled)('quarantines signed notification, deduplicates, rejects foreign tenant and immutable SQL modification',async()=>{
  const db=new PrismaClient();
  const org='r2e-tenant-'+randomUUID(),foreign='r2e-foreign-'+randomUUID();
  const actor='admin-'+randomUUID(),brandId=randomUUID();
  const hub=new PlatformIntegrationHubService(db as any);
  let resolved=0;
  const svc=new ProviderWebhookEvidenceService(db as any,{
   secretFor:async(tenant,connectionId)=>{
    resolved++;
    expect(tenant).toBe(org);
    expect(connectionId).toMatch(/^[a-f0-9-]{36}$/);
    return secret;
   }
  });
  try{
   await db.$connect();
   await db.organization.createMany({data:[{id:org,name:'Signed webhook owner'},
    {id:foreign,name:'Foreign webhook tenant'}]});
   await db.brand.create({data:{id:brandId,organizationId:org,
    slug:'r2e-meta',name:'R2E Meta brand',createdBy:actor}});
   const connection=await hub.register(org,actor,{brandId,providerKey:'META_GRAPH',
    destinationLabel:'Signed Meta notification test'});
   await expect(svc.ingestMeta(foreign,'meta_adapter',connection.id,event,signature()))
    .rejects.toThrow('not found');
   expect(resolved).toBe(0);
   const bad=Buffer.from(event);bad[12]=bad[12]!^1;
   await expect(svc.ingestMeta(org,'meta_adapter',connection.id,bad,signature()))
    .rejects.toThrow('signature');
   expect(await db.providerWebhookObservation.count({where:{organizationId:org}})).toBe(0);
   const saved=await svc.ingestMeta(org,'meta_adapter',connection.id,event,signature());
   expect(saved).toMatchObject({status:'QUARANTINED',replayed:false,
    receiptReconciled:false,externalEffectsAuthorized:false});
   const replay=await svc.ingestMeta(org,'meta_adapter',connection.id,event,signature());
   expect(replay).toMatchObject({observationId:saved.observationId,replayed:true,
    receiptReconciled:false,externalEffectsAuthorized:false});
   const observations=await svc.list(org,connection.id);
   expect(observations).toHaveLength(1);
   expect(observations[0]).toMatchObject({status:'QUARANTINED',
    eventClass:'page',receiptReconciled:false,customerDestinationBound:false});
   await expect(svc.list(foreign,connection.id)).rejects.toThrow('not found');
   const rows=await db.$transaction(async tx=>{
    await tx.$queryRawUnsafe("SELECT set_config('app.marketing_tenant_id', $1, true)",org);
    return tx.providerWebhookObservation.findMany({where:{organizationId:org}});
   });
   expect(rows).toHaveLength(1);
   expect(JSON.stringify(rows)).not.toContain('unbound-provider-page');
   expect(JSON.stringify(rows)).not.toContain(secret.toString('utf8'));
   const audit=await db.auditEvent.findMany({where:{organizationId:org,
    action:'PROVIDER_SIGNED_WEBHOOK_QUARANTINED'}});
   expect(audit).toHaveLength(1);
   expect(JSON.stringify(audit)).not.toContain('unbound-provider-page');
   expect(JSON.stringify(audit)).not.toContain(secret.toString('utf8'));
   const inbox=await db.inboxEvent.findMany({where:{organizationId:org,
    consumerName:'META_SIGNED_WEBHOOK'}});
   expect(inbox).toHaveLength(1);
   expect(inbox[0]?.status).toBe('PROCESSED');
   // Identical payloads on different configured subscriptions must not
   // collide in the shared InboxEvent deduplication authority.
   const separateConnection=await hub.register(org,actor,{
    brandId,providerKey:'META_GRAPH',
    destinationLabel:'Independent signed Meta subscription'});
   const separate=await svc.ingestMeta(org,'meta_adapter',
    separateConnection.id,event,signature());
   expect(separate).toMatchObject({status:'QUARANTINED',replayed:false,
    externalEffectsAuthorized:false});
   expect(separate.observationId).not.toBe(saved.observationId);
   expect(await db.inboxEvent.count({where:{organizationId:org,
    consumerName:'META_SIGNED_WEBHOOK'}})).toBe(2);
   const pageId='123456789012',postRef=pageId+'_987654321012';
   const signedPost=Buffer.from(JSON.stringify({object:'page',entry:[{
    id:pageId,time:Math.floor(Date.now()/1000),
    changes:[{field:'feed',value:{item:'post',verb:'add',post_id:postRef}}]
   }]}));
   const postReceipt=await svc.ingestMeta(org,'meta_adapter',
    connection.id,signedPost,signature(signedPost));
   const claims=await db.$transaction(async tx=>{
    await tx.$queryRawUnsafe("SELECT set_config('app.marketing_tenant_id', $1, true)",org);
    return tx.providerWebhookObservation.findUniqueOrThrow({
     where:{id:postReceipt.observationId}});
   });
   expect(claims).toMatchObject({status:'QUARANTINED'});
   expect(claims.candidateAccountDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
   expect(claims.candidatePostDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
   expect(claims.candidateEventAt).toBeInstanceOf(Date);
   expect(JSON.stringify(claims)).not.toContain(postRef);
   expect(JSON.stringify(claims)).not.toContain(pageId);
   expect(await svc.ingestMeta(org,'meta_adapter',connection.id,
    signedPost,signature(signedPost))).toMatchObject({
     observationId:postReceipt.observationId,replayed:true,
     receiptReconciled:false,externalEffectsAuthorized:false
    });
   const samePostOnOtherSubscription=await svc.ingestMeta(org,'meta_adapter',
    separateConnection.id,signedPost,signature(signedPost));
   const otherClaims=await db.$transaction(async tx=>{
    await tx.$queryRawUnsafe("SELECT set_config('app.marketing_tenant_id', $1, true)",org);
    return tx.providerWebhookObservation.findUniqueOrThrow({
     where:{id:samePostOnOtherSubscription.observationId}});
   });
   expect(otherClaims.candidatePostDigest).not.toBe(claims.candidatePostDigest);
   await expect(db.$transaction(async tx=>{
    await tx.$queryRawUnsafe("SELECT set_config('app.marketing_tenant_id', $1, true)",org);
    return tx.providerWebhookObservation.update({
     where:{id:postReceipt.observationId},
     data:{candidatePostDigest:'sha256:'+'f'.repeat(64)}});
   })).rejects.toThrow();
   expect(await db.inboxEvent.count({where:{organizationId:org,
    consumerName:'META_SIGNED_WEBHOOK'}})).toBe(4);
   await expect(db.$transaction(async tx=>{
    await tx.$queryRawUnsafe("SELECT set_config('app.marketing_tenant_id', $1, true)",org);
    return tx.providerWebhookObservation.update({
     where:{id:saved.observationId},data:{status:'DELIVERED'}});
   })).rejects.toThrow();
   await expect(db.$transaction(async tx=>{
    await tx.$queryRawUnsafe("SELECT set_config('app.marketing_tenant_id', $1, true)",org);
    return tx.providerWebhookObservation.delete({where:{id:saved.observationId}});
   })).rejects.toThrow();
   await hub.change(org,actor,connection.id,connection.version,'REVOKE',
    'Withdrawing unbound Meta notification authorization');
   await expect(svc.ingestMeta(org,'meta_adapter',connection.id,event,signature()))
    .rejects.toThrow('not found');
  }finally{await db.$disconnect();}
 },90000);
 it.skipIf(!enabled)('T01-007 FORCE RLS partitions signed evidence under non-bypass tenant role',async()=>{
  const db=new PrismaClient(),org='r2e-rls-'+randomUUID();
  const role='r2e_reader_'+randomUUID().replaceAll('-','').slice(0,16);
  const actor='admin-'+randomUUID(),brandId=randomUUID();
  const hub=new PlatformIntegrationHubService(db as any);
  const svc=new ProviderWebhookEvidenceService(db as any,{secretFor:async()=>secret});
  let roleCreated=false;
  try{
   await db.$connect();
   await db.organization.create({data:{id:org,name:'R2E RLS tenant'}});
   await db.brand.create({data:{id:brandId,organizationId:org,
    slug:'meta-rls',name:'Meta RLS',createdBy:actor}});
   const connection=await hub.register(org,actor,{
    brandId,providerKey:'META_GRAPH',destinationLabel:'Meta RLS subscription'});
   await svc.ingestMeta(org,'meta_adapter',connection.id,event,signature());
   await db.$executeRawUnsafe('CREATE ROLE "'+role+'" NOLOGIN');roleCreated=true;
   await db.$executeRawUnsafe('GRANT SELECT ON "ProviderWebhookObservation" TO "'+role+'"');
   const result=await db.$transaction(async tx=>{
    await tx.$executeRawUnsafe('SET LOCAL ROLE "'+role+'"');
    const count=async()=>{
     const rows=await tx.$queryRawUnsafe<Array<{n:bigint}>>(
      'SELECT count(*)::bigint AS n FROM "ProviderWebhookObservation"');
     return Number(rows[0]?.n);
    };
    const noTenant=await count();
    await tx.$queryRawUnsafe("SELECT set_config('app.marketing_tenant_id', $1, true)",org);
    const own=await count();
    await tx.$queryRawUnsafe("SELECT set_config('app.marketing_tenant_id', $1, true)",'some-other-tenant');
    const other=await count();
    return{noTenant,own,other};
   });
   expect(result).toEqual({noTenant:0,own:1,other:0});
   const next=await db.$transaction(async tx=>{
    await tx.$executeRawUnsafe('SET LOCAL ROLE "'+role+'"');
    const rows=await tx.$queryRawUnsafe<Array<{n:bigint}>>(
     'SELECT count(*)::bigint AS n FROM "ProviderWebhookObservation"');
    return Number(rows[0]?.n);
   });
   expect(next).toBe(0);
  }finally{
   if(roleCreated){
    await db.$executeRawUnsafe('REVOKE SELECT ON "ProviderWebhookObservation" FROM "'+role+'"');
    await db.$executeRawUnsafe('DROP ROLE IF EXISTS "'+role+'"');
   }
   await db.$disconnect();
  }
 },90000);
});
