import {describe,it,expect} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {MarketingPerformanceService} from './marketing-performance.service.js';
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
  expect(permissionForMarketingRoute('POST','/marketing/performance/submissions/id-1/qualification')).toBe('SUBMIT_EVIDENCE');
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
   const scores={bant:{budget:4,authority:4,need:5,timeline:4},icp:{industry:2,companySize:2,role:2,geography:2}};
   await expect(service.qualify(org,author,result.submissionId,{...scores,bant:{...scores.bant,budget:null}})).rejects.toThrow('bounded');
   await expect(service.qualify(org,author,result.submissionId,{...scores,email:'invalid@example.invalid'})).rejects.toThrow('anonymous');
   await expect(service.qualify(foreign,outsider,result.submissionId,scores)).rejects.toThrow('not found');
   const review=await service.qualify(org,author,result.submissionId,scores);
   expect(review).toMatchObject({decision:'PENDING',assessment:{bantTotal:17,icpTotal:8,priority:'HOT',fitTier:'A'},
    realLeadVerified:false,crmWriteAuthorized:false,externalEffectsAuthorized:false,replayed:false});
   expect(await service.qualify(org,author,result.submissionId,scores)).toMatchObject({approvalId:review.approvalId,replayed:true});
   await expect(service.qualify(org,author,result.submissionId,{...scores,bant:{...scores.bant,budget:3}})).rejects.toThrow('different');
   await expect(decide(review.approvalId,author.userId)).rejects.toThrow('Independent OIDC synthetic lead');
   await decide(review.approvalId,reviewer.userId);
   await expect(withMarketingTenant(db,org,tx=>tx.approval.update({where:{id:review.approvalId},data:{scopeDigest:'sha256:'+'f'.repeat(64)}}))).rejects.toThrow();
   await consent(contact.contactId,'SIMULATED_WITHDRAWAL');
   await expect(service.qualify(org,author,result.submissionId,scores)).rejects.toThrow('no longer current');
   expect(await service.submit(org,author,form.formId,submission)).toMatchObject({replayed:true,outcome:'OUTCOME_UNKNOWN',crmHandoffsExecuted:0});
   for(const scenario of ['DUPLICATE_CALLBACK','READBACK_MISMATCH','RATE_LIMITED'] as const){
    const fixture=await email.createSyntheticContact(org,author,{brandId});await consent(fixture.contactId,'SIMULATED_OPT_IN');
    const r=await service.submit(org,author,form.formId,{...submission,contactId:fixture.contactId,
     requestKey:'fixture-'+randomUUID(),mockTransport:scenario});
    expect(r).toMatchObject({outcome:scenario==='DUPLICATE_CALLBACK'?'MOCK_ACCEPTED':scenario==='RATE_LIMITED'?'MOCK_REJECTED':'OUTCOME_UNKNOWN',
     protocolEvidence:{scenario,actualCrmRequests:0,verifiedRemoteReceipts:0,automaticRetryAuthorized:false}});
    if(scenario==='RATE_LIMITED'){
     const pendingReview=await service.qualify(org,author,r.submissionId,scores);
     await consent(fixture.contactId,'SIMULATED_WITHDRAWAL');
     await expect(decide(pendingReview.approvalId,reviewer.userId)).rejects.toThrow('no longer current');
    }
    if(scenario==='DUPLICATE_CALLBACK')expect(r.protocolEvidence).toMatchObject({mockCallbacks:2,uniqueMockCallbacks:1,fixtureReadback:'MATCH'});
    if(scenario==='READBACK_MISMATCH')expect(r.protocolEvidence).toMatchObject({fixtureReadback:'MISMATCH',mockRecordRef:null});
   }
   const rows=await service.list(org,reviewer,campaign.campaignId);
   expect(rows.forms).toHaveLength(1);expect(rows.submissions).toHaveLength(4);
   expect(rows.qualifications).toHaveLength(2);
   expect(rows.qualifications.find(x=>x.approvalId===review.approvalId)).toMatchObject({decision:'APPROVED',
    independentInternalReviewRecorded:true,realLeadVerified:false,crmWriteAuthorized:false,externalEffectsAuthorized:false});
   expect((await service.list(foreign,outsider,campaign.campaignId)).qualifications).toEqual([]);
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
   // Use the existing form/submission ledger, not generated outcome rows.
   const experiments=new MarketingPerformanceService(db as any);
   const variant=await service.create(org,author,{...input,formKey:'fixture-'+randomUUID(),headline:'Alternative synthetic consultation'});
   await decide(variant.approvalId,reviewer.userId);
   const ids:string[]=[];
   for(let i=0;i<6;i++){
    const c=await email.createSyntheticContact(org,author,{brandId});
    await consent(c.contactId,'SIMULATED_OPT_IN');ids.push(c.contactId);
   }
   const experimentInput={experimentKey:'fixture-'+randomUUID(),campaignId:campaign.campaignId,
    formAId:form.formId,formBId:variant.formId,contactIds:ids.slice(0,4),endsAt:new Date(Date.now()+86400000).toISOString()};
   await expect(experiments.proposeExperiment(org,author,{...experimentInput,contactIds:[ids[0],ids[1],ids[2],other.contactId]})).rejects.toThrow('same-brand');
   await expect(experiments.proposeExperiment(org,author,{...experimentInput,contactIds:[ids[0],ids[0],ids[1],ids[2]]})).rejects.toThrow('Duplicate');
   const experiment=await experiments.proposeExperiment(org,author,experimentInput);
   expect(experiment).toMatchObject({decision:'PENDING',assignedCount:4,syntheticOnly:true,externalEffectsAuthorized:false});
   expect(await experiments.proposeExperiment(org,author,{...experimentInput,contactIds:[...experimentInput.contactIds].reverse()}))
    .toMatchObject({approvalId:experiment.approvalId,replayed:true});
   await expect(experiments.proposeExperiment(org,author,{...experimentInput,formAId:variant.formId,formBId:form.formId})).rejects.toThrow('different immutable');
   expect(await experiments.experimentReport(org,author,experimentInput.experimentKey)).toMatchObject({results:null,decision:'PENDING'});
   await expect(experiments.experimentReport(foreign,outsider,experimentInput.experimentKey)).rejects.toThrow('not found');
   await expect(decide(experiment.approvalId,author.userId)).rejects.toThrow('Independent OIDC experiment');
   await decide(experiment.approvalId,reviewer.userId);
   const active=await experiments.experimentReport(org,reviewer,experimentInput.experimentKey);
   expect(active).toMatchObject({decision:'APPROVED',actualExposureVerified:false,causalLiftValidated:false,
    results:{arms:[{arm:'A',assigned:2,recordedAssignedFormSubmissions:0},{arm:'B',assigned:2,recordedAssignedFormSubmissions:0}]}});
   const armA=active.assignments.filter(x=>x.arm==='A'),armB=active.assignments.filter(x=>x.arm==='B');
   const submitArm=(contactId:string,formId:string,formDigest:string)=>service.submit(org,author,formId,{
    contactId,requestKey:'fixture-'+randomUUID(),formDigest,mockCrmPurposeGranted:true,mockTransport:'ACCEPTED'});
   await submitArm(armA[0]!.contactId,form.formId,form.contentDigest);
   // Opposite arm event must not be counted; changed synthetic consent invalidates its old assignment evidence.
   await submitArm(armB[0]!.contactId,form.formId,form.contentDigest);
   await consent(armB[1]!.contactId,'SIMULATED_WITHDRAWAL');
   await consent(armB[1]!.contactId,'SIMULATED_OPT_IN');
   await submitArm(armB[1]!.contactId,variant.formId,variant.contentDigest);
   const final=await experiments.experimentReport(org,reviewer,experimentInput.experimentKey);
   expect(final.results).toMatchObject({status:'CONTAMINATED_SYNTHETIC_EVIDENCE',crossoverContacts:1,changedConsentContacts:1,
    arms:[{arm:'A',assigned:2,recordedAssignedFormSubmissions:1,recordedSubmissionRatePercent:50},
     {arm:'B',assigned:2,recordedAssignedFormSubmissions:0,recordedSubmissionRatePercent:0}],
    actualExposureVerified:false,causalLiftValidated:false,externalEffectsAuthorized:false});
   await expect(withMarketingTenant(db,org,tx=>tx.approval.update({where:{id:experiment.approvalId},data:{scopeDigest:'sha256:'+'f'.repeat(64)}}))).rejects.toThrow();
   const secondInput={...experimentInput,experimentKey:'fixture-'+randomUUID(),contactIds:[ids[4]!,ids[5]!,armA[1]!.contactId,ids[0]!]};
   // Reject contaminated or duplicate prior form evidence, regardless of a new experiment key.
   await expect(experiments.proposeExperiment(org,author,{...experimentInput,experimentKey:'fixture-'+randomUUID()})).rejects.toThrow('prior submissions');
   // A fresh pending plan cannot be approved after opt-in withdrawal.
   const extra:string[]=[];
   for(let i=0;i<2;i++){const c=await email.createSyntheticContact(org,author,{brandId});await consent(c.contactId,'SIMULATED_OPT_IN');extra.push(c.contactId);}
   const stale=await experiments.proposeExperiment(org,author,{...secondInput,contactIds:[ids[4]!,ids[5]!,...extra]});
   await consent(extra[0]!,'SIMULATED_WITHDRAWAL');
   await expect(decide(stale.approvalId,reviewer.userId)).rejects.toThrow('eligible same-brand');
  }finally{await db.$disconnect();}
 },120000);
});
