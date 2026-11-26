import {describe,it,expect} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {SyntheticConversionService} from './synthetic-conversion.service.js';
import {SyntheticAudienceEmailService} from './synthetic-audience-email.service.js';
import {ApprovalService} from './approval.service.js';
import {CampaignService} from './campaign.service.js';
import {OutboxService} from './outbox.service.js';
import {withMarketingTenant} from './prisma.service.js';
import {permissionForMarketingRoute} from './marketing-permissions.js';
const enabled=process.env.MARKETING_DB_INTEGRATION==='1';
describe('T1 durable conversion form and synthetic lead handoff',()=>{
 it('allows only authenticated internal intake; no public or real CRM endpoint',()=>{
  expect(permissionForMarketingRoute('GET','/marketing/performance/forms')).toBe('READ_AUDIT');
  expect(permissionForMarketingRoute('POST','/marketing/performance/forms')).toBe('MANAGE_CAMPAIGN');
  expect(permissionForMarketingRoute('POST','/marketing/performance/forms/id-1/submit')).toBe('SUBMIT_EVIDENCE');
  expect(()=>permissionForMarketingRoute('POST','/marketing/performance/forms/id-1/dispatch')).toThrow();
 });
 it.skipIf(!enabled)('persists exact approved form, enforces synthetic consent, dedupe and immutable unknown outcome',async()=>{
  const db=new PrismaClient(),org='conversion-'+randomUUID(),foreign='conversion-other-'+randomUUID();
  const actor=(organizationId:string)=>{const userId=randomUUID();return{
   organizationId,userId,subject:'oidc-'+userId,email:userId+'@example.invalid',role:'ADMIN'};};
  const author=actor(org),reviewer=actor(org),outsider=actor(foreign);
  const brandId=randomUUID(),otherBrand=randomUUID();
  try{
   await db.organization.createMany({data:[{id:org,name:'Conversion test'},{id:foreign,name:'Other tenant'}]});
   await db.user.createMany({data:[author,reviewer,outsider].map(a=>({id:a.userId,organizationId:a.organizationId,
    email:a.email,name:'Synthetic actor',role:a.role,oidcSubject:a.subject}))});
   await db.brand.createMany({data:[{id:brandId,organizationId:org,name:'Test brand',slug:'test',createdBy:author.userId},
    {id:otherBrand,organizationId:org,name:'Other brand',slug:'other',createdBy:author.userId}]});
   const objective=await db.marketingObjective.create({data:{organizationId:org,name:'Synthetic form test',description:'Offline only'}});
   const campaigns=new CampaignService(db as any,new OutboxService(db as any));
   const approvals=new ApprovalService(db as any,{completeAfterApproval:async()=>{},blockAfterApprovalRejection:async()=>{}} as any);
   const campaign=await campaigns.create({organizationId:org,commandId:randomUUID(),correlationId:randomUUID(),
    code:'FORM-'+randomUUID().slice(0,8),name:'Synthetic conversion',objectiveId:objective.id,brandId,riskLevel:'R2'},author.userId) as {campaignId:string;version:number};
   let version=campaign.version;
   for(const to of ['ASSESSMENT','PROPOSED','APPROVAL_PENDING'] as const){
    const next=await campaigns.transition({organizationId:org,commandId:randomUUID(),correlationId:randomUUID(),
     campaignId:campaign.campaignId,to,expectedVersion:version},author.userId) as {version:number};version=next.version;
   }
   const decide=(approvalId:string,approverUserId:string)=>approvals.approve({organizationId:org,commandId:randomUUID(),
    correlationId:randomUUID(),approvalId,approverUserId,decision:'APPROVED',rationale:'Independent synthetic approval'});
   const pending=await db.approval.findFirstOrThrow({where:{organizationId:org,objectType:'Campaign',objectId:campaign.campaignId,decision:'PENDING'}});
   const service=new SyntheticConversionService(db as any),email=new SyntheticAudienceEmailService(db as any);
   const input={campaignId:campaign.campaignId,brandId,formKey:'fixture-'+randomUUID(),headline:'Mock scientific consultation',cta:'Request information'};
   await expect(service.create(org,author,input)).rejects.toThrow('Current approved');
   await decide(pending.id,reviewer.userId);
   const form=await service.create(org,author,input);
   expect(form).toMatchObject({approvalDecision:'PENDING',publicFormHosted:false,syntheticOnly:true,replayed:false});
   expect(await service.create(org,author,input)).toMatchObject({formId:form.formId,replayed:true});
   await expect(service.create(org,author,{...input,headline:'Changed content'})).rejects.toThrow('changed revision');
   await expect(decide(form.approvalId,author.userId)).rejects.toThrow('Independent conversion form');
   const contact=await email.createSyntheticContact(org,author,{brandId});
   const other=await email.createSyntheticContact(org,author,{brandId:otherBrand});
   const withdrawn=await email.createSyntheticContact(org,author,{brandId});
   const consent=(contactId:string,action:string)=>email.recordSyntheticConsent(org,author,contactId,{action,requestKey:'consent-'+randomUUID()});
   const submission={contactId:contact.contactId,requestKey:'fixture-'+randomUUID(),
    formDigest:form.contentDigest,mockCrmPurposeGranted:true,mockTransport:'OUTCOME_UNKNOWN'};
   await expect(service.submit(org,author,form.formId,submission)).rejects.toThrow('independently approved exact form');
   await decide(form.approvalId,reviewer.userId);
   await expect(service.submit(org,author,form.formId,submission)).rejects.toThrow('Current synthetic opt-in');
   await consent(contact.contactId,'SIMULATED_OPT_IN');
   await consent(other.contactId,'SIMULATED_OPT_IN');
   await consent(withdrawn.contactId,'SIMULATED_OPT_IN');
   await consent(withdrawn.contactId,'SIMULATED_WITHDRAWAL');
   await expect(service.submit(org,author,form.formId,{...submission,contactId:other.contactId})).rejects.toThrow('Same-brand synthetic contact');
   await expect(service.submit(org,author,form.formId,{...submission,contactId:withdrawn.contactId})).rejects.toThrow('Current synthetic opt-in');
   await expect(service.submit(org,author,form.formId,{...submission,formDigest:'sha256:'+'f'.repeat(64)})).rejects.toThrow('exact form');
   await expect(service.submit(org,author,form.formId,{...submission,mockCrmPurposeGranted:false})).rejects.toThrow('explicit mock CRM');
   await expect(service.submit(org,author,form.formId,{...submission,email:'no@example.invalid'})).rejects.toThrow('Bounded anonymous');
   const result=await service.submit(org,author,form.formId,submission);
   expect(result).toMatchObject({outcome:'OUTCOME_UNKNOWN',automaticRetryAuthorized:false,crmHandoffsExecuted:0,replayed:false,
    protocolEvidence:{scenario:'OUTCOME_UNKNOWN',fixtureReadback:'UNAVAILABLE',mockRecordRef:null,actualCrmRequests:0}});
   expect(await service.submit(org,author,form.formId,submission)).toMatchObject({submissionId:result.submissionId,replayed:true});
   await expect(service.submit(org,author,form.formId,{...submission,mockTransport:'ACCEPTED'})).rejects.toThrow('changed evidence');
   await expect(service.submit(org,author,form.formId,{...submission,requestKey:'fixture-'+randomUUID()})).rejects.toThrow('already submitted');
   await consent(contact.contactId,'SIMULATED_WITHDRAWAL');
   expect(await service.submit(org,author,form.formId,submission)).toMatchObject({replayed:true,outcome:'OUTCOME_UNKNOWN',crmHandoffsExecuted:0});
   for(const scenario of ['DUPLICATE_CALLBACK','READBACK_MISMATCH','RATE_LIMITED'] as const){
    const fixture=await email.createSyntheticContact(org,author,{brandId});await consent(fixture.contactId,'SIMULATED_OPT_IN');
    const r=await service.submit(org,author,form.formId,{...submission,contactId:fixture.contactId,
     requestKey:'fixture-'+randomUUID(),mockTransport:scenario});
    expect(r).toMatchObject({outcome:scenario==='DUPLICATE_CALLBACK'?'MOCK_ACCEPTED':scenario==='RATE_LIMITED'?'MOCK_REJECTED':'OUTCOME_UNKNOWN',
     protocolEvidence:{scenario,actualCrmRequests:0,verifiedRemoteReceipts:0,automaticRetryAuthorized:false}});
    if(scenario==='DUPLICATE_CALLBACK')expect(r.protocolEvidence).toMatchObject({mockCallbacks:2,uniqueMockCallbacks:1,fixtureReadback:'MATCH'});
    if(scenario==='READBACK_MISMATCH')expect(r.protocolEvidence).toMatchObject({fixtureReadback:'MISMATCH',mockRecordRef:null});
   }
   const rows=await service.list(org,reviewer,campaign.campaignId);
   expect(rows.forms).toHaveLength(1);expect(rows.submissions).toHaveLength(4);
   expect((await service.list(foreign,outsider,campaign.campaignId)).forms).toEqual([]);
   await expect(service.submit(foreign,outsider,form.formId,{...submission,requestKey:'fixture-'+randomUUID()})).rejects.toThrow('not found');
   await expect(withMarketingTenant(db,org,tx=>tx.marketingConversionSubmission.update({where:{id:result.submissionId},
    data:{outcome:'MOCK_ACCEPTED'}}))).rejects.toThrow();
   const role='conversion_probe_'+randomUUID().replaceAll('-','').slice(0,14);
   await db.$executeRawUnsafe('CREATE ROLE "'+role+'" NOLOGIN');
   try{
    await db.$executeRawUnsafe('GRANT SELECT ON "MarketingConversionForm","MarketingConversionSubmission" TO "'+role+'"');
    const counts=await db.$transaction(async tx=>{
     await tx.$executeRawUnsafe('SET LOCAL ROLE "'+role+'"');
     const count=async()=>[Number((await tx.$queryRaw<Array<{n:bigint}>>`SELECT count(*) AS n FROM "MarketingConversionForm"`)[0]?.n),
       Number((await tx.$queryRaw<Array<{n:bigint}>>`SELECT count(*) AS n FROM "MarketingConversionSubmission"`)[0]?.n)];
     const absent=await count();await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id',${org},true)`;
     const own=await count();await tx.$queryRaw`SELECT set_config('app.marketing_tenant_id',${foreign},true)`;
     return[absent,own,await count()];
    });expect(counts).toEqual([[0,0],[1,4],[0,0]]);
   }finally{await db.$executeRawUnsafe('REVOKE SELECT ON "MarketingConversionForm","MarketingConversionSubmission" FROM "'+role+'"');
    await db.$executeRawUnsafe('DROP ROLE "'+role+'"');}
  }finally{await db.$disconnect();}
 },90000);
});
