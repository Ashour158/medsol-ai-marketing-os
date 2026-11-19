#!/usr/bin/env node
/**
 * R3-K: executable pg_dump/pg_restore rehearsal against EPHEMERAL CI-only
 * PostgreSQL databases. This deliberately cannot run against an arbitrary
 * customer, developer or production database; there is no user data input.
 * Not a proof of production RPO, RTO, encrypted backups or cross-region failover.
 */
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

function requireSafety(){
 const u=new URL(process.env.DATABASE_URL||'http://unconfigured.invalid');
 const run=process.env.GITHUB_RUN_ID||'';
 if(process.env.CI!=='true'||process.env.GITHUB_ACTIONS!=='true'||
    process.env.MARKETING_DB_INTEGRATION!=='1'||
    process.env.MARKETING_DR_CI_ONLY!=='1'||
    !/^[0-9]{5,18}$/.test(run)||
    u.protocol!=='postgresql:'||
    u.hostname!=='localhost'||u.port!=='5432'||
    u.username!=='marketing_test'||u.pathname!=='/marketing_test')
  throw new Error('Refusing DR rehearsal: disposable localhost GitHub CI test DB only');
 return{url:u,run};
}
const {url,run}=requireSafety();
const base='marketing_r3k_'+run;
const source=base+'_source',target=base+'_restore';
const archive=join(tmpdir(),'medsol-r3k-dr-'+run+'-'+process.pid+'.dump');
const processEnv={...process.env,PGHOST:'localhost',PGPORT:'5432',
 PGUSER:'marketing_test',PGPASSWORD:decodeURIComponent(url.password)};
function exec(name,args,{input,env}={}){
 const child=spawnSync(name,args,{encoding:'utf8',maxBuffer:12*1024*1024,
  env:{...processEnv,...env},...(input?{input}:{})});
 if(child.error||child.status!==0)
  throw new Error(name+' failed, status '+child.status+': '+
   String(child.stderr||child.error).slice(0,3000));
 return String(child.stdout||'').trim();
}
function sql(db,query){
 return exec('psql',['-X','-q','-t','-A','-v','ON_ERROR_STOP=1',
  '-d',db,'-c',query]);
}
function sqlFile(db,sourceText){
 return exec('psql',['-X','-q','-t','-A','-v','ON_ERROR_STOP=1',
  '-d',db,'-f','-'],{input:sourceText});
}
function quote(v){return "'"+String(v).replaceAll("'","''")+"'";}
const orgs=['r3k-dr-tenant-alpha','r3k-dr-tenant-beta'];
function seed(){
 const statements=[];
 for(const [index,org] of orgs.entries()){
  const a=index===0?'a':'b',wf=org+'-workflow',agent='MKT-SCI-001';
  statements.push('BEGIN;',
   "SELECT set_config('app.marketing_tenant_id',"+quote(org)+',true);',
   'INSERT INTO "Organization" ("id","name") VALUES ('+quote(org)+','+quote('Synthetic tenant '+a)+');',
   'INSERT INTO "User" ("id","organizationId","email","name","role","oidcSubject") VALUES ('+
    quote(org+'-admin')+','+quote(org)+','+quote('synthetic-'+a+'@example.invalid')+
    ','+quote('Synthetic reviewer '+a)+",'ADMIN',"+quote(org+'-oidc')+');',
   'INSERT INTO "Agent" ("id","organizationId","name","capabilities") VALUES ('+
    quote(agent)+','+quote(org)+",'Synthetic science reviewer','[\"CHECK_EVIDENCE\"]'::jsonb);",
   'INSERT INTO "WorkflowExecution" ("id","organizationId","workflowType","status","currentStep","correlationId","input","leaseOwner","leaseExpiresAt","leaseGeneration") VALUES ('+
    quote(wf)+','+quote(org)+",'BLUEPRINT_OFFLINE_DAG','BLOCKED','UNCERTAIN_AGENT_STEP',"+
    quote(org+'-corr')+",'{\"offlineOnly\":true,\"externalEffectsAuthorized\":false}'::jsonb,"+
    quote('crashed-worker')+",CURRENT_TIMESTAMP-INTERVAL '2 hours',2);",
   'INSERT INTO "WorkflowStepExecution" ("id","organizationId","workflowExecutionId","stepKey","status","input","error") VALUES ('+
    quote(org+'-step')+','+quote(org)+','+quote(wf)+
    ",'science','OUTCOME_UNKNOWN','{\"offlineOnly\":true}'::jsonb,"+
    "'{\"automaticReplayAllowed\":false}'::jsonb);",
   'INSERT INTO "AgentExecution" ("id","organizationId","agentId","correlationId","causationId","input","decision","status","completedAt") VALUES ('+
    quote(org+'-agent-execution')+','+quote(org)+','+quote(agent)+','+quote(org+'-corr')+
    ','+quote(wf)+
    ",'{\"brainRunId\":null}'::jsonb,'{\"releaseEvidence\":{\"externalEffectsAuthorized\":false}}'::jsonb,'COMPLETED',CURRENT_TIMESTAMP);",
   'INSERT INTO "KnowledgeDocument" ("id","organizationId","sourceKey","title","contentDigest","createdBy") VALUES ('+
    quote(org+'-doc')+','+quote(org)+','+quote(org+'-source-key')+','+
    quote('Synthetic quarantined evidence '+a)+','+quote('sha256:'+'a'.repeat(64))+','+
    quote(org+'-admin')+');',
   'INSERT INTO "AuditEvent" ("id","organizationId","actorType","actorId","action","objectType","objectId","correlationId","after") VALUES ('+
    quote(org+'-audit')+','+quote(org)+",'SYSTEM','r3k-disposable-fixture','DR_OFFLINE_SEED','WorkflowExecution',"+
    quote(wf)+','+quote(org+'-corr')+
    ",'{\"simulationOnly\":true,\"externalEffectsAuthorized\":false}'::jsonb);",
   'INSERT INTO "OutboxEvent" ("id","organizationId","eventId","eventType","aggregateType","aggregateId","payload","correlationId") VALUES ('+
    quote(org+'-outbox')+','+quote(org)+','+quote(org+'-event')+
    ",'R3K_DISPOSABLE_INTERNAL','WorkflowExecution',"+quote(wf)+
    ",'{\"simulationOnly\":true,\"externalEffectsAuthorized\":false}'::jsonb,"+
    quote(org+'-corr')+');',
   'INSERT INTO "InboxEvent" ("id","organizationId","eventId","consumerName","status","processedAt") VALUES ('+
    quote(org+'-inbox')+','+quote(org)+','+quote(org+'-event')+
    ",'synthetic-dr-consumer','PROCESSED',CURRENT_TIMESTAMP);",
   'INSERT INTO "CommandReceipt" ("id","organizationId","commandId","commandType","correlationId","status","response") VALUES ('+
    quote(org+'-receipt')+','+quote(org)+','+quote(org+'-command')+
    ",'OfflineTest',"+quote(org+'-corr')+
    ",'COMPLETED','{\"replayed\":false,\"externalEffectsAuthorized\":false}'::jsonb);",
   'COMMIT;');
 }
 sqlFile(source,statements.join('\n'));
}
const tables=['Organization','User','Agent','AgentExecution',
 'WorkflowExecution','WorkflowStepExecution','KnowledgeDocument',
 'AuditEvent','OutboxEvent','InboxEvent','CommandReceipt'];
function snapshot(db){
 const result={};
 for(const table of tables){
  const key=table==='Organization'?'id':'organizationId';
  const list=orgs.map(quote).join(',');
  const query='SELECT count(*)::text || \':\' || md5(coalesce('+
   'jsonb_agg(to_jsonb(t) ORDER BY t."id")::text,\'[]\'))'+
   ' FROM "'+table+'" t WHERE t."'+key+'" IN ('+list+');';
  // PostgreSQL uses single-quoted strings; keep output stable across copies.
  const correct=query.replace("':'","':'");
  result[table]=sql(db,correct);
 }
 return result;
}
function checkRls(db){
 const objects=['KnowledgeDocument','KnowledgeChunk','KnowledgeRelation',
  'AgentKnowledgeMemory'];
 const clauses=objects.map(quote).join(',');
 const force=sql(db,'SELECT count(*) FROM pg_class WHERE relname IN ('+
  clauses+') AND relrowsecurity AND relforcerowsecurity;');
 if(Number(force)!==objects.length)
  throw new Error('FORCE RLS missing after restore on knowledge tables');
 const role='r3k_dr_reader_'+run;
 sql(db,'CREATE ROLE "'+role+'" NOLOGIN;');
 try{
  sql(db,'GRANT SELECT ON "KnowledgeDocument" TO "'+role+'";');
  const checks=sqlFile(db,[
   'BEGIN;',
   'SET LOCAL ROLE "'+role+'";',
   "SELECT 'none=' || count(*) FROM \"KnowledgeDocument\";",
   "SELECT set_config('app.marketing_tenant_id',"+quote(orgs[0])+",true);",
   "SELECT 'alpha=' || count(*) FROM \"KnowledgeDocument\";",
   "SELECT set_config('app.marketing_tenant_id',"+quote(orgs[1])+",true);",
   "SELECT 'beta=' || count(*) FROM \"KnowledgeDocument\";",
   'COMMIT;'
  ].join('\n')).split('\n').filter(x=>/^(none|alpha|beta)=/.test(x));
  if(checks.join('|')!=='none=0|alpha=1|beta=1')
   throw new Error('Restored RLS leaked tenants or failed isolation: '+checks.join('|'));
  return{forceRlsTables:objects.length,lowPrivilegeTenantProof:checks};
 }finally{
  sql(db,'REVOKE SELECT ON "KnowledgeDocument" FROM "'+role+'";');
  sql(db,'DROP ROLE "'+role+'";');
 }
}
let success=false;
try{
 exec('createdb',[source]);
 exec('createdb',[target]);
 const sourceUrl=new URL(url);
 sourceUrl.pathname='/'+source;
 exec('pnpm',['exec','prisma','migrate','deploy','--schema','prisma/schema.prisma'],
  {env:{DATABASE_URL:sourceUrl.toString()}});
 seed();
 const original=snapshot(source);
 for(const [table,value] of Object.entries(original)){
  if(!value.startsWith('2:'))
   throw new Error('Incomplete synthetic source evidence: '+table+'='+value);
 }
 // Same database format as production PostgreSQL; source is synthetic CI.
 exec('pg_dump',['--format=custom','--no-owner','--no-acl',
  '--file='+archive,'--dbname='+source]);
 const digest='sha256:'+createHash('sha256').update(readFileSync(archive)).digest('hex');
 exec('pg_restore',['--exit-on-error','--no-owner','--no-acl',
  '--dbname='+target,archive]);
 const restored=snapshot(target);
 if(JSON.stringify(original)!==JSON.stringify(restored))
  throw new Error('Restored tenant state diverged from source fingerprint');
 const targetUrl=new URL(url);targetUrl.pathname='/'+target;
 exec('pnpm',['exec','prisma','migrate','diff','--from-url',
  targetUrl.toString(),'--to-schema-datamodel','prisma/schema.prisma','--exit-code']);
 const rls=checkRls(target);
 const uncertain=sql(target,'SELECT count(*) FROM "WorkflowExecution" WHERE '+
  '"organizationId" IN ('+orgs.map(quote).join(',')+
  ") AND \"status\"='BLOCKED' AND \"currentStep\"='UNCERTAIN_AGENT_STEP';");
 const outbox=sql(target,'SELECT count(*) FROM "OutboxEvent" WHERE '+
  '"organizationId" IN ('+orgs.map(quote).join(',')+
  ') AND "publishedAt" IS NULL AND "attempts"=0;');
 if(uncertain!=='2'||outbox!=='2')
  throw new Error('Restored unknown-outcome ledger or unpublished outbox was mutated');
 for(const table of ['ModelUsage','ProviderCredential','CampaignPublication']){
  const count=sql(target,'SELECT count(*) FROM "'+table+'";');
  if(count!=='0')throw new Error('External effect or credentials unexpectedly present: '+table);
 }
 // Negative integrity control: a corrupted RESTORED test row must fail the
 // exact same fingerprint comparison. Never modify source or real data.
 sql(target,'UPDATE "WorkflowExecution" SET "currentStep"='+
  "'TAMPERED_BY_TEST' WHERE \"id\"="+quote(orgs[0]+'-workflow')+';');
 if(JSON.stringify(original)===JSON.stringify(snapshot(target)))
  throw new Error('Post-restore tampering was not detected');
 const evidence={
  runId:run,status:'DISPOSABLE_DRILL_PASSED',productionRestoreCertified:false,
  realProviderCredentialsUsed:false,externalEffectsAuthorized:false,
  independentPenetrationTest:false,backupSha256:digest,
  syntheticTenantCount:orgs.length,tableFingerprintsVerified:tables.length,
  restoredRowsByTable:Object.fromEntries(Object.entries(restored).map(
   ([key,value])=>[key,Number(value.split(':')[0])])),
  cleanTargetMigrationDiff:true,forceRls:rls,
  uncertainBlockedRunsRestored:Number(uncertain),
  undeliveredInternalEventsRestored:Number(outbox),
  tamperDetectionVerified:true,rpoRtoProductionCertified:false
 };
 writeFileSync('r3k-dr-evidence.json',JSON.stringify(evidence,null,2)+'\n');
 process.stdout.write(JSON.stringify(evidence,null,2)+'\n');
 success=true;
}finally{
 rmSync(archive,{force:true});
 for(const db of [target,source]){
  try{exec('dropdb',['--if-exists','--force',db]);}
  catch(error){process.stderr.write('Ephemeral cleanup warning: '+String(error)+'\n');}
 }
 if(!success)process.stderr.write('R3-K DR drill failed; no certification evidence emitted.\n');
}
