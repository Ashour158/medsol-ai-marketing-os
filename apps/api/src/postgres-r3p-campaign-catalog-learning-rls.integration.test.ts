import {describe,expect,it} from 'vitest';
import {PrismaClient} from '@prisma/client';
import {randomUUID} from 'node:crypto';
import {withMarketingTenant} from './prisma.service.js';
import {CampaignService} from './campaign.service.js';
import {OutboxService} from './outbox.service.js';
import {MarketingReadService} from './marketing-read.service.js';
import {MarketingCatalogService} from './marketing-catalog.service.js';
import {BrandMasterService} from './brand-master.service.js';
import {TenantBrandService} from './tenant-brand.service.js';
import {TenantRolePolicyService} from './tenant-role-policy.service.js';
import {MarketingLearningService} from './marketing-learning.service.js';
import {SkillReleaseService} from './skill-release.service.js';

const enabled=process.env.MARKETING_DB_INTEGRATION==='1';
const tenant=(x:string)=>'r3p-'+x+'-'+randomUUID();
const future=()=>new Date(Date.now()+7*86400_000).toISOString();
const rules={voice:'Scientific evidence without hype',
 primaryColor:'#124D83',prohibitedClaims:['Guaranteed cure'],
 requiredDisclaimers:['Research use only where applicable']};
const catalogTables=[
 'MarketingObjective','MarketingProduct','Campaign',
 'BrandMasterRevision','LearningSignal','AgentSkillProposal'
] as const;
function roleName(){
 return 'r3p_lowpriv_'+randomUUID().replaceAll('-','').slice(0,13);
}
async function lowPrivCounts(db:PrismaClient,role:string,org:string|null){
 return db.$transaction(async tx=>{
  await tx.$executeRawUnsafe('SET LOCAL ROLE "'+role+'"');
  if(org)await tx.$queryRawUnsafe(
   "SELECT set_config('app.marketing_tenant_id',$1,true)",org);
  const result:Record<string,number>={};
  for(const table of catalogTables){
   const rows=await tx.$queryRawUnsafe<Array<{n:number}>>(
    'SELECT count(*)::int as n FROM "'+table+'"');
   result[table]=rows[0]?.n??-1;
  }
  return result;
 });
}
async function grantRole(db:PrismaClient,role:string,tableNames:readonly string[],actions='SELECT'){
 await db.$executeRawUnsafe('CREATE ROLE "'+role+'" NOLOGIN');
 for(const table of tableNames)
  await db.$executeRawUnsafe(
   'GRANT '+actions+' ON "'+table+'" TO "'+role+'"');
}
async function dropRole(db:PrismaClient,role:string){
 for(const table of [...catalogTables,'AgencyGrant']){
  await db.$executeRawUnsafe('REVOKE ALL ON "'+table+'" FROM "'+role+'"');
 }
 await db.$executeRawUnsafe('DROP ROLE IF EXISTS "'+role+'"');
}
async function source(db:PrismaClient,org:string,label:string){
 return db.learningSignal.create({data:{organizationId:org,
  fingerprint:randomUUID().replaceAll('-','')+randomUUID().replaceAll('-','').slice(0,32),
  topic:'Proof of offline campaigns '+label,sector:'biotechnology',
  sourceUrl:'https://example.invalid/learn/'+label+'-'+randomUUID(),
  sourceTitle:'Offline study '+label,observedAt:new Date(),
  evidence:{summary:'Synthetic evaluation; do not promote external scientific claims'},
  status:'QUARANTINED'}});
}

describe.skipIf(!enabled)('R3-P real PostgreSQL FORCE tenant RLS on six canonical campaign/knowledge domains',()=>{
 it('T01-011 partitions all six tables under non-BYPASSRLS role, including pooled null and wrong-tenant access',async()=>{
  const db=new PrismaClient(),a=tenant('isolation-a'),other=tenant('isolation-b');
  const role=roleName();let roleCreated=false;
  try{
   await db.$connect();
   await db.organization.createMany({data:[
    {id:a,name:'R3P low-privilege A'},{id:other,name:'R3P low-privilege B'}
   ]});
   for(const organizationId of [a,other]){
    const brand=await withMarketingTenant(db,organizationId,tx=>tx.brand.create({
     data:{id:randomUUID(),organizationId,slug:'brand-'+randomUUID(),
      name:'Tenant own brand',createdBy:'fixture-author'}}));
    const objective=await db.marketingObjective.create({data:{
     organizationId,name:'Synthetic objective',description:'Isolation evidence'}});
    await db.marketingProduct.create({data:{
     organizationId,code:'PRODUCT-'+randomUUID(),name:'Synthetic product'}});
    await db.campaign.create({data:{
     organizationId,brandId:brand.id,objectiveId:objective.id,
     code:'CAMPAIGN-'+randomUUID(),name:'Offline launch'}});
    await db.brandMasterRevision.create({data:{
     organizationId,version:1,status:'DRAFT',
     sourceReference:'internal:brand-master-source',
     rules,proposedBy:'fixture-author'}});
    const evidence=await source(db,organizationId,organizationId);
    await db.agentSkillProposal.create({data:{
     organizationId,agentId:'MKT-CMO-001',skillKey:'ASSESS_OBJECTIVE',
     rationale:'Offline suite proves strict skill evidence owner',
     evidenceSignalId:evidence.id,status:'PROPOSED'
    }});
   }
   await grantRole(db,role,[...catalogTables,'AgencyGrant'],'SELECT');
   roleCreated=true;
   const none=await lowPrivCounts(db,role,null);
   expect(Object.values(none)).toEqual(Array(6).fill(0));
   const left=await lowPrivCounts(db,role,a),right=await lowPrivCounts(db,role,other);
   expect(Object.values(left)).toEqual(Array(6).fill(1));
   expect(Object.values(right)).toEqual(Array(6).fill(1));
   expect(await lowPrivCounts(db,role,null)).toEqual(none);
   await db.$executeRawUnsafe('GRANT INSERT ON "MarketingObjective" TO "'+role+'"');
   await expect(db.$transaction(async tx=>{
    await tx.$executeRawUnsafe('SET LOCAL ROLE "'+role+'"');
    return tx.marketingObjective.create({data:{organizationId:a,
     name:'Forged unscoped objective',description:'Must fail the DB policy'}});
   })).rejects.toThrow();
   const aSignal=await db.learningSignal.findFirstOrThrow({where:{organizationId:a}});
   await expect(db.agentSkillProposal.create({data:{
    organizationId:other,agentId:'MKT-CMO-001',skillKey:'ASSESS_MARKET',
    evidenceSignalId:aSignal.id,
    rationale:'Cross-client link must be impossible even as migrator'
   }})).rejects.toThrow();
  }finally{
   if(roleCreated)await dropRole(db,role);
   // Data is disposable by CI database deletion, never bulk-deleting legal evidence.
   await db.$disconnect();
  }
 },90000);

 it('T01-012 agency can select only live CAMPAIGN_READ brand grants and never mutate client campaigns',async()=>{
  const db=new PrismaClient(),client=tenant('client'),agency=tenant('agency');
  const role=roleName();let roleCreated=false;
  try{
   await db.$connect();
   await db.organization.createMany({data:[
    {id:client,name:'Client isolation'},{id:agency,name:'Delegated agency'}]});
   const svc=new TenantBrandService(db as any,new TenantRolePolicyService(db as any));
   const alpha=await svc.createBrand(client,'client-admin',{
    slug:'alpha-'+randomUUID(),name:'Alpha brand'});
   const beta=await svc.createBrand(client,'client-admin',{
    slug:'beta-'+randomUUID(),name:'Beta brand'});
   const objective=await db.marketingObjective.create({data:{organizationId:client,
    name:'Campaign brand proof',description:'Agency scope'}});
   const campaignSvc=new CampaignService(db as any,new OutboxService(db as any));
   const c1=await campaignSvc.create({
    commandId:randomUUID(),correlationId:randomUUID(),organizationId:client,
    objectiveId:objective.id,brandId:alpha.id,
    code:'ALPHA-'+randomUUID(),name:'Alpha proof',riskLevel:'R1'
   });
   const c2=await campaignSvc.create({
    commandId:randomUUID(),correlationId:randomUUID(),organizationId:client,
    objectiveId:objective.id,brandId:beta.id,
    code:'BETA-'+randomUUID(),name:'Beta not delegated',riskLevel:'R1'
   });
   const grant=await svc.grantAgency(client,'client-admin',{
    agencyOrganizationId:agency,brandId:alpha.id,
    actions:['CAMPAIGN_READ'],expiresAt:future()
   });
   await grantRole(db,role,['Campaign','AgencyGrant'],'SELECT');
   roleCreated=true;
   await db.$executeRawUnsafe('GRANT UPDATE ON "Campaign" TO "'+role+'"');
   const inspect=async(tenantId:string|null)=>db.$transaction(async tx=>{
    await tx.$executeRawUnsafe('SET LOCAL ROLE "'+role+'"');
    if(tenantId)await tx.$queryRawUnsafe(
     "SELECT set_config('app.marketing_tenant_id',$1,true)",tenantId);
    return tx.$queryRawUnsafe<Array<{id:string}>>(
     'SELECT "id" FROM "Campaign" ORDER BY "id"');
   });
   expect(await inspect(null)).toEqual([]);
   expect((await inspect(client)).map(x=>x.id)).toContain(c2.campaignId);
   expect((await inspect(agency)).map(x=>x.id)).toEqual([c1.campaignId]);
   const unauthorizedWrite=await db.$transaction(async tx=>{
    await tx.$executeRawUnsafe('SET LOCAL ROLE "'+role+'"');
    await tx.$queryRawUnsafe(
     "SELECT set_config('app.marketing_tenant_id',$1,true)",agency);
    return tx.$executeRawUnsafe(
     'UPDATE "Campaign" SET "name"=$1 WHERE "id"=$2',
     'Forged agency mutation',c1.campaignId);
   });
   expect(unauthorizedWrite).toBe(0);
   await svc.revokeAgency(client,'client-admin',grant.id,
    'Independent review completed and access must terminate permanently');
   expect(await inspect(agency)).toEqual([]);
   expect((await inspect(client)).map(x=>x.id).sort())
    .toEqual([c1.campaignId,c2.campaignId].sort());
  }finally{
   if(roleCreated)await dropRole(db,role);
   await db.$disconnect();
  }
 },90000);

 it('T07-026 governed learning, review and skill evaluation retain tenant-scoped source authority',async()=>{
  const db=new PrismaClient(),org=tenant('learning'),other=tenant('other');
  try{
   await db.$connect();
   await db.organization.createMany({data:[
    {id:org,name:'Learning tenant'},{id:other,name:'Foreign learning tenant'}]});
   const learning=new MarketingLearningService(db as any);
   const first=await learning.ingest(org,{
    topic:'Campaign evidence review',sector:'biotechnology',
    sourceUrl:'https://example.invalid/science/'+randomUUID(),
    sourceTitle:'Reviewed fake source is still not independent science',
    observedAt:new Date().toISOString(),
    evidence:{summary:'Synthetic evidence references, no actual independent medical claim verification'}
   });
   expect(first.signal.status).toBe('QUARANTINED');
   expect((await learning.signals(org)).map(x=>x.id)).toContain(first.signal.id);
   expect(await learning.signals(other)).toEqual([]);
   const verified=await learning.verify(org,'reviewer',first.signal.id);
   expect(verified.status).toBe('REVIEWED');
   const brief=await learning.trendBrief(org);
   expect(brief.independentVerification).toBe(false);
   expect(brief.topics.some(x=>x.evidence.some(e=>e.signalId===first.signal.id))).toBe(true);
   const proposed=await learning.propose(org,'proposer',{
    signalId:first.signal.id,agentId:'MKT-CMO-001',
    skillKey:'ASSESS_OBJECTIVE',
    rationale:'Propose only immutable predeclared model-free evaluation skill'
   });
   expect(proposed.status).toBe('PROPOSED');
   const skills=new SkillReleaseService(db as any);
   const evaluated=await skills.evaluate(org,'independent-qa',proposed.id);
   expect(['EVALUATED','REJECTED']).toContain(evaluated.status);
   expect(evaluated.activated).toBe(false);
   if(evaluated.status==='EVALUATED'){
    const decision=await skills.decide(org,'separate-reviewer',proposed.id,
     'APPROVE','Independent source, manifest and regression review completed');
    expect(decision.automaticallyActivated).toBe(false);
   }
   expect(await learning.proposals(other)).toEqual([]);
   await expect(learning.propose(other,'attacker',{
    signalId:first.signal.id,agentId:'MKT-CMO-001',
    skillKey:'ASSESS_OBJECTIVE',rationale:'Attempt to borrow another tenant research evidence'
   })).rejects.toThrow('not found in tenant');
  }finally{await db.$disconnect();}
 },90000);

 it('T08-032 canonical objective, brand review, campaign lifecycle and reporting work with scoped PostgreSQL context',async()=>{
  const db=new PrismaClient(),org=tenant('operational'),other=tenant('foreign');
  try{
   await db.$connect();
   await db.organization.createMany({data:[
    {id:org,name:'Catalog and brand tenant'},{id:other,name:'Foreign tenant'}]});
   const admin='human-admin-'+randomUUID(),reviewer='reviewer-'+randomUUID();
   const brands=new TenantBrandService(db as any,new TenantRolePolicyService(db as any));
   const brand=await brands.createBrand(org,admin,{
    slug:'research-'+randomUUID(),name:'Scientific research'});
   const catalog=new MarketingCatalogService(db as any);
   const objective=await catalog.createObjective(org,{userId:admin,role:'ADMIN'},{
    name:'Biotechnology brand awareness',description:'Safe offline marketing portfolio'});
   const master=new BrandMasterService(db as any);
   const proposed=await master.propose(org,admin,{
    sourceReference:'internal:reviewed-brand-guidelines',rules
   });
   const accepted=await master.decide(org,reviewer,proposed.revisionId,
    'APPROVE','Independent review of documented research brand instructions');
   expect(accepted.status).toBe('APPROVED');
   expect((await master.active(org))?.version).toBe(proposed.version);
   expect(await master.active(other)).toBeNull();
   const campaigns=new CampaignService(db as any,new OutboxService(db as any));
   const cmd={commandId:randomUUID(),correlationId:randomUUID(),
    organizationId:org,objectiveId:objective.id,brandId:brand.id,
    code:'R3P-'+randomUUID(),name:'Offline scientific campaign',riskLevel:'R1' as const};
   const created=await campaigns.create(cmd,admin);
   const read=new MarketingReadService(db as any);
   const listed=await read.campaigns(org);
   expect(listed.some(c=>c.id===created.campaignId)).toBe(true);
   expect((await read.campaign(org,created.campaignId)).objective.id).toBe(objective.id);
   expect((await read.overview(org)).campaigns).toBeGreaterThan(0);
   expect((await read.objectives(org)).some(x=>x.id===objective.id)).toBe(true);
   await expect(read.campaign(other,created.campaignId)).rejects.toThrow('not found in tenant');
   const t=await campaigns.transition({commandId:randomUUID(),correlationId:randomUUID(),
    organizationId:org,campaignId:created.campaignId,to:'ASSESSMENT',expectedVersion:1},admin);
   expect(t.status).toBe('ASSESSMENT');
  }finally{await db.$disconnect();}
 },90000);
});
