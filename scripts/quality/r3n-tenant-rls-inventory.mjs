#!/usr/bin/env node
/**
 * R3-N: real PostgreSQL RLS census, not production authorization proof.
 * Refuses every database except the disposable GitHub Actions test database.
 */
import {spawnSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const u=new URL(process.env.DATABASE_URL||'http://unconfigured.invalid');
const run=process.env.GITHUB_RUN_ID||'';
if(process.env.CI!=='true'||process.env.GITHUB_ACTIONS!=='true'||
 process.env.MARKETING_DB_INTEGRATION!=='1'||
 process.env.MARKETING_R3N_RLS_CI_ONLY!=='1'||
 !/^[0-9]{5,18}$/.test(run)||
 u.protocol!=='postgresql:'||u.hostname!=='localhost'||u.port!=='5432'||
 u.username!=='marketing_test'||u.pathname!=='/marketing_test')
 throw new Error('R3-N inventory refuses non-CI, nonlocal or non-disposable databases');
const query=[
 "SELECT COALESCE(json_agg(json_build_object(",
 " 'name',c.relname,'rls',c.relrowsecurity,'forced',c.relforcerowsecurity,",
 " 'policyCount',(SELECT COUNT(*) FROM pg_policies p",
 " WHERE p.schemaname='public' AND p.tablename=c.relname)",
 ") ORDER BY c.relname),'[]'::json)::text",
 "FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace",
 "WHERE n.nspname='public' AND c.relkind='r'",
 "AND (EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid",
 "AND a.attname='organizationId' AND a.attnum>0 AND NOT a.attisdropped)",
 "OR c.relname='AgencyGrant')"
].join(' ');
const proc=spawnSync('psql',['-X','-q','-t','-A','-v','ON_ERROR_STOP=1',
 '-h','localhost','-p','5432','-U','marketing_test','-d','marketing_test',
 '-c',query],{encoding:'utf8',maxBuffer:8*1024*1024,
 env:{...process.env,PGPASSWORD:decodeURIComponent(u.password)}});
if(proc.error||proc.status!==0)
 throw new Error('R3-N catalog query failed: '+String(proc.error||proc.stderr).slice(0,700));
const rows=JSON.parse(String(proc.stdout).trim());
const known=new Set();
if(!Array.isArray(rows)||rows.length<20)
 throw new Error('Incomplete PostgreSQL tenant table inventory');
for(const row of rows){
 if(!row||typeof row.name!=='string'||typeof row.rls!=='boolean'||
  typeof row.forced!=='boolean'||!Number.isInteger(row.policyCount)||
  known.has(row.name))
  throw new Error('Unexpected inventory row or duplicated table');
 known.add(row.name);
}
const protectedTables=[
 'AgencyGrant','Brand','AuthSession','MarketingMetricObservation',
 'TenantRoleDefinition','CreativeAsset','CreativeAssetRevision',
 'CampaignPublication','PublicationAttempt','KnowledgeDocument',
 'KnowledgeChunk','KnowledgeRelation','AgentKnowledgeMemory'
];
const byName=new Map(rows.map(x=>[x.name,x]));
const missing=protectedTables.filter(name=>{
 const row=byName.get(name);
 return !row||!row.rls||!row.forced||row.policyCount<1;
});
if(missing.length)
 throw new Error('FORCE RLS regression in protected tenant authority: '+missing.join(','));
const fullyProtected=rows.filter(x=>x.rls&&x.forced&&x.policyCount>0);
const uncovered=rows.filter(x=>!x.rls||!x.forced||x.policyCount<1)
 .map(x=>({name:x.name,enabled:x.rls,forced:x.forced,policyCount:x.policyCount}));
const rlsButNotForced=rows.filter(x=>x.rls&&!x.forced).map(x=>x.name);
const result={
 schema:'medsol-r3n-postgresql-tenant-rls-inventory-v1',
 runId:run,status:'DISPOSABLE_CI_INVENTORY_PASSED',
 auditedAt:new Date().toISOString(),
 source:'actual_postgresql_pg_class_pg_policies_public_base_tables_tenant_columns_plus_dual_tenant_agency_grant',
 releaseVerdict:'NOT_CERTIFIED',
 productionDatabaseInspected:false,
 tenantTableCount:rows.length,
 forceRlsTenantTableCount:fullyProtected.length,
 uncoveredTenantTableCount:uncovered.length,
 rlsButNotForced,
 forcedRlsRegressionGate:protectedTables,
 protectedTablesVerified:protectedTables.length,
 pendingRlsCoverage:uncovered,
 priorityUncoveredDomainTables:uncovered.filter(x=>[
  'Campaign','User','MarketingObjective','MarketingProduct',
  'WorkflowExecution','Approval','AuditEvent','CommandReceipt',
  'OutboxEvent','InboxEvent','BrainRun','AgentExecution'
 ].includes(x.name)),
 allTenantTablesForced:uncovered.length===0,
 independentPenetrationTestPassed:false,
 productionRtoRpoCertified:false,
 realProviderAccessEnabled:false
};
if(result.tenantTableCount!==result.forceRlsTenantTableCount+
 result.uncoveredTenantTableCount)throw new Error('RLS accounting invariant violated');
if(process.argv[2]!=='--output'||typeof process.argv[3]!=='string'||
 !process.argv[3].endsWith('.json'))
 throw new Error('Explicit JSON evidence output required');
writeFileSync(resolve(process.argv[3]),JSON.stringify(result,null,2)+'\n');
process.stdout.write(JSON.stringify({...result,pendingRlsCoverage:
 'See exact tables in the immutable CI evidence artifact'},null,2)+'\n');
