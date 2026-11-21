import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {MarketingReadService} from './marketing-read.service.js';
import {MarketingLearningService} from './marketing-learning.service.js';
import {MarketingPerformanceService} from './marketing-performance.service.js';
import {BrandMasterService} from './brand-master.service.js';
import {CampaignPublicationService} from './campaign-publication.service.js';
import {SyntheticAudienceEmailService} from './synthetic-audience-email.service.js';
import {ModelBudgetService} from './model-budget.service.js';
import {withMarketingTenant} from './prisma.service.js';

/**
 * R3-X REAL PostgreSQL, original production domain owners, one disposable
 * two-tenant fixture. No mock database, fake approvals, real credentials,
 * outbound AI calls, social publishes or email sends.
 *
 * These are bounded PostgreSQL integration assertions, NOT independently
 * operated full deployed E2E cases or real provider UAT.
 */
const enabled=process.env.MARKETING_DB_INTEGRATION==='1';
describe.skipIf(!enabled)('R3-X two-tenant cross-owner PostgreSQL staging acceptance',()=>{
 const db=new PrismaClient();
 const a='r3x-a-'+randomUUID(),b='r3x-b-'+randomUUID();
 const adminId=randomUUID(),reviewerId=randomUUID(),subject='r3x-oidc-'+randomUUID();
 let brandId:string,foreignBrandId:string,objectiveId:string,foreignObjectiveId:string;
 let campaignId:string,foreignCampaignId:string;
 let reads:MarketingReadService,learning:MarketingLearningService;
 let performance:MarketingPerformanceService,brand:BrandMasterService;
 let pub:CampaignPublicationService,email:SyntheticAudienceEmailService;
 let budgets:ModelBudgetService;
 const observedAt=new Date(Date.now()-180_000).toISOString();
 const admin=()=>({organizationId:a,userId:adminId,role:'ADMIN',subject,
   email:adminId+'@example.invalid'});
 const metric=(name:string,value:number,record='r3x-'+randomUUID())=>({
  campaignId,sourceSystem:'MANUAL_EXPORT',sourceRecordId:record,
  metricKey:name,value,observedAt,sourceReference:'internal:r3x-evidence-source'
 });
 const signal=(key='r3x-'+randomUUID())=>({
  topic:'Controlled molecular laboratory communication '+key,
  sector:'life-sciences',sourceUrl:'https://example.invalid/r3x/'+key,
  sourceTitle:'Unverified internal acceptance sample',
  observedAt,evidence:{summary:'Offline simulation may not be published as verified market evidence'}
 });
 beforeAll(async()=>{
  // Disposable CI test requires exactly the known migrations and cannot run
  // as a production or customer-data operation.
  if(process.env.CI!=='true'&&process.env.MARKETING_R3X_LOCAL_TEST!=='1')
   throw new Error('R3-X requires explicitly disposable CI or local integration database');
  if(process.env.CI==='true'){
   const url=new URL(process.env.DATABASE_URL??'http://invalid');
   if(url.hostname!=='localhost'||url.pathname!=='/marketing_test')
    throw new Error('R3-X refuses non-disposable CI database');
  }
  await db.$connect();
  await db.organization.createMany({data:[
   {id:a,name:'R3-X disposable tenant A'},{id:b,name:'R3-X disposable tenant B'}
  ]});
  await db.user.createMany({data:[
   {id:adminId,organizationId:a,name:'R3X simulated admin',
    email:adminId+'@example.invalid',role:'ADMIN',oidcSubject:subject},
   {id:reviewerId,organizationId:a,name:'R3X separate reviewer',
    email:reviewerId+'@example.invalid',role:'ADMIN',
    oidcSubject:'reviewer-'+randomUUID()}
  ]});
  const x=await db.brand.create({data:{
   id:randomUUID(),organizationId:a,slug:'r3x-scientific',
   name:'R3X Scientific',createdBy:adminId
  }});
  brandId=x.id;
  const y=await db.brand.create({data:{
   id:randomUUID(),organizationId:b,slug:'r3x-foreign',
   name:'R3X Foreign',createdBy:adminId
  }});
  foreignBrandId=y.id;
  const obj=await db.marketingObjective.create({data:{
   organizationId:a,name:'R3X independently auditable campaign',description:'Offline controlled evidence'
  }});
  objectiveId=obj.id;
  const other=await db.marketingObjective.create({data:{
   organizationId:b,name:'Foreign private objective',description:'Tenant B only'
  }});
  foreignObjectiveId=other.id;
  const created=await db.campaign.create({data:{
   organizationId:a,brandId,objectiveId,code:'R3X-A-'+randomUUID().slice(0,8),
   name:'A: unapproved evidence-only campaign'
  }});
  campaignId=created.id;
  foreignCampaignId=(await db.campaign.create({data:{
   organizationId:b,brandId:foreignBrandId,objectiveId:foreignObjectiveId,
   code:'R3X-B-'+randomUUID().slice(0,8),name:'B: private campaign'
  }})).id;
  await db.brandMasterRevision.create({data:{
   id:randomUUID(),organizationId:a,version:1,status:'APPROVED',
   sourceReference:'internal:r3x-approved-brand-rules',
   rules:{voice:'Evidence first',primaryColor:'#124d83',
     prohibitedClaims:['guaranteed diagnosis'],requiredDisclaimers:[]},
   proposedBy:adminId,approvedBy:reviewerId,approvedAt:new Date()
  }});
  reads=new MarketingReadService(db as any);
  learning=new MarketingLearningService(db as any);
  performance=new MarketingPerformanceService(db as any);
  brand=new BrandMasterService(db as any);
  pub=new CampaignPublicationService(db as any);
  email=new SyntheticAudienceEmailService(db as any);
  budgets=new ModelBudgetService(db as any);
 },60000);
 afterAll(async()=>{await db.$disconnect();});

 it('T01-029 cross-tenant journey projection denies another tenant campaign',async()=>{
  await expect(reads.offlineJourney(b,campaignId)).rejects.toThrow(/not found in tenant/i);
 });
 it('T01-030 cross-tenant campaign detail owner does not disclose campaign data',async()=>{
  await expect(reads.campaign(b,campaignId)).rejects.toThrow(/not found in tenant/i);
 });
 it('T01-031 campaign portfolio is tenant partitioned in real PostgreSQL',async()=>{
  const [aList,bList]=await Promise.all([reads.campaigns(a),reads.campaigns(b)]);
  expect(aList.some(x=>x.id===campaignId)).toBe(true);
  expect(aList.some(x=>x.id===foreignCampaignId)).toBe(false);
  expect(bList.some(x=>x.id===foreignCampaignId)).toBe(true);
  expect(bList.some(x=>x.id===campaignId)).toBe(false);
 });
 it('T01-032 foreign organization cannot read tenant campaign KPI summary',async()=>{
  await expect(performance.summary(b,campaignId)).rejects.toThrow(/not found in tenant/i);
 });
 it('T01-033 cross-tenant objective cannot be admitted as agent authority',async()=>{
  await expect(reads.brainAuthorityContext(b,{objectiveId})).rejects.toThrow(/not found/i);
 });
 it('T01-034 foreign tenant cannot observe approved scientific brand master',async()=>{
  expect(await brand.active(b)).toBeNull();
  const own=await brand.active(a);
  expect(own?.status).toBe('APPROVED');
 });
 it('T01-035 evidence signals remain isolated by tenant after valid offline ingestion',async()=>{
  const s=await learning.ingest(a,signal());
  const [own,foreign]=await Promise.all([learning.signals(a),learning.signals(b)]);
  expect(own.some(x=>x.id===s.signal.id)).toBe(true);
  expect(foreign.some(x=>x.id===s.signal.id)).toBe(false);
 });

 it('T04-008 read model does not manufacture a workflow for a draft campaign',async()=>{
  const j=await reads.offlineJourney(a,campaignId);
  expect(j.workflow).toBeNull();
  expect(j.stages.briefRecorded).toBe(false);
 });
 it('T04-009 unapproved draft cannot claim campaign independently approved',async()=>{
  const j=await reads.offlineJourney(a,campaignId);
  expect(j.stages.campaignIndependentlyApproved).toBe(false);
  expect(j.campaignApprovals).toEqual([]);
 });
 it('T04-010 empty campaign cannot impersonate agent or creative state',async()=>{
  const j=await reads.offlineJourney(a,campaignId);
  expect(j.brainRuns).toEqual([]);
  expect(j.creativeAssets).toEqual([]);
  expect(j.stages.agentResearchReviewed).toBe(false);
  expect(j.stages.creativeIndependentlyApproved).toBe(false);
 });
 it('T04-011 repeated read-only timelines have zero invented external state',async()=>{
  const one=await reads.offlineJourney(a,campaignId);
  const two=await reads.offlineJourney(a,campaignId);
  for(const j of [one,two]){
   expect(j.externalEffectsAuthorized).toBe(false);
   expect(j.offlineSimulationOnly).toBe(true);
   expect(j.productionCertified).toBe(false);
  }
  expect(one.campaign.id).toBe(two.campaign.id);
 });

 it('T05-004 agent context uses canonical tenant objective without verified scientific claim',async()=>{
  const context=await reads.brainAuthorityContext(a,{objectiveId});
  expect(context).toMatchObject({
   source:'TENANT_MARKETING_CATALOG',
   declarationsVerified:true,scientificClaimsVerified:false,
   regulatoryApprovalVerified:false,objective:{id:objectiveId}
  });
 });
 it('T05-005 nonexistent product cannot become agent catalogue authority',async()=>{
  await expect(reads.brainAuthorityContext(a,{productId:randomUUID()}))
   .rejects.toThrow(/not found/);
 });
 it('T05-006 malformed input cannot bypass agent catalog reference rules',async()=>{
  await expect(reads.brainAuthorityContext(a,{objectiveId:5 as any}))
   .rejects.toThrow(/invalid/i);
 });

 it('T08-004 approved brand policies have immutable read-only source references',async()=>{
  const active=await brand.active(a);
  expect(active?.sourceReference).toBe('internal:r3x-approved-brand-rules');
  expect((active?.rules as any).prohibitedClaims).toContain('guaranteed diagnosis');
 });
 it('T08-005 foreign organization policy cannot substitute for tenant brand review',async()=>{
  expect(await brand.active(b)).toBeNull();
  const j=await reads.offlineJourney(a,campaignId);
  expect(j.campaign.brandId).toBe(brandId);
 });
 it('T08-006 brand owner refuses external untrusted FTP reference',async()=>{
  await expect(brand.propose(a,adminId,{
   sourceReference:'ftp://unverified.invalid/claims',
   rules:{voice:'Scientific',primaryColor:'#124d83',prohibitedClaims:[],requiredDisclaimers:[]}
  })).rejects.toThrow(/HTTPS/i);
 });

 it('T09-008 publication intent cannot bypass missing exact creative approval',async()=>{
  await expect(pub.prepare(a,adminId,{
   campaignId,approvalId:randomUUID(),requestKey:'r3x-'+randomUUID()
  })).rejects.toThrow(/exact creative approval/i);
  expect(await db.campaignPublication.count({where:{organizationId:a,campaignId}})).toBe(0);
 });
 it('T09-009 no simulated campaign can claim actual remote social delivery',async()=>{
  const j=await reads.offlineJourney(a,campaignId);
  expect(j.publications).toEqual([]);
  expect(j.stages.simulatedSocialPublished).toBe(false);
  expect(await db.publicationAttempt.count({where:{organizationId:a,mode:'REMOTE'}})).toBe(0);
 });
 it('T09-010 no provider credentials are provisioned by cross-engine reads',async()=>{
  await reads.offlineJourney(a,campaignId);
  expect(await db.providerCredential.count({where:{organizationId:a}})).toBe(0);
  expect(await db.integrationConnection.count({where:{organizationId:a}})).toBe(0);
 });

 it('T10-007 synthetic audience owner refuses supplied personal email addresses',async()=>{
  await expect(email.createSyntheticContact(a,admin(),{
   brandId,email:'actual-recipient@example.invalid'
  })).rejects.toThrow(/never submit email or PII/i);
 });
 it('T10-008 synthetic audience cannot be created by a foreign claimed identity',async()=>{
  await expect(email.createSyntheticContact(a,{
   ...admin(),organizationId:b
  },{brandId})).rejects.toThrow(/tenant audience administrator/i);
 });
 it('T10-009 unapproved campaign cannot simulate email even with invented consent',async()=>{
  await expect(email.simulateEmailJourney(a,admin(),{
   brandId,campaignId,contactIds:[randomUUID()],
   contentDigest:'sha256:'+'a'.repeat(64),requestKey:'r3x-mail-'+randomUUID()
  })).rejects.toThrow();
  expect(await db.marketingEmailSimulation.count({where:{organizationId:a,campaignId}})).toBe(0);
 });

 it('T12-002 source references are recorded but not treated as verified market facts',async()=>{
  const created=await learning.ingest(a,signal());
  expect(created.signal.status).toBe('QUARANTINED');
  expect(created.signal.sourceUrl).toMatch(/^https:\/\/example\.invalid\/r3x\//);
 });
 it('T12-003 external research source URLs cannot use insecure or nonpublic protocols',async()=>{
  await expect(learning.ingest(a,{...signal(),sourceUrl:'file:///etc/passwd'}))
   .rejects.toThrow(/HTTPS/i);
 });

 it('T13-006 actual metric import is quarantined instead of automatically reviewed',async()=>{
  const created=await performance.ingest(a,adminId,metric('impressions',1700));
  expect(created).toMatchObject({status:'QUARANTINED',replayed:false});
 });
 it('T13-007 identical source record is idempotent with real unique constraints',async()=>{
  const input=metric('clicks',14);
  const first=await performance.ingest(a,adminId,input);
  const again=await performance.ingest(a,adminId,input);
  expect(again).toMatchObject({observationId:first.observationId,replayed:true});
 });
 it('T13-008 conflicting data for an existing source record is rejected',async()=>{
  const input=metric('engagements',87);
  await performance.ingest(a,adminId,input);
  await expect(performance.ingest(a,adminId,{...input,value:88}))
   .rejects.toThrow(/conflicting observation/i);
 });
 it('T13-009 author cannot independently review their own KPI import',async()=>{
  const x=await performance.ingest(a,adminId,metric('leads',5));
  await expect(performance.review(a,adminId,x.observationId,
   'Self reviewed source export without independence'))
   .rejects.toThrow(/Independent/i);
 });
 it('T13-010 another tenant cannot decide on private metric observations',async()=>{
  const x=await performance.ingest(a,adminId,metric('qualified_leads',4));
  await expect(performance.review(b,reviewerId,x.observationId,
   'Foreign review of another tenant evidence')).rejects.toThrow(/not found in tenant/i);
 });
 it('T13-011 independent review is persisted exactly once with human audit',async()=>{
  const x=await performance.ingest(a,adminId,metric('spend_micros',1200000));
  const reviewed=await performance.review(a,reviewerId,x.observationId,
   'Independently inspected synthetic source file and claim limits');
  expect(reviewed).toMatchObject({status:'REVIEWED',independentlyVerified:false});
  await expect(performance.review(a,reviewerId,x.observationId,
   'Should not approve another time')).rejects.toThrow(/already reviewed/i);
  expect(await db.auditEvent.count({where:{organizationId:a,
   objectId:x.observationId,action:'MARKETING_METRIC_REVIEWED'}})).toBe(1);
 });
 it('T13-012 reviewed-source KPI ratios are arithmetic but not causal attribution',async()=>{
  for(const [key,value] of [['impressions',1000],['clicks',50],['leads',5]] as const){
   const x=await performance.ingest(a,adminId,metric(key,value));
   await performance.review(a,reviewerId,x.observationId,
    'Confirmed source numbers only; causal effects cannot be inferred');
  }
  const summary=await performance.summary(a,campaignId);
  expect(summary.derived.ctrPercent).toBe(5);
  expect(summary.derived.clickToLeadPercent).toBe(10);
  expect(summary.attributionValidated).toBe(false);
  expect(summary.independentlyVerified).toBe(false);
 });
 it('T13-013 invalid negative metric cannot be persisted as evidence',async()=>{
  await expect(performance.ingest(a,adminId,metric('clicks',-1)))
   .rejects.toThrow(/nonnegative integer observations/i);
 });
 it('T13-014 source claims require HTTPS or internal evidence references',async()=>{
  await expect(performance.ingest(a,adminId,{...metric('clicks',12),
   sourceReference:'http://unreviewed.invalid/outcome'}))
   .rejects.toThrow(/HTTPS or internal/i);
 });

 it('T14-003 original model budget owner denies model reservations when unprovisioned',async()=>{
  await expect(budgets.reserve({organizationId:a,agentId:'MKT-SCI-001',
   requestId:'r3x-budget-'+randomUUID(),costMicros:1000}))
   .rejects.toThrow(/disabled/i);
 });
 it('T14-004 model budget owner rejects negative or excessive cost before SQL write',async()=>{
  await expect(budgets.reserve({organizationId:a,agentId:'MKT-SCI-001',
   requestId:'r3x-budget-'+randomUUID(),costMicros:-1}))
   .rejects.toThrow(/Invalid model reservation/i);
  expect(await db.modelUsage.count({where:{organizationId:a}})).toBe(0);
 });
 it('T14-005 absent model budget in foreign tenant stays isolated',async()=>{
  expect(await budgets.summary(b)).toMatchObject({enabled:false});
  expect(await db.modelBudget.count({where:{organizationId:b}})).toBe(0);
 });
});
