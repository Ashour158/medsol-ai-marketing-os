#!/usr/bin/env node
/** T1E: existing Prisma User identity provisioning. DRY RUN unless --apply. */
import {PrismaClient} from '@prisma/client';
import {pinnedStagingIssuer,stagingOidcSubject} from '@medsol/contracts';
const env=process.env,args=process.argv.slice(2);
const option=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
const fail=reason=>{throw Error('T1E_PROVISION_BLOCKED: '+reason);};
let issuer;
try{issuer=pinnedStagingIssuer(env);}
catch(e){fail(e instanceof Error?e.message:'Invalid identity policy');}
if(args.some(a=>a.startsWith('--')&&
 !['--apply','--tenant','--subject','--name','--email','--role'].includes(a)))
 fail('Unsupported argument');
const tenant=option('--tenant'),opaque=option('--subject'),
 name=option('--name'),email=option('--email'),role=option('--role');
if(!tenant||!/^[A-Za-z0-9_-]{1,128}$/.test(tenant))
 fail('Approved existing tenant ID required');
if(!name||name.length>120||!name.trim())fail('Display name required');
if(!email||email.length>254||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
 fail('Valid operator email required');
if(!['ADMIN','VIEWER'].includes(role))
 fail('Roles restricted to ADMIN and VIEWER in first staging tranche');
let subject;
try{subject=stagingOidcSubject(issuer,opaque);}
catch{fail('Verified IdP opaque sub required; never use email');}
const apply=args.includes('--apply');
const preview={schema:'medsol-t1e-staging-operator-provision-v1',
 action:apply?'APPLY':'DRY_RUN',tenant,email,name,role,
 immutableIssuerScopedSubject:subject,
 autoProvisionAtLogin:false,productionReleaseCertified:false};
if(!apply){process.stdout.write(JSON.stringify(preview,null,2)+'\n');process.exit(0);}
if(env.MARKETING_STAGING_OPERATOR_WRITE_APPROVED!=='I_APPROVE_STAGING_IDENTITY_WRITES')
 fail('Explicit independent staging security approval required');
if(env.MARKETING_T1E_STAGING_CI_ONLY==='1'||env.CI==='true')
 fail('Real operator provisioning writes forbidden in disposable CI');
const maintenance=env.MARKETING_STAGING_MAINTENANCE_DB_URL;
let dbUrl,runtimeUrl;
try{dbUrl=new URL(maintenance??'');runtimeUrl=new URL(env.DATABASE_URL??'');}
catch{fail('Separate privileged staging maintenance DSN and runtime DB DSN required');}
if(dbUrl.protocol!=='postgresql:'||!dbUrl.password||!dbUrl.username||
 dbUrl.hostname!==env.MARKETING_STAGING_MAINTENANCE_DB_HOST||
 !/staging/i.test(dbUrl.pathname)||maintenance===env.DATABASE_URL||
 dbUrl.username===runtimeUrl.username)
 fail('Separate approved maintenance role required; never runtime PostgreSQL');
const db=new PrismaClient({datasources:{db:{url:maintenance}}});
try{
 const result=await db.$transaction(async tx=>{
  if(!await tx.organization.findUnique({where:{id:tenant}}))
   fail('Tenant must exist and have independent approval');
  const bound=await tx.user.findFirst({where:{organizationId:tenant,oidcSubject:subject}});
  if(bound){
   if(bound.email!==email||bound.role!==role||bound.disabledAt)
    fail('Identity conflicts with existing user; human review required');
   return{id:bound.id,reused:true};
  }
  if(await tx.user.findFirst({where:{organizationId:tenant,email}}))
   fail('Email is bound to a different identity; rebinding forbidden');
  const inserted=await tx.user.create({data:{organizationId:tenant,email,
    name,role,oidcSubject:subject}});
  return{id:inserted.id,reused:false};
 },{isolationLevel:'Serializable'});
 process.stdout.write(JSON.stringify({...preview,userId:result.id,
  reused:result.reused,independentApprovalRecordedInApp:false})+'\n');
}finally{await db.$disconnect();}
