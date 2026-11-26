/**
 * Idempotent, CI-only seed for the real R3-Y API database.
 * Privileged migration connection only here; Nest uses a different,
 * strictly unprivileged NON-BYPASSRLS runtime role.
 */
import {PrismaClient} from '@prisma/client';
import {randomUUID} from 'node:crypto';
if(process.env.CI!=='true'||process.env.GITHUB_ACTIONS!=='true'||
 process.env.MARKETING_R3Y_STAGING_CI_ONLY!=='1'||
 process.env.MARKETING_DB_INTEGRATION!=='1')
 throw Error('R3Y seed requires authorized disposable CI');
const url=new URL(process.env.DATABASE_URL??'http://invalid');
if(url.hostname!=='localhost'||url.pathname!=='/marketing_test'||
   url.username!=='marketing_test')
 throw Error('R3Y seed refuses a non-disposable PostgreSQL database');
const t='11111111-1111-4111-8111-111111111111';
const actors=[
 ['r3y-stage-admin','22222222-2222-4222-8222-222222222222','ADMIN','r3y-tenant-a'],
 ['r3y-stage-reviewer','33333333-3333-4333-8333-333333333333','ADMIN','r3y-tenant-a'],
 ['r3y-stage-viewer','44444444-4444-4444-8444-444444444444','VIEWER','r3y-tenant-a'],
 ['r3y-stage-foreign','55555555-5555-4555-8555-555555555555','ADMIN','r3y-tenant-b']
];
const db=new PrismaClient();
try{
 await db.$connect();
 for(const id of ['r3y-tenant-a','r3y-tenant-b'])
  await db.organization.upsert({where:{id},create:{id,name:'Disposable R3Y '+id},update:{}});
 for(const [id,oid,role,organizationId] of actors)
  await db.user.upsert({
   where:{id},update:{},
   create:{id,organizationId,role,name:id,email:id+'@example.invalid',
    oidcSubject:'entra:'+t+':'+oid}
  });
 const id='r3y-stage-brand';
 await db.brand.upsert({where:{id},update:{},create:{
  id,organizationId:'r3y-tenant-a',slug:'offline-r3y-lifesciences',
  name:'R3Y Real PostgreSQL Scientific Brand',createdBy:'r3y-stage-admin'
 }});
 await db.marketingProduct.upsert({where:{id:'r3y-alpha-product'},update:{},create:{id:'r3y-alpha-product',organizationId:'r3y-tenant-a',code:'ALPHA-FIXTURE',name:'Synthetic research catalogue product',vendor:'Fixture only',lifecycle:'ACTIVE'}});
 const policy=await db.brandMasterRevision.findFirst({
  where:{organizationId:'r3y-tenant-a',version:1}
 });
 if(!policy)await db.brandMasterRevision.create({data:{
  id:randomUUID(),organizationId:'r3y-tenant-a',version:1,
  status:'APPROVED',sourceReference:'internal:r3y-offline-approved-brand',
  rules:{voice:'Evidence-led science',primaryColor:'#124d83',
   prohibitedClaims:['guaranteed cure','guaranteed clinical outcome'],
   requiredDisclaimers:[]},
  proposedBy:'r3y-stage-admin',approvedBy:'r3y-stage-reviewer',approvedAt:new Date()
 }});
 const a=await db.user.count({where:{organizationId:'r3y-tenant-a'}});
 const credentials=await db.providerCredential.count({where:{
  organizationId:{in:['r3y-tenant-a','r3y-tenant-b']}
 }});
 if(a!==3||credentials!==0)throw Error('Disposable identity census or no-provider fence failed');
 process.stdout.write(JSON.stringify({
  schema:'medsol-r3y-ci-only-identity-seed-v1',tenant:'r3y-tenant-a',
  provisionedHumans:a,realProviderCredentials:credentials,
  simulatedOidcSubjectsOnly:true,productionCertified:false
 })+'\n');
}finally{await db.$disconnect()}
