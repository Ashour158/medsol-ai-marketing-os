import {describe,expect,it} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {ProviderContractTrialService}
 from './provider-contract-trial.service.js';
const enabled=process.env.MARKETING_DB_INTEGRATION==='1';
describe('R2/R3 provider protocol trials with actual PostgreSQL OIDC and ledger',()=>{
 it.skipIf(!enabled)(
  'isolates tenants, enforces OIDC, idempotency, audit and zero production effects',
  async()=>{
   const db=new PrismaClient();
   const org='trial-org-'+randomUUID(),foreign='trial-foreign-'+randomUUID();
   const admin='trial-admin-'+randomUUID(),otherAdmin='trial-admin-'+randomUUID();
   const subject='oidc-trial-'+randomUUID(),foreignSubject='oidc-trial-'+randomUUID();
   const identity={userId:admin,organizationId:org,
    subject,email:'trial-admin@example.invalid',role:'ADMIN'};
   const foreignIdentity={userId:otherAdmin,organizationId:foreign,
    subject:foreignSubject,email:'trial-foreign@example.invalid',role:'ADMIN'};
   const service=new ProviderContractTrialService(db as any);
   try{
    await db.$connect();
    await db.organization.createMany({data:[
     {id:org,name:'Trial primary'},{id:foreign,name:'Trial foreign'}]});
    await db.user.createMany({data:[
     {id:admin,organizationId:org,name:'Trial Admin',
      email:identity.email,role:'ADMIN',oidcSubject:subject},
     {id:otherAdmin,organizationId:foreign,name:'Foreign Admin',
      email:foreignIdentity.email,role:'ADMIN',oidcSubject:foreignSubject}
    ]});
    const catalog=await service.catalog(org,identity);
    expect(catalog).toMatchObject({mockOnly:true,
     realNetworkCalls:0,realAccountsConnected:0,externalEffectsAuthorized:false});
    expect(catalog.providers).toContain('LINKEDIN');
    expect(catalog.providers).toContain('SENDGRID');
    await expect(service.catalog(foreign,identity)).rejects.toThrow('administrator');
    await expect(service.catalog(org,{...identity,subject:'forged'}))
     .rejects.toThrow('matching OIDC');
    await expect(service.catalog(org,{...identity,role:'VIEWER'}))
     .rejects.toThrow('administrator');
    const requestKey='trial-'+randomUUID();
    const first=await service.run(org,identity,{
     provider:'LINKEDIN',scenario:'SUCCESS',requestKey});
    expect(first).toMatchObject({fixtureOnly:true,
     contractOutcome:'FIXTURE_MATCH',replayed:false,
     actualProviderRequests:0,actualPostsPublished:0,
     verifiedRemoteReceipts:0,externalEffectsAuthorized:false});
    const replay=await service.run(org,identity,{
     provider:'LINKEDIN',scenario:'SUCCESS',requestKey});
    expect(replay).toMatchObject({trialRef:first.trialRef,replayed:true});
    await expect(service.run(org,identity,{
     provider:'LINKEDIN',scenario:'READBACK_MISMATCH',requestKey}))
     .rejects.toThrow('different contract');
    await expect(service.run(org,identity,{
     provider:'LINKEDIN',scenario:'SUCCESS',requestKey,
     accessToken:'REAL_SECRET_NEVER_ACCEPT'}))
     .rejects.toThrow('never credentials or URLs');
    const foreignTrial=await service.run(foreign,foreignIdentity,{
     provider:'LINKEDIN',scenario:'SUCCESS',requestKey});
    expect(foreignTrial.trialRef).not.toBe(first.trialRef);
    await expect(service.run(foreign,identity,{
     provider:'LINKEDIN',scenario:'SUCCESS',requestKey:'different-12345'}))
     .rejects.toThrow('administrator');
    const parallelKey='parallel-'+randomUUID();
    const parallel=await Promise.all([
     service.run(org,identity,{provider:'META_GRAPH',
      scenario:'TIMEOUT_AFTER_ACCEPT',requestKey:parallelKey}),
     service.run(org,identity,{provider:'META_GRAPH',
      scenario:'TIMEOUT_AFTER_ACCEPT',requestKey:parallelKey})
    ]);
    expect(parallel.map(x=>x.replayed).sort()).toEqual([false,true]);
    expect(parallel.every(x=>x.contractOutcome==='OUTCOME_UNKNOWN'&&
     x.automaticRetryAllowed===false)).toBe(true);
    expect(await db.commandReceipt.count({where:{
     organizationId:org,commandType:'PROVIDER_CONTRACT_TRIAL'}})).toBe(2);
    expect(await db.auditEvent.count({where:{
     organizationId:org,action:'OFFLINE_PROVIDER_WIRE_TRIAL_EXECUTED'}})).toBe(2);
    expect(await db.commandReceipt.count({where:{
     organizationId:foreign,commandType:'PROVIDER_CONTRACT_TRIAL'}})).toBe(1);
    expect(await db.integrationConnection.count({where:{organizationId:org}}))
     .toBe(0);
    expect(await db.providerCredential.count({where:{organizationId:org}}))
     .toBe(0);
    expect(await db.publicationAttempt.count({where:{organizationId:org}}))
     .toBe(0);
    expect(await db.marketingEmailSimulation.count({where:{organizationId:org}}))
     .toBe(0);
    const audits=await db.auditEvent.findMany({where:{organizationId:org,
     action:'OFFLINE_PROVIDER_WIRE_TRIAL_EXECUTED'}});
    expect(JSON.stringify(audits)).not.toContain('TRIAL_ONLY_NOT_A_REAL_CREDENTIAL');
    expect(JSON.stringify(audits)).not.toContain('REAL_SECRET_NEVER_ACCEPT');
    expect(audits.every(x=>(x.after as any).externalEffectsAuthorized===false))
     .toBe(true);
    // Phase 5: every provider crosses the same authenticated owner and
    // canonical durable receipts; history is bounded and redacted.
    const observed=[];
    for(const provider of catalog.providers)for(const scenario of ['SUCCESS','AUTH_REJECTED','TIMEOUT_AFTER_ACCEPT'] as const){
     const row=await service.run(org,identity,{provider,scenario,requestKey:'matrix-'+randomUUID()});
     expect(row).toMatchObject({provider,scenario,fixtureOnly:true,actualProviderRequests:0,actualModelCalls:0,actualMcpCalls:0,actualA2aCalls:0,verifiedRemoteReceipts:0,automaticRetryAllowed:false,externalEffectsAuthorized:false});
     if(scenario==='AUTH_REJECTED')expect(row.contractOutcome).toBe('BLOCKED');
     if(scenario==='TIMEOUT_AFTER_ACCEPT')expect(row.contractOutcome).toBe('OUTCOME_UNKNOWN');
     observed.push(row);
    }
    expect(observed).toHaveLength(42);
    const history=await service.history(org,identity);
    expect(history).toMatchObject({organizationId:org,fixtureOnly:true,actualProviderRequests:0,realAccountsConnected:0,productionCertified:false,externalEffectsAuthorized:false,windowCapped:false,limit:100});
    expect(history.entries).toHaveLength(44);
    for(const r of observed)expect(history.entries.find(e=>e.trialRef===r.trialRef)).toMatchObject({provider:r.provider,scenario:r.scenario,contractOutcome:r.contractOutcome,verifiedRemoteReceipts:0});
    expect(JSON.stringify(history)).not.toContain('TRIAL_ONLY_NOT_A_REAL_CREDENTIAL');
    expect(JSON.stringify(history)).not.toContain(requestKey);
    expect((await service.history(foreign,foreignIdentity)).entries.map(e=>e.trialRef)).toEqual([foreignTrial.trialRef]);
    await expect(service.history(foreign,identity)).rejects.toThrow('administrator');
    await expect(service.history(org,{...identity,role:'VIEWER'})).rejects.toThrow('administrator');
    expect(await db.providerCredential.count({where:{organizationId:org}})).toBe(0);
    expect(await db.integrationConnection.count({where:{organizationId:org}})).toBe(0);
    // Corrupted evidence must not be treated as verified fixture history.
    await db.commandReceipt.create({data:{organizationId:org,commandId:'PROVIDER_TRIAL:corrupt-'+randomUUID(),commandType:'PROVIDER_CONTRACT_TRIAL',correlationId:first.trialRef,status:'COMPLETED',response:{inputDigest:'invalid'}}});
    await expect(service.history(org,identity)).rejects.toThrow('Invalid stored offline trial evidence');
    await db.user.update({where:{id:admin},data:{disabledAt:new Date()}});
    await expect(service.history(org,identity)).rejects.toThrow('matching OIDC');
    await expect(service.run(org,identity,{
     provider:'GEMINI',scenario:'SUCCESS',requestKey:'disabled-'+randomUUID()}))
     .rejects.toThrow('matching OIDC');
   }finally{await db.$disconnect();}
  },90000);
});
