import {describe,expect,it} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {SyntheticAudienceEmailService} from './synthetic-audience-email.service.js';
import {CampaignService} from './campaign.service.js';
import {ApprovalService} from './approval.service.js';
import {OutboxService} from './outbox.service.js';
import {permissionForMarketingRoute} from './marketing-permissions.js';

const enabled=process.env.MARKETING_DB_INTEGRATION==='1';
describe('R2H synthetic-only consent, suppression, audience and email pipeline',()=>{
 it.skipIf(!enabled)('T10-001 runs approved campaign through audience, simulated opt-in, withdrawal, complaint and immutable no-send intent',async()=>{
  const db=new PrismaClient(),org='r2h-org-'+randomUUID(),
   foreign='r2h-other-'+randomUUID(),
   creator='r2h-creator-'+randomUUID(),reviewer='r2h-admin-'+randomUUID(),
   brandId=randomUUID(),subject='oidc-r2h-'+randomUUID();
  try{
   await db.$connect();
   await db.organization.createMany({data:[
    {id:org,name:'R2H Test'}, {id:foreign,name:'R2H Other'}
   ]});
   await db.user.createMany({data:[
    {id:creator,organizationId:org,email:creator+'@example.invalid',
     name:'Campaign Author',role:'MARKETING_MANAGER'},
    {id:reviewer,organizationId:org,email:reviewer+'@example.invalid',
     name:'Consent Reviewer',role:'ADMIN',oidcSubject:subject}
   ]});
   await db.brand.create({data:{id:brandId,organizationId:org,slug:'r2h-brand',
    name:'R2H Brand',createdBy:creator}});
   await db.brandMasterRevision.create({data:{
    id:randomUUID(),organizationId:org,version:1,status:'APPROVED',
    sourceReference:'internal:brand-policy/r2h',
    rules:{voice:'Careful',requiredDisclaimers:[],prohibitedClaims:[]},
    proposedBy:creator,approvedBy:reviewer,approvedAt:new Date()
   }});
   const objective=await db.marketingObjective.create({data:{
    id:randomUUID(),organizationId:org,name:'Synthetic email compliance test',
    description:'Demonstrate safe synthetic suppression and consent'
   }});
   const campaigns=new CampaignService(db as any,new OutboxService(db as any));
   const approvals=new ApprovalService(db as any,{
    completeAfterApproval:async()=>{},blockAfterApprovalRejection:async()=>{}
   } as any);
   const campaign=await campaigns.create({
    organizationId:org,commandId:randomUUID(),correlationId:randomUUID(),
    code:'R2H-'+randomUUID().slice(0,8).toUpperCase(),
    name:'Consent-gated synthetic audience',objectiveId:objective.id,
    brandId,riskLevel:'R2'
   },creator) as {campaignId:string;version:number};
   let version=campaign.version;
   for(const to of ['ASSESSMENT','PROPOSED','APPROVAL_PENDING'] as const){
    const result=await campaigns.transition({
     organizationId:org,commandId:randomUUID(),
     correlationId:randomUUID(),campaignId:campaign.campaignId,to,
     expectedVersion:version
    },creator) as {version:number};
    version=result.version;
   }
   const identity={organizationId:org,userId:reviewer,subject,
    email:reviewer+'@example.invalid',role:'ADMIN'};
   const synthetic=new SyntheticAudienceEmailService(db as any);
   await expect(synthetic.createSyntheticContact(org,identity,{
    brandId,email:'cannot@store.example'
   })).rejects.toThrow('never submit email or PII');
   const contacts=[];
   for(let i=0;i<4;i++){
    const contact=await synthetic.createSyntheticContact(org,identity,{brandId});
    expect(contact).toMatchObject({syntheticOnly:true,
     legalConsentVerified:false,externalEffectsAuthorized:false});
    contacts.push(contact.contactId);
   }
   const contentDigest='sha256:'+'a'.repeat(64),requestKey='email-'+randomUUID();
   const audience={campaignId:campaign.campaignId,brandId,
    contactIds:contacts,contentDigest,requestKey};
   await expect(synthetic.simulateEmailJourney(org,identity,audience))
    .rejects.toThrow('independently approved campaign required');
   const campaignApproval=await db.approval.findFirstOrThrow({where:{
    organizationId:org,objectType:'Campaign',objectId:campaign.campaignId,
    decision:'PENDING'
   }});
   await approvals.approve({organizationId:org,commandId:randomUUID(),
    correlationId:randomUUID(),approvalId:campaignApproval.id,
    approverUserId:reviewer,decision:'APPROVED',
    rationale:'Independent human campaign approval'});
   const [eligible,withdrawn,complaint,unknown]=contacts;
   const action=async(contactId:string,event:string,k:string)=>
    synthetic.recordSyntheticConsent(org,identity,contactId,{
     action:event,requestKey:k
    });
   const optinKey='consent-'+randomUUID();
   expect(await action(eligible!,'SIMULATED_OPT_IN',optinKey))
    .toMatchObject({sequence:1,replayed:false,verifiedLegalConsent:false});
   expect(await action(eligible!,'SIMULATED_OPT_IN',optinKey))
    .toMatchObject({sequence:1,replayed:true});
   await expect(action(eligible!,'SIMULATED_WITHDRAWAL',optinKey))
    .rejects.toThrow('different action');
   await action(withdrawn!,'SIMULATED_OPT_IN','consent-'+randomUUID());
   await action(withdrawn!,'SIMULATED_WITHDRAWAL','consent-'+randomUUID());
   await action(complaint!,'SIMULATED_COMPLAINT','consent-'+randomUUID());
   await expect(action(complaint!,'SIMULATED_OPT_IN','consent-'+randomUUID()))
    .rejects.toThrow('irreversible');
   const listed=await synthetic.listSyntheticContacts(org,identity,brandId);
   expect(listed).toHaveLength(4);
   expect(listed.some(x=>x.contactId===withdrawn&&
    x.latestSimulatedConsent==='SIMULATED_WITHDRAWAL')).toBe(true);
   const simulated=await synthetic.simulateEmailJourney(org,identity,audience);
   expect(simulated).toMatchObject({status:'SIMULATED',replayed:false,
    externalEffectsAuthorized:false,
    results:{syntheticRecipients:4,syntheticEligible:1,withdrawn:1,
     complaintSuppressed:1,missingConsent:1,actualMessagesSent:0,
     verifiedProviderReceipts:0,realConsentVerified:false,
     externalEffectsAuthorized:false,automaticRetryAllowed:false}});
   const messaging={...audience,requestKey:'message-'+randomUUID(),channel:'WHATSAPP',purpose:'RETENTION_CHECK_IN',scenario:'OUTCOME_UNKNOWN',fixtureOnly:true};
   expect(await synthetic.rehearseMessage(org,identity,messaging)).toMatchObject({status:'BLOCKED',syntheticEligible:0,actualMessagesSent:0});
   await synthetic.recordSyntheticConsent(org,identity,eligible!,{channel:'WHATSAPP',action:'SIMULATED_OPT_IN',requestKey:'channel-'+randomUUID()});
   await synthetic.recordSyntheticConsent(org,identity,withdrawn!,{channel:'SMS',action:'SIMULATED_OPT_IN',requestKey:'channel-'+randomUUID()});
   await expect(synthetic.rehearseMessage(org,identity,messaging)).rejects.toThrow('changed consent');
   const message={...messaging,requestKey:'message-'+randomUUID()};
   const rehearsed=await synthetic.rehearseMessage(org,identity,message);
   expect(rehearsed).toMatchObject({status:'SIMULATED',syntheticEligible:1,virtualOutcomeUnknown:1,actualMessagesSent:0,actualNetworkRequests:0,financialLiabilityCreated:false,realLoyaltyPointsIssued:0,automaticRetryAllowed:false});
   expect(await synthetic.rehearseMessage(org,identity,message)).toMatchObject({rehearsalId:rehearsed.rehearsalId,replayed:true});
   await expect(synthetic.rehearseMessage(org,identity,{...message,scenario:'MOCK_ACCEPTED'})).rejects.toThrow('changed consent');
   expect(await synthetic.rehearseMessage(org,identity,{...message,channel:'SMS',requestKey:'message-'+randomUUID(),scenario:'MOCK_ACCEPTED'})).toMatchObject({syntheticEligible:1,virtualAccepted:1});
   await synthetic.recordSyntheticConsent(org,identity,eligible!,{channel:'WHATSAPP',action:'SIMULATED_COMPLAINT',requestKey:'channel-'+randomUUID()});
   await expect(synthetic.recordSyntheticConsent(org,identity,eligible!,{channel:'WHATSAPP',action:'SIMULATED_OPT_IN',requestKey:'channel-'+randomUUID()})).rejects.toThrow('irreversible');
   expect((await synthetic.listSyntheticContacts(org,identity,brandId,'EMAIL')).find(x=>x.contactId===eligible)).toMatchObject({effectiveSyntheticEligibility:'SYNTHETIC_ELIGIBLE'});
   expect((await synthetic.listSyntheticContacts(org,identity,brandId,'WHATSAPP')).find(x=>x.contactId===eligible)).toMatchObject({effectiveSyntheticEligibility:'COMPLAINT_SUPPRESSED'});
   expect((await synthetic.listMessageRehearsals(org,identity)).rehearsals).toHaveLength(3);
   await expect(synthetic.rehearseMessage(foreign,identity,message)).rejects.toThrow('Verified tenant');
   const replay=await synthetic.simulateEmailJourney(org,identity,audience);
   expect(replay).toMatchObject({simulationId:simulated.simulationId,replayed:true});
   const ambiguous=await synthetic.simulateEmailJourney(org,identity,{
    ...audience,requestKey:'esp-ambiguous-'+randomUUID(),
    scenario:'TIMEOUT_AFTER_ACCEPT'
   });
   expect(ambiguous).toMatchObject({status:'SIMULATED',
    results:{syntheticTransportScenario:'TIMEOUT_AFTER_ACCEPT',
     syntheticTransport:{virtualOutcomeUnknown:1,
      realProviderRequests:0,actualMessagesSent:0,verifiedProviderReceipts:0,
      automaticRetryAllowed:false}}});
   const journey={
    timeZone:'Europe/Berlin',startAt:'2026-11-19T22:30:00Z',
    quietHours:{start:'21:00',end:'08:00'},
    dailyCap:1,rolling7DayCap:3,
    steps:[{key:'welcome',delayMinutes:0,scenario:'ACCEPTED'},
     {key:'follow_up',delayMinutes:0,scenario:'TIMEOUT_AFTER_ACCEPT'}]
   };
   const journeyKey='r2j-'+randomUUID();
   const planned=await synthetic.simulateEmailJourney(org,identity,{
    ...audience,requestKey:journeyKey,journey
   });
   expect(planned).toMatchObject({status:'SIMULATED',
    results:{syntheticJourneyPlan:{syntheticOnly:true,
     actualMessagesSent:0,realProviderRequests:0,
     verifiedProviderReceipts:0,requiresFreshConsentAtExecution:true,
     externalEffectsAuthorized:false,
     steps:[{scheduledAt:'2026-11-20T07:00:00.000Z'},
      {scheduledAt:'2026-11-21T07:00:00.000Z',
       virtualOutcomeUnknown:1,automaticRetryAllowed:false}]}}});
   const plannedReplay=await synthetic.simulateEmailJourney(org,identity,{
    ...audience,requestKey:journeyKey,journey
   });
   expect(plannedReplay).toMatchObject({simulationId:planned.simulationId,
    replayed:true});
   await expect(synthetic.simulateEmailJourney(org,identity,{
    ...audience,requestKey:journeyKey,journey:{...journey,dailyCap:2}
   })).rejects.toThrow('changed audience, consent or creative');
   await expect(synthetic.simulateEmailJourney(org,identity,{
    ...audience,requestKey:'invalid-journey-'+randomUUID(),
    journey:{...journey,steps:[{key:'send',delayMinutes:0,
     scenario:'REAL_SEND'}]}
   })).rejects.toThrow('Unknown synthetic email provider scenario');
   await expect(synthetic.simulateEmailJourney(org,identity,{
    ...audience,requestKey:'esp-ambiguous-'+randomUUID(),
    scenario:'SEND_LIVE'
   })).rejects.toThrow('Unknown synthetic email provider scenario');
   await expect(synthetic.simulateEmailJourney(org,identity,{
    ...audience,scenario:'BOUNCED'
   })).rejects.toThrow('changed audience, consent or creative');
   const sqlSpoof=await db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${org}, true)`;
    return tx.marketingEmailSimulation.findFirstOrThrow({
     where:{organizationId:org,id:ambiguous.simulationId}
    });
   });
   await expect(db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${org}, true)`;
    return tx.marketingEmailSimulation.create({data:{
     id:randomUUID(),organizationId:org,brandId,
     campaignId:campaign.campaignId,audienceDigest:sqlSpoof.audienceDigest,
     contentDigest,requestKey:'spoof-'+randomUUID(),status:'SIMULATED',
     result:{actualMessagesSent:0,verifiedProviderReceipts:0,
      externalEffectsAuthorized:false,
      syntheticTransportScenario:'ACCEPTED',
      syntheticTransport:{scenario:'ACCEPTED',realProviderRequests:1,
       actualMessagesSent:0,verifiedProviderReceipts:0,
       externalEffectsAuthorized:false,automaticRetryAllowed:false,
       virtualRequestRef:'internal:synthetic-esp/'+'f'.repeat(64)}},
     createdBy:reviewer
    }});
   })).rejects.toThrow();
   expect(await db.marketingEmailSimulation.count({where:{
    organizationId:org,campaignId:campaign.campaignId}})).toBe(3);
   expect(await db.auditEvent.count({where:{organizationId:org,
    objectType:'MarketingEmailSimulation',objectId:simulated.simulationId}})).toBe(1);
   expect(await db.outboxEvent.count({where:{organizationId:org,
    aggregateId:simulated.simulationId,eventType:'EmailJourneySyntheticSimulatedInternal'}})).toBe(1);
   await expect(synthetic.simulateEmailJourney(foreign,identity,audience))
    .rejects.toThrow('audience administrator');
   await expect(synthetic.simulateEmailJourney(org,{
    ...identity,subject:'forged-subject'
   },audience)).rejects.toThrow('matching OIDC');
   await expect(synthetic.simulateEmailJourney(org,{
    ...identity,role:'VIEWER'
   },audience)).rejects.toThrow('audience administrator');
   await expect(synthetic.simulateEmailJourney(org,identity,{
    ...audience,contactIds:[eligible!,foreign]
   })).rejects.toThrow('foreign-tenant or cross-brand');
   await expect(synthetic.simulateEmailJourney(org,identity,{
    ...audience,contactIds:[eligible!,eligible!]
   })).rejects.toThrow('Duplicate');
   const full=await db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${org}, true)`;
    return tx.marketingSyntheticConsent.findFirstOrThrow({where:{
     organizationId:org,contactId:withdrawn!
    }});
   });
   await expect(db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${org}, true)`;
    return tx.marketingSyntheticConsent.update({where:{id:full.id},
     data:{action:'SIMULATED_OPT_IN'}});
   })).rejects.toThrow();
   await expect(db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${org}, true)`;
    return tx.marketingEmailSimulation.update({where:{id:simulated.simulationId},
     data:{status:'SENT'}});
   })).rejects.toThrow();
   await expect(db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${org}, true)`;
    return tx.marketingEmailSimulation.create({data:{
     id:randomUUID(),organizationId:org,brandId,
     campaignId:campaign.campaignId,audienceDigest:simulated.audienceDigest,
     contentDigest,requestKey:'malicious-'+randomUUID(),status:'SIMULATED',
     result:{actualMessagesSent:1,verifiedProviderReceipts:0,
      externalEffectsAuthorized:false},createdBy:reviewer
    }});
   })).rejects.toThrow();
   const failedDomainKey='domain-'+randomUUID();
   const domainBlocked=await synthetic.simulateEmailJourney(org,identity,{...audience,
    requestKey:failedDomainKey,senderDomainScenario:'DKIM_MISALIGNED',journey});
   expect(domainBlocked).toMatchObject({status:'BLOCKED',results:{
    syntheticEligible:1,domainBlockedEligible:1,senderDomainPreflight:{fixtureEligible:false,senderDomainVerified:false},
    syntheticTransport:{simulatedEligible:0,virtualAccepted:0,virtualCallbackCount:0,syntheticReadback:'UNAVAILABLE'},
    syntheticJourneyPlan:null,actualMessagesSent:0,verifiedProviderReceipts:0}});
   expect(await synthetic.simulateEmailJourney(org,identity,{...audience,requestKey:failedDomainKey,
    senderDomainScenario:'DKIM_MISALIGNED',journey})).toMatchObject({replayed:true,simulationId:domainBlocked.simulationId});
   await expect(synthetic.simulateEmailJourney(org,identity,{...audience,requestKey:failedDomainKey,
    senderDomainScenario:'ALIGNED',journey})).rejects.toThrow('changed audience, consent or creative');
   expect(await synthetic.simulateEmailJourney(org,identity,{...audience,requestKey:'domain-'+randomUUID(),
    senderDomainScenario:'ALIGNED',journey})).toMatchObject({status:'SIMULATED',results:{
    domainBlockedEligible:0,senderDomainPreflight:{fixtureEligible:true,senderDomainVerified:false},
    syntheticTransport:{virtualAccepted:1},syntheticJourneyPlan:{actualMessagesSent:0}}});
   await expect(synthetic.simulateEmailJourney(org,identity,{...audience,requestKey:'domain-'+randomUUID(),
    senderDomainScenario:'REAL_DOMAIN'})).rejects.toThrow('Unknown synthetic sender-domain scenario');
   // New withdrawal invalidates the previous audience snapshot, and all
   // synthetic recipients are now suppressed. No automatic send or replay.
   await action(eligible!,'SIMULATED_WITHDRAWAL','consent-'+randomUUID());
   await expect(synthetic.simulateEmailJourney(org,identity,audience))
    .rejects.toThrow('changed audience, consent or creative');
   const blocked=await synthetic.simulateEmailJourney(org,identity,{
    ...audience,requestKey:'new-'+randomUUID()
   });
   expect(blocked).toMatchObject({status:'BLOCKED',
    results:{syntheticEligible:0,actualMessagesSent:0,
     verifiedProviderReceipts:0}});
   // The CI database owner is a SUPERUSER and bypasses RLS. Prove actual
   // tenant isolation with a temporary unprivileged read-only PostgreSQL role.
   const probeRole='r2h_probe_'+randomUUID().replaceAll('-','').slice(0,18);
   await db.$executeRawUnsafe('CREATE ROLE "'+probeRole+'" NOLOGIN');
   try{
    await db.$executeRawUnsafe('GRANT SELECT ON "MarketingSyntheticContact",'+
     '"MarketingSyntheticConsent","MarketingEmailSimulation" TO "'+probeRole+'"');
    const observed=await db.$transaction(async tx=>{
     await tx.$executeRawUnsafe('SET LOCAL ROLE "'+probeRole+'"');
     const count=async(table:'MarketingSyntheticContact'|
      'MarketingSyntheticConsent'|'MarketingEmailSimulation')=>{
      const rows=await tx.$queryRawUnsafe<Array<{n:bigint}>>(
       'SELECT count(*)::bigint AS n FROM "'+table+'"');
      return Number(rows[0]?.n);
     };
     const before=[await count('MarketingSyntheticContact'),
      await count('MarketingSyntheticConsent'),
      await count('MarketingEmailSimulation')];
     await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${org}, true)`;
     const own=[await count('MarketingSyntheticContact'),
      await count('MarketingSyntheticConsent'),
      await count('MarketingEmailSimulation')];
     await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${foreign}, true)`;
     const other=[await count('MarketingSyntheticContact'),
      await count('MarketingSyntheticConsent'),
      await count('MarketingEmailSimulation')];
     return{before,own,other};
    });
    expect(observed.before).toEqual([0,0,0]);
    expect(observed.own[0]).toBe(4);
    expect(observed.own[1]).toBeGreaterThan(0);
    expect(observed.own[2]).toBe(6);
    expect(observed.other).toEqual([0,0,0]);
   }finally{
    await db.$executeRawUnsafe('REVOKE SELECT ON "MarketingSyntheticContact",'+
     '"MarketingSyntheticConsent","MarketingEmailSimulation" FROM "'+probeRole+'"');
    await db.$executeRawUnsafe('DROP ROLE "'+probeRole+'"');
   }
   expect(await synthetic.listEmailSimulations(org,identity)).toHaveLength(6);
   // Hard-bounce feedback is synthetic and permanent even after withdrawal.
   await action(unknown!,'SIMULATED_HARD_BOUNCE','consent-'+randomUUID());
   await action(unknown!,'SIMULATED_WITHDRAWAL','consent-'+randomUUID());
   await expect(action(unknown!,'SIMULATED_OPT_IN','consent-'+randomUUID()))
    .rejects.toThrow('irreversible');
   expect((await synthetic.listSyntheticContacts(org,identity,brandId))
    .find(x=>x.contactId===unknown)).toMatchObject({
     latestSimulatedConsent:'SIMULATED_WITHDRAWAL',
     effectiveSyntheticEligibility:'HARD_BOUNCE_SUPPRESSED'});
   const hardBounce=await synthetic.simulateEmailJourney(org,identity,{
    ...audience,contactIds:[unknown!],requestKey:'hard-bounce-'+randomUUID()
   });
   expect(hardBounce).toMatchObject({status:'BLOCKED',results:{
    syntheticRecipients:1,syntheticEligible:0,hardBounceSuppressed:1,withdrawn:0,
    actualMessagesSent:0,verifiedProviderReceipts:0}});
   await expect(db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id', ${org}, true)`;
    return tx.marketingSyntheticConsent.create({data:{
     id:randomUUID(),organizationId:org,contactId:unknown!,
     action:'SIMULATED_OPT_IN',sequence:3,evidenceRef:'internal:synthetic-consent/'+'f'.repeat(64),
     recordedBy:reviewer
    }});
   })).rejects.toThrow();


   // Provider-shaped fixtures reuse the same durable consent ledger and never
   // accept a verified webhook, recipient data, or caller-generated retry identity.
   const fixture={provider:'MAILCHIMP_TRANSACTIONAL',fixtureEventId:'fixture-'+randomUUID(),event:'spam'};
   const recorded=await synthetic.recordSyntheticConsent(org,identity,withdrawn!,{providerFeedback:fixture});
   expect(recorded).toMatchObject({action:'SIMULATED_COMPLAINT',replayed:false,
    providerFixture:'MAILCHIMP_TRANSACTIONAL',verifiedProviderReceipt:false,externalEffectsAuthorized:false});
   expect(await synthetic.recordSyntheticConsent(org,identity,withdrawn!,{providerFeedback:fixture}))
    .toMatchObject({sequence:recorded.sequence,replayed:true});
   await expect(synthetic.recordSyntheticConsent(org,identity,withdrawn!,{
    providerFeedback:{...fixture,event:'hard_bounce'}
   })).rejects.toThrow('different action');
   await expect(synthetic.recordSyntheticConsent(org,identity,withdrawn!,{
    providerFeedback:fixture,requestKey:'forged-retry-key-001'
   })).rejects.toThrow('Do not mix');
   await expect(synthetic.recordSyntheticConsent(foreign,identity,withdrawn!,{providerFeedback:fixture}))
    .rejects.toThrow('audience administrator');
   expect((await synthetic.listSyntheticContacts(org,identity,brandId))
    .find(x=>x.contactId===withdrawn)?.effectiveSyntheticEligibility).toBe('COMPLAINT_SUPPRESSED');
   await expect(action(withdrawn!,'SIMULATED_OPT_IN','consent-'+randomUUID()))
    .rejects.toThrow('irreversible');
   const audit=await db.auditEvent.findMany({where:{organizationId:org,
    action:'SYNTHETIC_CONSENT_EVENT_RECORDED',correlationId:withdrawn!}});
   const serialized=JSON.stringify(audit);
   expect(serialized).toContain('MAILCHIMP_TRANSACTIONAL');
   expect(serialized).not.toContain(fixture.fixtureEventId);
  }finally{await db.$disconnect();}
 },90000);
 it('keeps real email delivery and recipient export routes unregistered',()=>{
  expect(permissionForMarketingRoute('GET','/marketing/audience/synthetic-contacts'))
   .toBe('READ_TENANCY');
  expect(permissionForMarketingRoute('POST','/marketing/audience/synthetic-contacts'))
   .toBe('MANAGE_TENANT');
  expect(permissionForMarketingRoute('POST',
   '/marketing/audience/synthetic-contacts/abc/consent')).toBe('MANAGE_TENANT');
  expect(permissionForMarketingRoute('POST','/marketing/email/simulations'))
   .toBe('MANAGE_TENANT');
  expect(()=>permissionForMarketingRoute('POST','/marketing/email/send'))
   .toThrow('not in the permission registry');
  expect(()=>permissionForMarketingRoute('GET','/marketing/audience/export'))
   .toThrow('not in the permission registry');
 });
});
