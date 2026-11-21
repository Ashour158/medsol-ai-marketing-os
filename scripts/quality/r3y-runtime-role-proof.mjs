#!/usr/bin/env node
/**
 * R3-Y checks a separate real PostgreSQL NON-BYPASSRLS application principal
 * and actual per-tenant data visibility. Never a production database proof.
 */
import {spawnSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const env=process.env,runId=env.GITHUB_RUN_ID;
if(env.CI!=='true'||env.GITHUB_ACTIONS!=='true'||env.MARKETING_R3Y_STAGING_CI_ONLY!=='1'||
 !/^\d{5,18}$/.test(runId??''))
 throw new Error('R3Y_ROLE_PROOF_BLOCKED: disposable CI required');
const url=new URL(env.DATABASE_URL??'http://invalid');
if(url.protocol!=='postgresql:'||url.hostname!=='localhost'||url.port!=='5432'||
 url.username!=='marketing_r3y_runtime'||url.pathname!=='/marketing_test'||
 url.searchParams.get('schema')!=='public')
 throw new Error('R3Y_ROLE_PROOF_BLOCKED: only disposable non-owner runtime role permitted');
const output=process.argv[2]==='--output'?process.argv[3]:null;
if(!output?.endsWith('.json'))throw Error('Explicit JSON evidence required');
function sql(query){
 const result=spawnSync('psql',['-X','-A','-t','-q','-v','ON_ERROR_STOP=1',
  '-h','localhost','-p','5432','-U',url.username,'-d','marketing_test','-c',query],{
   encoding:'utf8',timeout:10000,maxBuffer:1024*1024,
   env:{...env,PGPASSWORD:decodeURIComponent(url.password)}
  });
 if(result.status!==0||result.error)
  throw Error('R3Y runtime PostgreSQL check failed: '+String(result.stderr||result.error).slice(0,300));
 return result.stdout.trim().split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
}
const [role]=sql("SELECT current_user || '|' || rolsuper::text || '|' || rolbypassrls::text || '|' || rolcreaterole::text || '|' || rolcreatedb::text FROM pg_roles WHERE rolname=current_user");
if(role!=='marketing_r3y_runtime|false|false|false|false')
 throw Error('R3Y runtime database role unexpectedly privileged: '+role);
const noTenant=sql('SELECT COUNT(*) FROM public."User"');
if(noTenant.join('')!=='0')
 throw Error('R3Y missing tenant context exposed user records');
function count(org){
 const lines=sql("BEGIN; SELECT set_config('app.marketing_tenant_id','"+org+"',true); SELECT COUNT(*) FROM public.\"User\"; COMMIT;");
 const numeric=lines.filter(x=>/^\d+$/.test(x));
 if(numeric.length!==1)return NaN;
 return Number(numeric[0]);
}
const a=count('r3y-tenant-a'),b=count('r3y-tenant-b');
if(a!==3||b!==1)
 throw Error('R3Y actual runtime RLS tenant partition incorrect: '+a+' / '+b);
const evidence={
 schema:'medsol-r3y-runtime-role-rls-proof-v1',runId,
 verdict:'DISPOSABLE_NON_BYPASSRLS_TENANT_SEPARATION_PASSED',
 dbRole:'marketing_r3y_runtime',superuser:false,bypassRls:false,
 canCreateRole:false,canCreateDatabase:false,
 noTenantRowsVisible:0,tenantARowsVisible:3,tenantBRowsVisible:1,
 productionRoleInspected:false,independentPenetrationTestPassed:false,
 realProviderCredentialsPresent:false,releaseVerdict:'NOT_CERTIFIED'
};
writeFileSync(resolve(output),JSON.stringify(evidence,null,2)+'\n');
process.stdout.write(JSON.stringify(evidence,null,2)+'\n');
