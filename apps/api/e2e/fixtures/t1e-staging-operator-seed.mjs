/**
 * T1E additional CI-only staging-subject provision. Never executable against
 * a real staging database, customer tenant or with actual provider secrets.
 * Uses the existing authoritative Organization/User tables only.
 */
import {PrismaClient} from '@prisma/client';
import {stagingOidcSubject} from '@medsol/contracts';
const env=process.env;
if(env.CI!=='true'||env.GITHUB_ACTIONS!=='true'||
 env.MARKETING_R3Y_STAGING_CI_ONLY!=='1'||
 env.MARKETING_DB_INTEGRATION!=='1'||
 env.MARKETING_T1E_STAGING_CI_ONLY!=='1')
 throw Error('T1E_PROVISION_BLOCKED: disposable GitHub CI required');
const dbUrl=new URL(env.DATABASE_URL??'http://invalid');
if(dbUrl.protocol!=='postgresql:'||dbUrl.hostname!=='localhost'||
 dbUrl.pathname!=='/marketing_test'||dbUrl.username!=='marketing_test')
 throw Error('T1E_PROVISION_BLOCKED: exact disposable PostgreSQL required');
if(env.MARKETING_ENTRA_CLIENT_SECRET||env.OPENAI_API_KEY||
 env.ANTHROPIC_API_KEY||env.META_ACCESS_TOKEN)
 throw Error('T1E_PROVISION_BLOCKED: real provider credentials forbidden');
const issuer='https://127.0.0.1:3215';
const actors=[
 ['t1e-stage-admin','22222222-2222-4222-8222-222222222222','ADMIN','r3y-tenant-a'],
 ['t1e-stage-reviewer','33333333-3333-4333-8333-333333333333','ADMIN','r3y-tenant-a'],
 ['t1e-stage-viewer','44444444-4444-4444-8444-444444444444','VIEWER','r3y-tenant-a'],
 ['t1e-stage-foreign','55555555-5555-4555-8555-555555555555','ADMIN','r3y-tenant-b']
];
const db=new PrismaClient();
try{
 await db.$connect();
 for(const [id,oid,role,organizationId] of actors){
  const subject=stagingOidcSubject(issuer,'disposable-r3y-'+oid);
  await db.user.upsert({where:{id},
   create:{id,organizationId,role,name:id,email:id+'@example.invalid',
    oidcSubject:subject},
   update:{}}); // No elevated role changes or rebinding from replays
 }
 const count=await db.user.count({where:{id:{in:actors.map(a=>a[0])}}});
 if(count!==4)throw Error('T1E operator subject seed count mismatch');
 const creds=await db.providerCredential.count({where:{
  organizationId:{in:['r3y-tenant-a','r3y-tenant-b']}}});
 if(creds!==0)throw Error('External provider credentials unexpectedly present');
 process.stdout.write(JSON.stringify({schema:'medsol-t1e-disposable-operator-seed-v1',
  roleBoundSubjects:count,realProviderAccountsConnected:0,
  independentlyApproved:false,productionReady:false})+'\n');
}finally{await db.$disconnect();}
